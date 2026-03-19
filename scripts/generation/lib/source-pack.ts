import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import mammoth from "mammoth";

import { type SourcePack, sourcePackSchema, type WorkflowBatch, type WorkflowManifest } from "./contracts";
import { resolveWorkflowPath } from "./manifest";

const require = createRequire(__filename);
const TARGET_TOKENS = 260;
const OVERLAP_TOKENS = 40;
const MAX_EXCERPT_WORDS = 140;
const SOURCE_PACK_CACHE_VERSION = 2;

type SourceChunk = {
  text: string;
  sourceRef: string;
  title: string;
  heading: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  metadata: {
    priorityRole: string;
    relativePath: string;
    fileHash: string;
  };
};

type SourceFileDescriptor = {
  absolutePath: string;
  relativePath: string;
  title: string;
  role: "primary_notes" | "secondary_notes";
};

function isSourcePackRole(role: WorkflowManifest["sourceFiles"][number]["role"]): role is SourceFileDescriptor["role"] {
  return role === "primary_notes" || role === "secondary_notes";
}

function estimateTokens(text: string) {
  return Math.max(1, Math.round(text.split(/\s+/).length * 0.75));
}

function normalizeLineBreaks(value: string) {
  return value.replace(/\r/g, "").replace(/\u0007/g, "").replace(/\t/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/[`*_>#()[\]{}:;,.!?/\\-]+/g, " ")
    .replace(/\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string) {
  return normalizeText(text)
    .split(" ")
    .filter((token) => token.length >= 3);
}

function chunkText(text: string) {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const chunks: string[] = [];
  if (words.length === 0) return chunks;

  const step = Math.max(120, TARGET_TOKENS - OVERLAP_TOKENS);
  for (let start = 0; start < words.length; start += step) {
    const slice = words.slice(start, start + TARGET_TOKENS);
    if (slice.length === 0) break;
    chunks.push(slice.join(" "));
    if (start + TARGET_TOKENS >= words.length) break;
  }
  return chunks;
}

function clipWords(text: string, maxWords = MAX_EXCERPT_WORDS) {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length <= maxWords) {
    return words.join(" ");
  }
  return `${words.slice(0, maxWords).join(" ")} ...`;
}

async function fileHash(filePath: string) {
  const bytes = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 20);
}

async function extractDocxText(filePath: string) {
  const result = await mammoth.extractRawText({ path: filePath });
  return normalizeLineBreaks(result.value);
}

async function extractPdfPages(filePath: string) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfjsPackagePath = path.dirname(require.resolve("pdfjs-dist/package.json"));
  const standardFontDataUrl = `${pathToFileURL(path.join(pdfjsPackagePath, "standard_fonts")).href}/`;
  const bytes = await fs.readFile(filePath);
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl,
  }).promise;

  const pages: Array<{ page: number; text: string }> = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = (content.items as Array<{ str?: string }>).map((item) => item.str ?? "").join(" ");
    pages.push({ page: pageNumber, text: normalizeLineBreaks(text) });
  }
  return pages;
}

function buildDocxChunks(file: SourceFileDescriptor, text: string, hash: string): SourceChunk[] {
  return chunkText(text).map((chunk) => ({
    text: chunk,
    sourceRef: file.relativePath,
    title: file.title,
    heading: null,
    pageStart: null,
    pageEnd: null,
    metadata: {
      priorityRole: file.role,
      relativePath: file.relativePath,
      fileHash: hash,
    },
  }));
}

function buildPdfChunks(file: SourceFileDescriptor, pages: Array<{ page: number; text: string }>, hash: string): SourceChunk[] {
  const chunks: SourceChunk[] = [];

  for (const page of pages) {
    if (!page.text.trim()) continue;
    for (const chunk of chunkText(page.text)) {
      chunks.push({
        text: chunk,
        sourceRef: file.relativePath,
        title: file.title,
        heading: `Page ${page.page}`,
        pageStart: page.page,
        pageEnd: page.page,
        metadata: {
          priorityRole: file.role,
          relativePath: file.relativePath,
          fileHash: hash,
        },
      });
    }
  }

  return chunks;
}

async function collectSourceChunks(file: SourceFileDescriptor): Promise<SourceChunk[]> {
  const hash = await fileHash(file.absolutePath);
  if (file.absolutePath.toLowerCase().endsWith(".docx")) {
    return buildDocxChunks(file, await extractDocxText(file.absolutePath), hash);
  }
  if (file.absolutePath.toLowerCase().endsWith(".pdf")) {
    return buildPdfChunks(file, await extractPdfPages(file.absolutePath), hash);
  }
  return [];
}

function sourceFilesForWorkflow(repoRoot: string, manifest: WorkflowManifest) {
  const files: SourceFileDescriptor[] = [];
  for (const file of manifest.sourceFiles) {
    if (!isSourcePackRole(file.role)) continue;
    files.push({
      absolutePath: resolveWorkflowPath(repoRoot, file.path),
      relativePath: file.path,
      title: path.basename(file.path),
      role: file.role,
    });
  }
  return files;
}

function scoreChunk({
  chunk,
  queryTokens,
  noteTokens,
  subtopicTokens,
  pageBoosts,
}: {
  chunk: SourceChunk;
  queryTokens: string[];
  noteTokens: string[];
  subtopicTokens: string[];
  pageBoosts: Set<number>;
}) {
  const haystack = tokenize([chunk.title, chunk.heading ?? "", chunk.text].join(" "));
  const haystackSet = new Set(haystack);

  let score = 0;
  for (const token of queryTokens) {
    if (haystackSet.has(token)) score += 2.5;
  }
  for (const token of noteTokens) {
    if (haystackSet.has(token)) score += 3.5;
  }
  for (const token of subtopicTokens) {
    if (haystackSet.has(token)) score += 1.5;
  }

  if (chunk.metadata.priorityRole === "primary_notes") score += 4;
  if (chunk.metadata.priorityRole === "secondary_notes") score += 1;
  if (chunk.pageStart && pageBoosts.has(chunk.pageStart)) score += 6;

  const density = Math.min(estimateTokens(chunk.text) / TARGET_TOKENS, 1);
  return Number((score + density).toFixed(4));
}

function filterChunksByPageHints(chunks: SourceChunk[], pageBoosts: Set<number>) {
  if (pageBoosts.size === 0) {
    return chunks;
  }

  const primaryMatches = chunks.filter(
    (chunk) => chunk.metadata.priorityRole === "primary_notes" && chunk.pageStart !== null && pageBoosts.has(chunk.pageStart),
  );
  if (primaryMatches.length > 0) {
    return primaryMatches;
  }

  const secondaryMatches = chunks.filter(
    (chunk) => chunk.metadata.priorityRole === "secondary_notes" && chunk.pageStart !== null && pageBoosts.has(chunk.pageStart),
  );
  if (secondaryMatches.length > 0) {
    return secondaryMatches;
  }

  return chunks;
}

function extractPageHints(sourcePriorityNotes: string) {
  const pageBoosts = new Set<number>();
  for (const match of sourcePriorityNotes.matchAll(/pp?\.\s*(\d+)(?:\s*[-–]\s*(\d+))?/gi)) {
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    for (let page = start; page <= end; page += 1) {
      pageBoosts.add(page);
    }
  }
  return pageBoosts;
}

function dedupeChunks(chunks: SourceChunk[]) {
  const seen = new Set<string>();
  return chunks.filter((chunk) => {
    const key = [
      chunk.sourceRef,
      chunk.pageStart ?? "",
      chunk.pageEnd ?? "",
      crypto.createHash("sha1").update(chunk.text).digest("hex").slice(0, 16),
    ].join("::");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function loadOrBuildChunkCache({
  repoRoot,
  manifest,
}: {
  repoRoot: string;
  manifest: WorkflowManifest;
}) {
  const cachePath = path.join(repoRoot, manifest.artifactDirs.raw, manifest.workflowId, "source-file-cache.json");
  const files = sourceFilesForWorkflow(repoRoot, manifest);
  const signatures = await Promise.all(
    files.map(async (file) => ({
      relativePath: file.relativePath,
      fileHash: await fileHash(file.absolutePath),
    })),
  );

  try {
    const raw = await fs.readFile(cachePath, "utf8");
    const parsed = JSON.parse(raw) as {
      version?: number;
      signatures: Array<{ relativePath: string; fileHash: string }>;
      chunks: SourceChunk[];
    };
    const currentKey = JSON.stringify(signatures);
    const cachedKey = JSON.stringify(parsed.signatures);
    if (parsed.version === SOURCE_PACK_CACHE_VERSION && currentKey === cachedKey) {
      return parsed.chunks;
    }
  } catch {
    // Rebuild below.
  }

  const chunks = dedupeChunks((await Promise.all(files.map((file) => collectSourceChunks(file)))).flat());
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify({ version: SOURCE_PACK_CACHE_VERSION, signatures, chunks }, null, 2), "utf8");
  return chunks;
}

export async function buildSourcePack({
  repoRoot,
  manifest,
  batch,
  limit = 6,
}: {
  repoRoot: string;
  manifest: WorkflowManifest;
  batch: WorkflowBatch;
  limit?: number;
}): Promise<SourcePack> {
  const chunks = await loadOrBuildChunkCache({ repoRoot, manifest });
  const queryTokens = tokenize([batch.curriculumArea, batch.topicCluster, ...batch.subtopics].join(" "));
  const noteTokens = tokenize(batch.sourcePriorityNotes);
  const subtopicTokens = tokenize(batch.subtopics.join(" "));
  const pageBoosts = extractPageHints(batch.sourcePriorityNotes);
  const candidateChunks = filterChunksByPageHints(chunks, pageBoosts);

  const scored = candidateChunks
    .map((chunk) => ({
      chunk,
      score: scoreChunk({ chunk, queryTokens, noteTokens, subtopicTokens, pageBoosts }),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const selected: typeof scored = [];
  const seenPages = new Set<number>();
  for (const entry of scored) {
    const page = entry.chunk.pageStart ?? entry.chunk.pageEnd;
    if (page !== null && seenPages.has(page)) {
      continue;
    }
    selected.push(entry);
    if (page !== null) {
      seenPages.add(page);
    }
    if (selected.length >= limit) {
      break;
    }
  }

  if (selected.length < Math.min(limit, scored.length)) {
    for (const entry of scored) {
      if (selected.includes(entry)) continue;
      selected.push(entry);
      if (selected.length >= limit) {
        break;
      }
    }
  }

  return sourcePackSchema.parse({
    workflowId: manifest.workflowId,
    batchId: batch.batchId,
    query: [batch.curriculumArea, batch.topicCluster, batch.sourcePriorityNotes, ...batch.subtopics].join(" ; "),
    sourcePriorityNotes: batch.sourcePriorityNotes,
    subtopics: batch.subtopics,
    retrievedAt: new Date().toISOString(),
    items: selected.map(({ chunk, score }) => ({
      sourceRef: chunk.title,
      title: chunk.title,
      heading: chunk.heading,
      pageStart: chunk.pageStart,
      pageEnd: chunk.pageEnd,
      similarity: score,
      excerpt: clipWords(chunk.text),
    })),
  });
}
