import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import dotenv from "dotenv";
import mammoth from "mammoth";
import { SUBJECT_CONFIG } from "@cah-qbank/domain";

import type { Prisma } from "../../app/src/lib/generated/prisma";
import { prisma } from "../lib/prisma";
import {
  resolveBlueprintCsvPath,
  resolveContentRoot,
  resolveLegacyNotesSourceDir,
  resolveLegacyQuestionSourceDir,
  resolveNotesSourceDir,
  resolveQuestionSourceDir,
} from "./moduleMap";

dotenv.config();

type ChunkCandidate = {
  text: string;
  sourceType: "pdf" | "docx";
  sourceRef: string;
  title: string | null;
  heading: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  metadata: Prisma.InputJsonValue;
};

type ExistingChunk = {
  id: string;
  text: string;
  sourceType: "pdf" | "docx" | "web";
  sourceRef: string;
  title: string | null;
  heading: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  metadata: Prisma.JsonValue;
};

const TARGET_TOKENS = 650;
const OVERLAP_TOKENS = 100;
const require = createRequire(__filename);

function estimateTokens(text: string) {
  return Math.max(1, Math.round(text.split(/\s+/).length * 0.75));
}

function moduleFromSourceRef(sourceRef: string) {
  const match = sourceRef.match(new RegExp(`${SUBJECT_CONFIG.moduleCodePrefix}[_\\s-]?(\\d{2})`, "i"));
  return match ? `${SUBJECT_CONFIG.moduleCodePrefix} ${match[1]}` : null;
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

async function walkFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        out.push(fullPath);
      }
    }
  }
  await walk(root);
  return out.sort();
}

function normalizeLineBreaks(value: string) {
  return value.replace(/\r/g, "").replace(/\u0007/g, "").replace(/\t/g, " ").replace(/\n{3,}/g, "\n\n").trim();
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
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = (content.items as Array<{ str?: string }>).map((item) => item.str ?? "").join(" ");
    pages.push({ page: i, text: normalizeLineBreaks(text) });
  }
  return pages;
}

function toRelativeSourceRef(contentRoot: string, filePath: string) {
  return path.relative(contentRoot, filePath).replace(/\\/g, "/");
}

function asRecord(value: Prisma.JsonValue | Prisma.InputJsonValue): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function contentHashFromMetadata(metadata: Prisma.JsonValue | Prisma.InputJsonValue, fallbackText: string) {
  const hash = asRecord(metadata).contentHash;
  if (typeof hash === "string" && hash.length > 0) return hash;
  return crypto.createHash("sha256").update(fallbackText).digest("hex").slice(0, 20);
}

function chunkOrdinalFromMetadata(metadata: Prisma.JsonValue | Prisma.InputJsonValue) {
  const record = asRecord(metadata);
  if (typeof record.chunkIndex === "number") return `d:${record.chunkIndex}`;
  if (typeof record.chunkIndexOnPage === "number") return `p:${record.chunkIndexOnPage}`;
  return "";
}

function buildChunkKey(
  sourceType: "pdf" | "docx" | "web",
  sourceRef: string,
  pageStart: number | null,
  pageEnd: number | null,
  heading: string | null,
  metadata: Prisma.JsonValue | Prisma.InputJsonValue,
  text: string,
) {
  const hash = contentHashFromMetadata(metadata, text);
  const ordinal = chunkOrdinalFromMetadata(metadata);
  return [sourceType, sourceRef, pageStart ?? "", pageEnd ?? "", heading ?? "", ordinal, hash].join("::");
}

function buildDocxChunks(contentRoot: string, filePath: string, text: string): ChunkCandidate[] {
  const sourceRef = toRelativeSourceRef(contentRoot, filePath);
  const moduleCode = moduleFromSourceRef(sourceRef);
  const title = path.basename(filePath);
  return chunkText(text).map((chunk, index, all) => ({
    text: chunk,
    sourceType: "docx",
    sourceRef,
    title,
    heading: null,
    pageStart: null,
    pageEnd: null,
    metadata: {
      moduleCode,
      chunkIndex: index,
      totalChunks: all.length,
      tokenEstimate: estimateTokens(chunk),
      contentHash: crypto.createHash("sha256").update(chunk).digest("hex").slice(0, 20),
    },
  }));
}

function buildPdfChunks(contentRoot: string, filePath: string, pages: Array<{ page: number; text: string }>): ChunkCandidate[] {
  const sourceRef = toRelativeSourceRef(contentRoot, filePath);
  const moduleCode = moduleFromSourceRef(sourceRef);
  const title = path.basename(filePath);
  const chunks: ChunkCandidate[] = [];
  for (const page of pages) {
    if (!page.text.trim()) continue;
    const split = chunkText(page.text);
    for (let index = 0; index < split.length; index += 1) {
      const text = split[index];
      chunks.push({
        text,
        sourceType: "pdf",
        sourceRef,
        title,
        heading: `Page ${page.page}`,
        pageStart: page.page,
        pageEnd: page.page,
        metadata: {
          moduleCode,
          page: page.page,
          chunkIndexOnPage: index,
          chunksOnPage: split.length,
          tokenEstimate: estimateTokens(text),
          contentHash: crypto.createHash("sha256").update(text).digest("hex").slice(0, 20),
        },
      });
    }
  }
  return chunks;
}

async function collectRoots(contentRoot: string) {
  const roots = [
    resolveNotesSourceDir(contentRoot),
    resolveLegacyNotesSourceDir(contentRoot),
    resolveQuestionSourceDir(contentRoot),
    resolveLegacyQuestionSourceDir(contentRoot),
    path.dirname(resolveBlueprintCsvPath(contentRoot)),
  ];
  const existing: string[] = [];
  for (const root of roots) {
    try {
      const stat = await fs.stat(root);
      if (stat.isDirectory()) existing.push(root);
    } catch {}
  }
  return Array.from(new Set(existing));
}

async function collectChunkCandidates(contentRoot: string) {
  const roots = await collectRoots(contentRoot);
  const files = (await Promise.all(roots.map((root) => walkFiles(root)))).flat().sort();
  const filtered = files.filter((filePath) => /\.(pdf|docx)$/i.test(filePath));

  const candidates: ChunkCandidate[] = [];
  const skippedFiles: Array<{ file: string; reason: string }> = [];
  for (const filePath of filtered) {
    try {
      if (filePath.toLowerCase().endsWith(".docx")) {
        const text = await extractDocxText(filePath);
        candidates.push(...buildDocxChunks(contentRoot, filePath, text));
      } else if (filePath.toLowerCase().endsWith(".pdf")) {
        const pages = await extractPdfPages(filePath);
        candidates.push(...buildPdfChunks(contentRoot, filePath, pages));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      skippedFiles.push({
        file: toRelativeSourceRef(contentRoot, filePath),
        reason: message,
      });
    }
  }
  return { candidates, skippedFiles };
}

async function ingestContentChunks() {
  const contentRoot = resolveContentRoot();
  const { candidates, skippedFiles } = await collectChunkCandidates(contentRoot);
  const existing = await prisma.contentChunk.findMany({
    select: { id: true, text: true, sourceType: true, sourceRef: true, title: true, heading: true, pageStart: true, pageEnd: true, metadata: true },
  }) as ExistingChunk[];

  const existingByKey = new Map(existing.map((chunk) => [buildChunkKey(chunk.sourceType, chunk.sourceRef, chunk.pageStart, chunk.pageEnd, chunk.heading, chunk.metadata, chunk.text), chunk]));
  let created = 0;
  let updated = 0;

  for (const candidate of candidates) {
    const key = buildChunkKey(candidate.sourceType, candidate.sourceRef, candidate.pageStart, candidate.pageEnd, candidate.heading, candidate.metadata, candidate.text);
    const found = existingByKey.get(key);
    if (found) {
      await prisma.contentChunk.update({
        where: { id: found.id },
        data: {
          text: candidate.text,
          title: candidate.title,
          heading: candidate.heading,
          pageStart: candidate.pageStart,
          pageEnd: candidate.pageEnd,
          metadata: candidate.metadata,
        },
      });
      updated += 1;
    } else {
      await prisma.contentChunk.create({
        data: {
          text: candidate.text,
          sourceType: candidate.sourceType,
          sourceRef: candidate.sourceRef,
          title: candidate.title,
          heading: candidate.heading,
          pageStart: candidate.pageStart,
          pageEnd: candidate.pageEnd,
          metadata: candidate.metadata,
        },
      });
      created += 1;
    }
  }

  const report = { contentRoot, discoveredChunks: candidates.length, created, updated, skippedFiles };
  console.log(JSON.stringify(report, null, 2));
}

ingestContentChunks().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
