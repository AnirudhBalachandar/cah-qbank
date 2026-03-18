import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import dotenv from "dotenv";
import OpenAI from "openai";

import { prisma } from "../../app/src/lib/db";
import { evaluateSimilarity, trigramOverlap, createSimilarityContext } from "../../app/src/lib/server/generation/similarity";
import { validateGeneratedPayload, type GeneratedQuestionPayload } from "../../app/src/lib/server/generation/validator";

dotenv.config();

type SourceKey = "doc" | "pdf";
type SplitMode = "content-proportional" | "equal";
type StrictnessMode = "strict_internal";

type CliOptions = {
  docPath: string;
  pdfPath: string;
  count: number;
  split: SplitMode;
  outputPath: string;
  strictness: StrictnessMode;
  persistDb: boolean;
  maxAttempts: number | null;
};

type SourceChunk = {
  sourceKey: SourceKey;
  sourceName: string;
  sourcePath: string;
  locatorLabel: string;
  locatorValue: number;
  text: string;
  tokenEstimate: number;
};

type SourceState = {
  key: SourceKey;
  sourceName: string;
  sourcePath: string;
  chunks: SourceChunk[];
  cursor: number;
  tokenCount: number;
  quota: number;
  accepted: number;
};

type AcceptedQuestion = {
  sourceKey: SourceKey;
  sourceName: string;
  question: GeneratedQuestionPayload["questions"][number];
  similarity: {
    maxOverlap: number;
    overlapQuestionId: string | null;
    maxCosine: number;
    cosineQuestionId: string | null;
  };
};

type AttemptLog = {
  attempt: number;
  sourceKey: SourceKey;
  requested: number;
  validated: number;
  accepted: number;
  rejected: number;
  errors: string[];
};

type SourceQuota = {
  docQuota: number;
  pdfQuota: number;
};

type GateOptions = {
  allowedSourceNames: ReadonlySet<string>;
  targetSourceName: string;
};

const MAX_BATCH_SIZE = 10;
const MAX_CONTEXT_CHUNKS = 12;
const CHUNK_TARGET_WORDS = 210;
const CHUNK_OVERLAP_WORDS = 36;
const IN_RUN_DUPLICATE_THRESHOLD = 0.35;
const DEFAULT_TOTAL_QUESTIONS = 100;
const DEFAULT_STRICTNESS: StrictnessMode = "strict_internal";
const DISCLAIMER = "Education-only, not medical advice.";
const PLACEHOLDER_PATTERN = /\?{3,}|(?:^|\b)(?:tbd|placeholder|lorem ipsum|n\/a)(?:\b|$)/i;
const STYLE_SPEC_CANDIDATES = [
  path.join(process.cwd(), "docs", "style_spec.md"),
  path.join(process.cwd(), "..", "docs", "style_spec.md"),
];
const OPENAI_DEFAULT_MODEL = "gpt-5.1";

const GENERATED_QUESTION_JSON_SCHEMA_FOR_RESPONSES = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "stem_markdown",
          "options",
          "correctKey",
          "explanation_markdown",
          "why_others_wrong",
          "key_takeaways",
          "tags",
          "moduleCode",
          "difficulty",
          "ausScore",
          "citations",
        ],
        properties: {
          stem_markdown: { type: "string" },
          options: {
            type: "array",
            minItems: 5,
            maxItems: 5,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["key", "text"],
              properties: {
                key: { type: "string", enum: ["A", "B", "C", "D", "E"] },
                text: { type: "string" },
              },
            },
          },
          correctKey: { type: "string", enum: ["A", "B", "C", "D", "E"] },
          explanation_markdown: { type: "string" },
          why_others_wrong: {
            type: "object",
            additionalProperties: { type: "string" },
          },
          key_takeaways: {
            type: "array",
            minItems: 3,
            maxItems: 8,
            items: { type: "string" },
          },
          tags: {
            type: "array",
            minItems: 1,
            items: { type: "string" },
          },
          moduleCode: { type: ["string", "null"] },
          difficulty: { type: ["string", "null"], enum: ["Basic", "Intermediate", "Hard", null] },
          ausScore: { type: ["number", "null"] },
          citations: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["type", "source", "page", "url", "title"],
              properties: {
                type: { type: "string", enum: ["internal", "external"] },
                source: { type: ["string", "null"] },
                page: { type: ["number", "null"] },
                url: { type: ["string", "null"] },
                title: { type: ["string", "null"] },
              },
            },
          },
        },
      },
    },
  },
} as const;

function printUsage() {
  console.log(
    [
      "Usage:",
      "  tsx scripts/generation/generate_sourced_sba_docx.ts --doc <path> --pdf <path> [options]",
      "",
      "Options:",
      "  --doc <absolute path>                                Source DOC file",
      "  --pdf <absolute path>                                Source PDF file",
      "  --count <int>                                        Total question count (default: 100)",
      "  --split <content-proportional|equal>                 Source allocation mode (default: content-proportional)",
      "  --output <path>                                      Output DOCX path",
      "  --strictness <strict_internal>                       Fixed strictness mode (default: strict_internal)",
      "  --persist-db <true|false>                            Persist generated draft questions to DB (default: false)",
      "  --max-attempts <int>                                 Optional generation attempt cap",
      "  --help                                               Show this help message",
    ].join("\n"),
  );
}

function parseBoolean(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

function parseArgs(argv: string[]): CliOptions {
  const args = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help") {
      printUsage();
      process.exit(0);
    }

    if (!item.startsWith("--")) {
      throw new Error(`Unexpected argument: ${item}`);
    }

    const [flag, inlineValue] = item.split("=", 2);
    if (inlineValue !== undefined) {
      args.set(flag, inlineValue);
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for ${flag}`);
    }
    args.set(flag, next);
    index += 1;
  }

  const docPath = args.get("--doc");
  const pdfPath = args.get("--pdf");
  if (!docPath || !pdfPath) {
    throw new Error("--doc and --pdf are required.");
  }

  const countRaw = args.get("--count");
  const count = countRaw ? Number.parseInt(countRaw, 10) : DEFAULT_TOTAL_QUESTIONS;
  if (!Number.isFinite(count) || count < 1) {
    throw new Error(`Invalid --count value: ${countRaw ?? ""}`);
  }

  const splitRaw = (args.get("--split") ?? "content-proportional") as SplitMode;
  if (splitRaw !== "content-proportional" && splitRaw !== "equal") {
    throw new Error(`Invalid --split value: ${splitRaw}`);
  }

  const strictnessRaw = (args.get("--strictness") ?? DEFAULT_STRICTNESS) as StrictnessMode;
  if (strictnessRaw !== "strict_internal") {
    throw new Error(`Invalid --strictness value: ${strictnessRaw}`);
  }

  const persistDb = args.has("--persist-db") ? parseBoolean(args.get("--persist-db") as string) : false;
  const maxAttemptsRaw = args.get("--max-attempts");
  let maxAttempts: number | null = null;
  if (maxAttemptsRaw) {
    const parsed = Number.parseInt(maxAttemptsRaw, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new Error(`Invalid --max-attempts value: ${maxAttemptsRaw}`);
    }
    maxAttempts = parsed;
  }
  if (maxAttemptsRaw && maxAttempts === null) {
    throw new Error(`Invalid --max-attempts value: ${maxAttemptsRaw}`);
  }

  const outputPathRaw = args.get("--output") ?? defaultOutputPath();
  const outputPath = path.isAbsolute(outputPathRaw) ? outputPathRaw : path.resolve(process.cwd(), outputPathRaw);
  if (!outputPath.toLowerCase().endsWith(".docx")) {
    throw new Error(`--output must end with .docx, received: ${outputPath}`);
  }

  return {
    docPath: path.resolve(docPath),
    pdfPath: path.resolve(pdfPath),
    count,
    split: splitRaw,
    outputPath,
    strictness: strictnessRaw,
    persistDb,
    maxAttempts,
  };
}

function timestampForFile(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}${mm}${dd}_${hh}${min}`;
}

function defaultOutputPath() {
  const stamp = timestampForFile(new Date());
  return path.resolve(
    process.cwd(),
    "output",
    "doc",
    `sba_from_high_yield_and_barrier_${stamp}.docx`,
  );
}

function runCommand(command: string, args: string[]) {
  return execFileSync(command, args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 128,
  });
}

function requireCommand(command: string) {
  try {
    runCommand("which", [command]);
  } catch {
    throw new Error(`Required command not found in PATH: ${command}`);
  }
}

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required.");
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function getModel() {
  return process.env.OPENAI_MODEL ?? OPENAI_DEFAULT_MODEL;
}

async function generateStructuredQuestionsForScript(prompt: string) {
  const client = getOpenAIClient();
  const response = await client.responses.create({
    model: getModel(),
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        name: "generated_questions_script",
        strict: false,
        schema: GENERATED_QUESTION_JSON_SCHEMA_FOR_RESPONSES,
      },
    },
  });

  if (!response.output_text) {
    throw new Error("LLM returned empty output_text");
  }
  return JSON.parse(response.output_text) as unknown;
}

function normalizeLineBreaks(value: string) {
  return value
    .replace(/\r/g, "")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function estimateTokens(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words * 0.75));
}

function splitParagraphs(text: string) {
  return normalizeLineBreaks(text)
    .split(/\n{2,}/)
    .map((piece) => piece.replace(/\s+/g, " ").trim())
    .filter((piece) => piece.length >= 40);
}

function chunkWords(text: string, targetWords = CHUNK_TARGET_WORDS, overlapWords = CHUNK_OVERLAP_WORDS) {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) return [] as string[];
  if (words.length <= targetWords) return [words.join(" ")];

  const chunks: string[] = [];
  const step = Math.max(30, targetWords - overlapWords);
  for (let start = 0; start < words.length; start += step) {
    const slice = words.slice(start, start + targetWords);
    if (slice.length === 0) break;
    chunks.push(slice.join(" "));
    if (start + targetWords >= words.length) break;
  }
  return chunks;
}

async function loadStyleSpec() {
  for (const candidate of STYLE_SPEC_CANDIDATES) {
    try {
      return await fs.readFile(candidate, "utf8");
    } catch {
      // try next
    }
  }
  return "Keep stems clinically focused, realistic, and concise. Ensure options are homogeneous and plausible.";
}

function extractDocText(filePath: string) {
  const output = runCommand("textutil", ["-convert", "txt", "-stdout", filePath]);
  return normalizeLineBreaks(output);
}

function parsePdfPageCount(pdfInfoOutput: string) {
  const match = pdfInfoOutput.match(/^Pages:\s+(\d+)/m);
  if (!match) {
    throw new Error("Unable to parse page count from pdfinfo output.");
  }
  const count = Number.parseInt(match[1], 10);
  if (!Number.isFinite(count) || count < 1) {
    throw new Error("Invalid page count from pdfinfo output.");
  }
  return count;
}

function extractPdfPages(filePath: string) {
  const info = runCommand("pdfinfo", [filePath]);
  const pageCount = parsePdfPageCount(info);
  const pages: Array<{ page: number; text: string }> = [];

  for (let page = 1; page <= pageCount; page += 1) {
    const raw = runCommand("pdftotext", ["-f", String(page), "-l", String(page), "-layout", filePath, "-"]);
    const normalized = normalizeLineBreaks(raw);
    if (!normalized) continue;
    pages.push({ page, text: normalized });
  }
  return pages;
}

function buildDocChunks(sourcePath: string, sourceName: string, text: string): SourceChunk[] {
  const paragraphs = splitParagraphs(text);
  const chunks: SourceChunk[] = [];

  if (paragraphs.length === 0) {
    const fallbackChunks = chunkWords(text);
    return fallbackChunks.map((piece, index) => ({
      sourceKey: "doc",
      sourceName,
      sourcePath,
      locatorLabel: `Section ${index + 1}`,
      locatorValue: index + 1,
      text: piece,
      tokenEstimate: estimateTokens(piece),
    }));
  }

  for (let sectionIndex = 0; sectionIndex < paragraphs.length; sectionIndex += 1) {
    const section = paragraphs[sectionIndex];
    const sectionChunks = chunkWords(section);
    for (const chunk of sectionChunks) {
      chunks.push({
        sourceKey: "doc",
        sourceName,
        sourcePath,
        locatorLabel: `Section ${sectionIndex + 1}`,
        locatorValue: sectionIndex + 1,
        text: chunk,
        tokenEstimate: estimateTokens(chunk),
      });
    }
  }

  return chunks;
}

function buildPdfChunks(sourcePath: string, sourceName: string, pages: Array<{ page: number; text: string }>): SourceChunk[] {
  const chunks: SourceChunk[] = [];

  for (const page of pages) {
    const pageChunks = chunkWords(page.text);
    for (const chunk of pageChunks) {
      chunks.push({
        sourceKey: "pdf",
        sourceName,
        sourcePath,
        locatorLabel: `Page ${page.page}`,
        locatorValue: page.page,
        text: chunk,
        tokenEstimate: estimateTokens(chunk),
      });
    }
  }

  return chunks;
}

export function computeSourceQuotas(totalCount: number, docTokens: number, pdfTokens: number, split: SplitMode): SourceQuota {
  if (totalCount < 1) {
    throw new Error("Total question count must be >= 1.");
  }

  if (split === "equal") {
    const docQuota = Math.floor(totalCount / 2);
    const pdfQuota = totalCount - docQuota;
    return { docQuota, pdfQuota };
  }

  const docShare = docTokens + pdfTokens > 0 ? docTokens / (docTokens + pdfTokens) : 0.5;
  let docQuota = Math.round(totalCount * docShare);
  if (docQuota < 1 && totalCount > 1) docQuota = 1;
  if (docQuota >= totalCount) docQuota = Math.max(0, totalCount - 1);

  return {
    docQuota,
    pdfQuota: totalCount - docQuota,
  };
}

export function normalizeCitationSourceName(source: string) {
  return path.basename(source.replace(/\\/g, "/")).trim().toLowerCase();
}

export function buildAllowedCitationSet(names: string[]) {
  return new Set(names.map((name) => normalizeCitationSourceName(name)));
}

export function isAllowedCitationSource(source: unknown, allowedSources: ReadonlySet<string>) {
  if (typeof source !== "string" || source.trim().length === 0) return false;
  return allowedSources.has(normalizeCitationSourceName(source));
}

function containsPlaceholder(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return PLACEHOLDER_PATTERN.test(value);
}

function hasPlaceholderInQuestion(question: GeneratedQuestionPayload["questions"][number]) {
  if (containsPlaceholder(question.stem_markdown)) return true;
  if (containsPlaceholder(question.explanation_markdown)) return true;
  if (question.options.some((option) => containsPlaceholder(option.text))) return true;
  if (question.key_takeaways.some((item) => containsPlaceholder(item))) return true;
  if (Object.values(question.why_others_wrong).some((item) => containsPlaceholder(item))) return true;
  return false;
}

export function validateQuestionForSourcedRun(
  question: GeneratedQuestionPayload["questions"][number],
  options: GateOptions,
) {
  const reasons: string[] = [];
  const allowedKeys = new Set(["A", "B", "C", "D", "E"]);
  const optionKeys = new Set(question.options.map((option) => option.key));

  if (question.options.length !== 5 || optionKeys.size !== 5 || [...optionKeys].some((key) => !allowedKeys.has(key))) {
    reasons.push("invalid_option_shape");
  }

  if (question.difficulty !== "Intermediate" && question.difficulty !== "Hard") {
    reasons.push("difficulty_not_medium_or_hard");
  }

  if (hasPlaceholderInQuestion(question)) {
    reasons.push("contains_placeholder_text");
  }

  const citations = question.citations ?? [];
  if (citations.length === 0) {
    reasons.push("missing_citations");
  }

  const targetNormalized = normalizeCitationSourceName(options.targetSourceName);
  let hasTargetCitation = false;

  for (const citation of citations) {
    if (citation.type !== "internal") {
      reasons.push("citation_not_internal");
      continue;
    }
    if (typeof citation.url === "string" && citation.url.trim().length > 0) {
      reasons.push("citation_contains_external_url");
    }
    if (!isAllowedCitationSource(citation.source, options.allowedSourceNames)) {
      reasons.push("citation_source_not_allowed");
      continue;
    }
    if (typeof citation.source === "string" && normalizeCitationSourceName(citation.source) === targetNormalized) {
      hasTargetCitation = true;
    }
  }

  if (!hasTargetCitation) {
    reasons.push("missing_target_source_citation");
  }

  return {
    accepted: reasons.length === 0,
    reasons: Array.from(new Set(reasons)),
  };
}

export function hasNearDuplicateStem(stem: string, existingStems: string[], threshold = IN_RUN_DUPLICATE_THRESHOLD) {
  let maxOverlap = 0;
  for (const existing of existingStems) {
    const overlap = trigramOverlap(stem, existing);
    if (overlap > maxOverlap) {
      maxOverlap = overlap;
    }
  }
  return {
    duplicate: maxOverlap >= threshold,
    maxOverlap,
  };
}

function buildPrompt({
  requestedCount,
  targetSource,
  contextChunks,
  styleSpec,
}: {
  requestedCount: number;
  targetSource: SourceState;
  contextChunks: SourceChunk[];
  styleSpec: string;
}) {
  const contextBlock = contextChunks
    .map((chunk, index) => {
      const label = `INTERNAL_${index + 1}`;
      return `${label}: source="${targetSource.sourceName}" ${chunk.locatorLabel}\n${chunk.text}`;
    })
    .join("\n\n");

  return `You are generating original Sydney medical school style SBA MCQs.

STRICT RULES:
- Generate exactly ${requestedCount} questions.
- MCQ format must be SBA only with options A-E and one best answer.
- Difficulty must be either "Intermediate" or "Hard". Do not use "Basic".
- Frame questions for NSW/Australian clinical settings and align to core Child and Adolescent Health knowledge for Sydney Medical School students.
- Keep all facts strictly grounded in INTERNAL CONTEXT only.
- Do not copy stems/options verbatim from context.
- All citations must be internal only.
- For every citation object:
  - type must be "internal"
  - source must be exactly "${targetSource.sourceName}"
  - page should be an integer: use PDF page number when obvious, or section index for DOC-based material.
- Do not include external URLs in citations.
- Avoid placeholders like "???" or "TBD".

QUALITY EXPECTATIONS:
- High-yield, exam-ready vignettes.
- One clearly best answer; distractors must be plausible and discriminating.
- Explanation should justify the correct option and briefly distinguish distractors.

STYLE SPEC:
${styleSpec}

TARGET SOURCE:
${targetSource.sourceName}

INTERNAL CONTEXT:
${contextBlock}

Return JSON only matching the required schema.`;
}

function pickNextSource(states: Record<SourceKey, SourceState>): SourceState | null {
  const candidates = Object.values(states).filter((state) => state.accepted < state.quota);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (b.quota - b.accepted) - (a.quota - a.accepted));
  return candidates[0] ?? null;
}

function takeContextChunks(sourceState: SourceState, count: number) {
  if (sourceState.chunks.length === 0) {
    throw new Error(`No context chunks available for source: ${sourceState.sourceName}`);
  }
  const out: SourceChunk[] = [];
  for (let i = 0; i < count; i += 1) {
    const index = (sourceState.cursor + i) % sourceState.chunks.length;
    out.push(sourceState.chunks[index]);
  }
  sourceState.cursor = (sourceState.cursor + count) % sourceState.chunks.length;
  return out;
}

function incrementReason(counter: Map<string, number>, reason: string) {
  counter.set(reason, (counter.get(reason) ?? 0) + 1);
}

function formatCitationLine(citation: GeneratedQuestionPayload["questions"][number]["citations"][number]) {
  const source = typeof citation.source === "string" && citation.source.trim().length > 0 ? citation.source.trim() : "Unknown source";
  const page = typeof citation.page === "number" ? ` (p.${citation.page})` : "";
  return `${source}${page}`;
}

export function renderDocumentText(params: {
  generatedAt: Date;
  acceptedQuestions: AcceptedQuestion[];
  sourceStates: Record<SourceKey, SourceState>;
}) {
  const lines: string[] = [];
  lines.push("CAH SBA Question Set");
  lines.push("");
  lines.push(`Generated: ${params.generatedAt.toISOString()}`);
  lines.push(DISCLAIMER);
  lines.push("");
  lines.push("Source Summary");
  lines.push(`- ${params.sourceStates.doc.sourceName}: ${params.sourceStates.doc.accepted} questions`);
  lines.push(`- ${params.sourceStates.pdf.sourceName}: ${params.sourceStates.pdf.accepted} questions`);
  lines.push("");

  for (let index = 0; index < params.acceptedQuestions.length; index += 1) {
    const entry = params.acceptedQuestions[index];
    const question = entry.question;

    lines.push(`Question ${index + 1}`);
    lines.push(`${question.stem_markdown}`);
    lines.push("");
    for (const option of question.options) {
      lines.push(`${option.key}. ${option.text}`);
    }
    lines.push("");
    lines.push(`Correct Answer: ${question.correctKey}`);
    lines.push(`Difficulty: ${question.difficulty ?? "Unspecified"}`);
    if (typeof question.ausScore === "number") {
      lines.push(`AUS Score: ${question.ausScore}`);
    }
    lines.push(`Explanation: ${question.explanation_markdown}`);
    lines.push("Citations:");
    for (const citation of question.citations) {
      lines.push(`- ${formatCitationLine(citation)}`);
    }
    lines.push("");
    lines.push("Key Takeaways:");
    for (const takeaway of question.key_takeaways) {
      lines.push(`- ${takeaway}`);
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

async function writeDocxFromText(outputPath: string, text: string) {
  const tempPath = path.join(os.tmpdir(), `pwh_sba_${Date.now()}_${Math.random().toString(16).slice(2)}.txt`);
  await fs.writeFile(tempPath, text, "utf8");
  try {
    runCommand("textutil", ["-convert", "docx", "-output", outputPath, tempPath]);
  } finally {
    await fs.unlink(tempPath).catch(() => undefined);
  }
}

async function persistDraftQuestions(questions: AcceptedQuestion[], strictness: StrictnessMode, sourceNames: string[]) {
  const createdAt = new Date().toISOString();
  let persisted = 0;

  for (let index = 0; index < questions.length; index += 1) {
    const entry = questions[index];
    const stemHash = crypto
      .createHash("sha1")
      .update(entry.question.stem_markdown.toLowerCase().replace(/\s+/g, " ").trim())
      .digest("hex")
      .slice(0, 20);

    await prisma.question.create({
      data: {
        type: "SBA",
        stem: entry.question.stem_markdown,
        options: entry.question.options,
        correctKey: entry.question.correctKey,
        explanation: entry.question.explanation_markdown,
        rationale: entry.question.key_takeaways.join("; "),
        whyOthersWrong: entry.question.why_others_wrong,
        citations: entry.question.citations,
        difficulty: entry.question.difficulty ?? null,
        ausScore: entry.question.ausScore ?? null,
        moduleCode: entry.question.moduleCode ?? null,
        createdBy: "ai",
        status: "draft",
        source: {
          script: "generate_sourced_sba_docx",
          generatedAt: createdAt,
          strictness,
          sourceDocuments: sourceNames,
          sourceKey: entry.sourceKey,
        },
        sourceFingerprint: `script-sourced-${createdAt}-${index}-${stemHash}`,
      },
    });
    persisted += 1;
  }

  return persisted;
}

async function run(options: CliOptions) {
  requireCommand("textutil");
  requireCommand("pdfinfo");
  requireCommand("pdftotext");

  const docExists = await fs.stat(options.docPath).then(() => true).catch(() => false);
  const pdfExists = await fs.stat(options.pdfPath).then(() => true).catch(() => false);
  if (!docExists) throw new Error(`DOC source not found: ${options.docPath}`);
  if (!pdfExists) throw new Error(`PDF source not found: ${options.pdfPath}`);

  const generatedAt = new Date();
  const styleSpec = await loadStyleSpec();

  const docSourceName = path.basename(options.docPath);
  const pdfSourceName = path.basename(options.pdfPath);

  const docText = extractDocText(options.docPath);
  const pdfPages = extractPdfPages(options.pdfPath);
  const pdfText = pdfPages.map((page) => page.text).join("\n\n");

  const docTokenCount = estimateTokens(docText);
  const pdfTokenCount = estimateTokens(pdfText);
  const quotas = computeSourceQuotas(options.count, docTokenCount, pdfTokenCount, options.split);

  const sourceStates: Record<SourceKey, SourceState> = {
    doc: {
      key: "doc",
      sourceName: docSourceName,
      sourcePath: options.docPath,
      chunks: buildDocChunks(options.docPath, docSourceName, docText),
      cursor: 0,
      tokenCount: docTokenCount,
      quota: quotas.docQuota,
      accepted: 0,
    },
    pdf: {
      key: "pdf",
      sourceName: pdfSourceName,
      sourcePath: options.pdfPath,
      chunks: buildPdfChunks(options.pdfPath, pdfSourceName, pdfPages),
      cursor: 0,
      tokenCount: pdfTokenCount,
      quota: quotas.pdfQuota,
      accepted: 0,
    },
  };

  if (sourceStates.doc.chunks.length === 0 || sourceStates.pdf.chunks.length === 0) {
    throw new Error("One or more sources yielded no chunks after extraction.");
  }

  const similarityContext = await createSimilarityContext();
  const allowedSources = buildAllowedCitationSet([docSourceName, pdfSourceName]);
  const acceptedQuestions: AcceptedQuestion[] = [];
  const rejectionReasons = new Map<string, number>();
  const attemptLogs: AttemptLog[] = [];

  let attempt = 0;
  const maxAttempts = options.maxAttempts ?? Math.max(60, options.count * 6);

  while (acceptedQuestions.length < options.count && attempt < maxAttempts) {
    const source = pickNextSource(sourceStates);
    if (!source) break;

    const remainingForSource = source.quota - source.accepted;
    const remainingGlobal = options.count - acceptedQuestions.length;
    const requested = Math.max(1, Math.min(MAX_BATCH_SIZE, remainingForSource, remainingGlobal));
    const contextChunks = takeContextChunks(source, Math.min(MAX_CONTEXT_CHUNKS, source.chunks.length));
    const prompt = buildPrompt({
      requestedCount: requested,
      targetSource: source,
      contextChunks,
      styleSpec,
    });

    attempt += 1;
    console.log(
      `[gen] attempt=${attempt}/${maxAttempts} source=${source.key} requested=${requested} accepted_so_far=${acceptedQuestions.length}/${options.count}`,
    );
    const errors: string[] = [];
    let validatedQuestions: GeneratedQuestionPayload["questions"] = [];
    let acceptedThisAttempt = 0;
    let rejectedThisAttempt = 0;

    try {
      const generatedPayload = await generateStructuredQuestionsForScript(prompt);
      const validated = validateGeneratedPayload(generatedPayload, options.strictness);

      if (!validated.valid || !validated.data) {
        for (const issue of validated.errors) {
          incrementReason(rejectionReasons, `schema:${issue}`);
          errors.push(issue);
        }
      } else {
        validatedQuestions = validated.data.questions;

        for (const question of validatedQuestions) {
          if (acceptedQuestions.length >= options.count) break;
          if (source.accepted >= source.quota) break;

          const gate = validateQuestionForSourcedRun(question, {
            allowedSourceNames: allowedSources,
            targetSourceName: source.sourceName,
          });
          if (!gate.accepted) {
            rejectedThisAttempt += 1;
            for (const reason of gate.reasons) {
              incrementReason(rejectionReasons, reason);
            }
            continue;
          }

          const duplicate = hasNearDuplicateStem(
            question.stem_markdown,
            acceptedQuestions.map((entry) => entry.question.stem_markdown),
          );
          if (duplicate.duplicate) {
            rejectedThisAttempt += 1;
            incrementReason(rejectionReasons, `in_run_duplicate:${duplicate.maxOverlap.toFixed(3)}`);
            continue;
          }

          const similarity = await evaluateSimilarity(question.stem_markdown, similarityContext);
          if (similarity.rejected) {
            rejectedThisAttempt += 1;
            incrementReason(
              rejectionReasons,
              `corpus_similarity:overlap=${similarity.maxOverlap.toFixed(3)}|cos=${similarity.maxCosine.toFixed(3)}`,
            );
            continue;
          }

          acceptedQuestions.push({
            sourceKey: source.key,
            sourceName: source.sourceName,
            question,
            similarity: {
              maxOverlap: similarity.maxOverlap,
              overlapQuestionId: similarity.overlapQuestionId,
              maxCosine: similarity.maxCosine,
              cosineQuestionId: similarity.cosineQuestionId,
            },
          });
          source.accepted += 1;
          acceptedThisAttempt += 1;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      incrementReason(rejectionReasons, `generation_error:${message}`);
    }

    attemptLogs.push({
      attempt,
      sourceKey: source.key,
      requested,
      validated: validatedQuestions.length,
      accepted: acceptedThisAttempt,
      rejected: rejectedThisAttempt,
      errors,
    });
    if (errors.length > 0) {
      console.log(`[gen] attempt=${attempt} errors=${errors.join(" | ")}`);
    }
    console.log(
      `[gen] attempt=${attempt} result accepted=${acceptedThisAttempt} rejected=${rejectedThisAttempt} totals=${acceptedQuestions.length}/${options.count}`,
    );
  }

  if (acceptedQuestions.length !== options.count) {
    const topReasons = [...rejectionReasons.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([reason, count]) => `${reason}=${count}`)
      .join(", ");

    throw new Error(
      `Generation shortfall: accepted ${acceptedQuestions.length}/${options.count} after ${attempt} attempts. Top rejection reasons: ${topReasons || "none recorded"}.`,
    );
  }

  const documentText = renderDocumentText({
    generatedAt,
    acceptedQuestions,
    sourceStates,
  });

  await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
  await writeDocxFromText(options.outputPath, documentText);

  let persistedCount = 0;
  if (options.persistDb) {
    persistedCount = await persistDraftQuestions(
      acceptedQuestions,
      options.strictness,
      [docSourceName, pdfSourceName],
    );
  }

  const auditPath = options.outputPath.replace(/\.docx$/i, ".audit.json");
  const audit = {
    generatedAt: generatedAt.toISOString(),
    config: {
      docPath: options.docPath,
      pdfPath: options.pdfPath,
      count: options.count,
      split: options.split,
      outputPath: options.outputPath,
      strictness: options.strictness,
      persistDb: options.persistDb,
    },
    disclaimer: DISCLAIMER,
    sources: {
      doc: {
        sourceName: sourceStates.doc.sourceName,
        sourcePath: sourceStates.doc.sourcePath,
        tokenCount: sourceStates.doc.tokenCount,
        chunkCount: sourceStates.doc.chunks.length,
        quota: sourceStates.doc.quota,
        accepted: sourceStates.doc.accepted,
      },
      pdf: {
        sourceName: sourceStates.pdf.sourceName,
        sourcePath: sourceStates.pdf.sourcePath,
        tokenCount: sourceStates.pdf.tokenCount,
        chunkCount: sourceStates.pdf.chunks.length,
        quota: sourceStates.pdf.quota,
        accepted: sourceStates.pdf.accepted,
      },
    },
    attempts: {
      total: attemptLogs.length,
      details: attemptLogs,
    },
    rejectedByReason: Object.fromEntries([...rejectionReasons.entries()].sort((a, b) => b[1] - a[1])),
    acceptedCount: acceptedQuestions.length,
    persistedCount,
    questions: acceptedQuestions.map((entry, index) => ({
      index: index + 1,
      sourceKey: entry.sourceKey,
      sourceName: entry.sourceName,
      stem: entry.question.stem_markdown,
      correctKey: entry.question.correctKey,
      difficulty: entry.question.difficulty,
      citationSources: entry.question.citations.map((citation) => citation.source ?? null),
      citationPages: entry.question.citations.map((citation) => citation.page ?? null),
      similarity: entry.similarity,
    })),
  };
  await fs.writeFile(auditPath, JSON.stringify(audit, null, 2), "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        outputPath: options.outputPath,
        auditPath,
        totalQuestions: acceptedQuestions.length,
        sourceCounts: {
          doc: sourceStates.doc.accepted,
          pdf: sourceStates.pdf.accepted,
        },
        persistedCount,
      },
      null,
      2,
    ),
  );
}

if (require.main === module) {
  run(parseArgs(process.argv.slice(2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect().catch(() => undefined);
    });
}
