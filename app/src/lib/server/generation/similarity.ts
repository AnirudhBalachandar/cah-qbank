import crypto from "node:crypto";

import OpenAI from "openai";

import { prisma } from "@/lib/db";

const CORPUS_LIMIT = 400;
const CORPUS_EMBED_BATCH_SIZE = 100;
const CORPUS_EMBEDDING_CACHE_LIMIT = 4000;
const SIMILARITY_OVERLAP_THRESHOLD = 0.35;
const SIMILARITY_COSINE_THRESHOLD = 0.92;

type SimilarityCorpusRow = {
  id: string;
  stem: string;
  source: unknown;
  embedding: number[];
  embeddingCacheKey: string;
};

export type SimilarityContext = {
  rows: SimilarityCorpusRow[];
  client: OpenAI;
  model: string;
  candidateEmbeddingCache: Map<string, number[]>;
};

export type SimilarityEvaluation = {
  maxOverlap: number;
  overlapQuestionId: string | null;
  maxCosine: number;
  cosineQuestionId: string | null;
  rejected: boolean;
};

const corpusEmbeddingCache = new Map<string, number[]>();

function normalizeStem(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function buildEmbeddingCacheKey(id: string, stem: string) {
  const normalized = normalizeStem(stem);
  const hash = crypto.createHash("sha1").update(normalized).digest("hex");
  return `${id}:${hash}`;
}

function buildStemHash(stem: string) {
  return crypto.createHash("sha1").update(normalizeStem(stem)).digest("hex");
}

function asObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function parsePersistedEmbedding(source: unknown, stem: string) {
  const sourceRecord = asObject(source);
  const hash = sourceRecord.similarityEmbeddingHash;
  const embedding = sourceRecord.similarityEmbedding;
  if (hash !== buildStemHash(stem) || !Array.isArray(embedding)) {
    return null;
  }

  const parsed = embedding
    .map((value) => (typeof value === "number" && Number.isFinite(value) ? value : null))
    .filter((value): value is number => value !== null);
  return parsed.length > 0 ? parsed : null;
}

function normalizeEmbedding(embedding: number[]) {
  return embedding.map((value) => Number(value.toFixed(8)));
}

function getCachedCorpusEmbedding(cacheKey: string) {
  const embedding = corpusEmbeddingCache.get(cacheKey);
  if (!embedding) return null;

  // Refresh insertion order for simple LRU behavior.
  corpusEmbeddingCache.delete(cacheKey);
  corpusEmbeddingCache.set(cacheKey, embedding);
  return embedding;
}

function setCachedCorpusEmbedding(cacheKey: string, embedding: number[]) {
  corpusEmbeddingCache.set(cacheKey, embedding);
  while (corpusEmbeddingCache.size > CORPUS_EMBEDDING_CACHE_LIMIT) {
    const firstKey = corpusEmbeddingCache.keys().next().value;
    if (!firstKey) break;
    corpusEmbeddingCache.delete(firstKey);
  }
}

function trigrams(text: string) {
  const normalized = normalizeStem(text);
  const grams = new Set<string>();
  for (let i = 0; i < normalized.length - 2; i += 1) {
    grams.add(normalized.slice(i, i + 3));
  }
  return grams;
}

export function trigramOverlap(a: string, b: string) {
  const aGrams = trigrams(a);
  const bGrams = trigrams(b);
  if (aGrams.size === 0 || bGrams.size === 0) return 0;

  let intersection = 0;
  for (const gram of aGrams) {
    if (bGrams.has(gram)) intersection += 1;
  }

  // Use a symmetric denominator so short legacy stems do not dominate overlap.
  return intersection / Math.max(aGrams.size, bGrams.size);
}

export function cosineSimilarity(a: number[], b: number[]) {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for similarity check");
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function getEmbeddingModel() {
  return process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
}

export function isSimilarityRejected(maxOverlap: number, maxCosine: number) {
  return maxOverlap >= SIMILARITY_OVERLAP_THRESHOLD || maxCosine >= SIMILARITY_COSINE_THRESHOLD;
}

async function embedTexts(client: OpenAI, model: string, input: string[]) {
  if (input.length === 0) {
    return [] as number[][];
  }

  const response = await client.embeddings.create({
    model,
    input,
  });

  return response.data.map((item) => item.embedding);
}

export async function createSimilarityContext(limit = CORPUS_LIMIT): Promise<SimilarityContext> {
  const existing = await prisma.question.findMany({
    where: { status: "published" },
    orderBy: { createdAt: "desc" },
    select: { id: true, stem: true, source: true },
    take: Math.max(1, Math.min(limit, CORPUS_LIMIT)),
  });

  const client = getOpenAIClient();
  const model = getEmbeddingModel();
  const rows: SimilarityCorpusRow[] = existing.map((row) => ({
    id: row.id,
    stem: row.stem,
    source: row.source,
    embedding: [],
    embeddingCacheKey: buildEmbeddingCacheKey(row.id, row.stem),
  }));

  const missingRows: SimilarityCorpusRow[] = [];
  for (const row of rows) {
    const cached = getCachedCorpusEmbedding(row.embeddingCacheKey);
    if (cached) {
      row.embedding = cached;
      continue;
    }

    const persisted = parsePersistedEmbedding(row.source, row.stem);
    if (persisted) {
      row.embedding = persisted;
      setCachedCorpusEmbedding(row.embeddingCacheKey, persisted);
    } else {
      missingRows.push(row);
    }
  }

  for (let i = 0; i < missingRows.length; i += CORPUS_EMBED_BATCH_SIZE) {
    const batch = missingRows.slice(i, i + CORPUS_EMBED_BATCH_SIZE);
    const embeddings = await embedTexts(client, model, batch.map((row) => row.stem));
    for (let j = 0; j < batch.length; j += 1) {
      const embedding = normalizeEmbedding(embeddings[j] ?? []);
      batch[j].embedding = embedding;
      if (embedding.length > 0) {
        setCachedCorpusEmbedding(batch[j].embeddingCacheKey, embedding);
      }
    }
  }

  for (const row of missingRows) {
    if (row.embedding.length === 0) continue;
    const sourceRecord = asObject(row.source);
    await prisma.question.update({
      where: { id: row.id },
      data: {
        source: {
          ...sourceRecord,
          similarityEmbeddingHash: buildStemHash(row.stem),
          similarityEmbedding: row.embedding,
        },
      },
    });
  }

  return {
    rows,
    client,
    model,
    candidateEmbeddingCache: new Map<string, number[]>(),
  };
}

function findMaxOverlapForStem(stem: string, rows: SimilarityCorpusRow[]) {
  let maxOverlap = 0;
  let overlapQuestionId: string | null = null;

  for (const row of rows) {
    const overlap = trigramOverlap(stem, row.stem);
    if (overlap > maxOverlap) {
      maxOverlap = overlap;
      overlapQuestionId = row.id;
    }
  }

  return { maxOverlap, overlapQuestionId };
}

async function embedCandidateStems(stems: string[], context: SimilarityContext) {
  const embeddingsByKey = new Map<string, number[]>();
  const missing: Array<{ key: string; stem: string }> = [];

  for (const stem of stems) {
    const key = normalizeStem(stem);
    const cached = context.candidateEmbeddingCache.get(key);
    if (cached && cached.length > 0) {
      embeddingsByKey.set(key, cached);
      continue;
    }
    missing.push({ key, stem });
  }

  const dedupedMissing = Array.from(new Map(missing.map((entry) => [entry.key, entry])).values());
  for (let i = 0; i < dedupedMissing.length; i += CORPUS_EMBED_BATCH_SIZE) {
    const batch = dedupedMissing.slice(i, i + CORPUS_EMBED_BATCH_SIZE);
    const vectors = await embedTexts(context.client, context.model, batch.map((entry) => entry.stem));
    for (let j = 0; j < batch.length; j += 1) {
      const vector = normalizeEmbedding(vectors[j] ?? []);
      if (vector.length === 0) continue;
      embeddingsByKey.set(batch[j].key, vector);
      context.candidateEmbeddingCache.set(batch[j].key, vector);
    }
  }

  return embeddingsByKey;
}

export async function evaluateSimilarities(stems: string[], context?: SimilarityContext): Promise<SimilarityEvaluation[]> {
  if (stems.length === 0) return [];
  const activeContext = context ?? (await createSimilarityContext());
  const overlapEvaluations = stems.map((stem) => ({
    stem,
    ...findMaxOverlapForStem(stem, activeContext.rows),
  }));

  const stemsRequiringCosine = overlapEvaluations
    .filter((evaluation) => !isSimilarityRejected(evaluation.maxOverlap, 0))
    .map((evaluation) => evaluation.stem);
  const embeddedCandidates = await embedCandidateStems(stemsRequiringCosine, activeContext);

  const results: SimilarityEvaluation[] = [];
  for (const evaluation of overlapEvaluations) {
    if (isSimilarityRejected(evaluation.maxOverlap, 0)) {
      results.push({
        maxOverlap: evaluation.maxOverlap,
        overlapQuestionId: evaluation.overlapQuestionId,
        maxCosine: 0,
        cosineQuestionId: null,
        rejected: true,
      });
      continue;
    }

    const candidateKey = normalizeStem(evaluation.stem);
    const targetVector = embeddedCandidates.get(candidateKey) ?? [];

    let maxCosine = 0;
    let cosineQuestionId: string | null = null;

    for (const row of activeContext.rows) {
      const cosine = cosineSimilarity(targetVector, row.embedding);
      if (cosine > maxCosine) {
        maxCosine = cosine;
        cosineQuestionId = row.id;
      }
    }

    results.push({
      maxOverlap: evaluation.maxOverlap,
      overlapQuestionId: evaluation.overlapQuestionId,
      maxCosine,
      cosineQuestionId,
      rejected: isSimilarityRejected(evaluation.maxOverlap, maxCosine),
    });
  }

  return results;
}

export async function evaluateSimilarity(stem: string, context?: SimilarityContext): Promise<SimilarityEvaluation> {
  const [result] = await evaluateSimilarities([stem], context);
  return result;
}
