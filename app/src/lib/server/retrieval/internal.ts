import OpenAI from "openai";

import { prisma } from "@/lib/db";
import {
  INTERNAL_SOURCE_TYPES,
  resolveRetrievalSourceTypes,
  type RetrievalSourceType,
} from "@/lib/server/retrieval/source-types";

export type RetrievedChunk = {
  id: string;
  text: string;
  sourceType: "pdf" | "docx" | "web";
  sourceRef: string;
  title: string | null;
  heading: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  similarity: number;
  metadata: Record<string, unknown>;
};

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for retrieval.");
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function getEmbeddingModel() {
  return process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
}

function vectorLiteral(values: number[]) {
  const normalized = values.map((value) => Number(value.toFixed(8)));
  return `[${normalized.join(",")}]`;
}

export async function embedText(text: string) {
  const client = getOpenAIClient();
  const response = await client.embeddings.create({
    model: getEmbeddingModel(),
    input: text,
  });
  return response.data[0]?.embedding ?? [];
}

export function resolveEffectiveRetrievalSourceTypes({
  sourceTypes,
  allowWebSources = false,
}: {
  sourceTypes?: ReadonlyArray<RetrievalSourceType>;
  allowWebSources?: boolean;
}) {
  const resolved = resolveRetrievalSourceTypes(sourceTypes);
  if (allowWebSources) {
    return resolved;
  }

  const internalOnly = resolved.filter((sourceType) => sourceType !== "web");
  return internalOnly.length > 0 ? internalOnly : [...INTERNAL_SOURCE_TYPES];
}

export async function retrieveInternalChunks({
  query,
  limit = 8,
  sourceTypes,
  allowWebSources = false,
}: {
  query: string;
  limit?: number;
  sourceTypes?: ReadonlyArray<RetrievalSourceType>;
  allowWebSources?: boolean;
}): Promise<RetrievedChunk[]> {
  const embedding = await embedText(query);
  if (embedding.length === 0) {
    return [];
  }

  const literal = vectorLiteral(embedding);
  const resolvedSourceTypes = resolveEffectiveRetrievalSourceTypes({ sourceTypes, allowWebSources });
  const clampedLimit = Math.max(1, Math.min(limit, 30));
  const rows = await prisma.$queryRawUnsafe<Array<{
    id: string;
    text: string;
    sourceType: "pdf" | "docx" | "web";
    sourceRef: string;
    title: string | null;
    heading: string | null;
    pageStart: number | null;
    pageEnd: number | null;
    similarity: number;
    metadata: Record<string, unknown>;
  }>>(
    `
      SELECT
        id,
        text,
        "sourceType",
        "sourceRef",
        title,
        heading,
        "pageStart",
        "pageEnd",
        (1 - (embedding <=> '${literal}'::vector))::float AS similarity,
        metadata
      FROM "ContentChunk"
      WHERE embedding IS NOT NULL
        AND "sourceType" = ANY($2::"SourceType"[])
      ORDER BY embedding <=> $1::vector
      LIMIT $3
    `,
    literal,
    resolvedSourceTypes,
    clampedLimit,
  );

  return rows;
}
