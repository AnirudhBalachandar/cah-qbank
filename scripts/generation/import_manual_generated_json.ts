import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { SUBJECT_CONFIG } from "@cah-qbank/domain";

import { PrismaClient } from "../../app/src/lib/generated/prisma";
import { validateGeneratedPayload, type GeneratedQuestionPayload } from "../../app/src/lib/server/generation/validator";

const OVERLAP_THRESHOLD = 0.35;

type ImportDecision = {
  index: number;
  stem: string;
  curriculumArea: string | null;
  sourceFingerprint: string;
  overlapScore: number;
  overlapQuestionId: string | null;
  status: "created" | "rejected" | "skipped_existing";
  reason: string | null;
  questionId: string | null;
};

type Args = {
  input: string;
  persist: boolean;
  reportOut: string | null;
  batchId: string | null;
};

function usage() {
  console.log(
    [
      "Usage:",
      "  pnpm tsx scripts/generation/import_manual_generated_json.ts --input <path|-> [--persist-db true|false] [--report-out <path>] [--batch-id <id>]",
      "",
      "Notes:",
      "  - Use --input - to read JSON from stdin.",
      "  - Similarity screening is local-only and overlap-based; no API key is used.",
    ].join("\n"),
  );
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    input: "",
    persist: true,
    reportOut: null,
    batchId: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--input") {
      args.input = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (arg === "--persist-db") {
      args.persist = (argv[i + 1] ?? "true").toLowerCase() !== "false";
      i += 1;
      continue;
    }
    if (arg === "--report-out") {
      args.reportOut = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg === "--batch-id") {
      args.batchId = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.input) {
    throw new Error("Missing required --input argument.");
  }

  return args;
}

function normalizeText(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function trigrams(text: string) {
  const normalized = normalizeText(text);
  const grams = new Set<string>();
  for (let i = 0; i < normalized.length - 2; i += 1) {
    grams.add(normalized.slice(i, i + 3));
  }
  return grams;
}

function trigramOverlap(a: string, b: string) {
  const aGrams = trigrams(a);
  const bGrams = trigrams(b);
  if (aGrams.size === 0 || bGrams.size === 0) return 0;

  let intersection = 0;
  for (const gram of aGrams) {
    if (bGrams.has(gram)) intersection += 1;
  }

  return intersection / Math.max(aGrams.size, bGrams.size);
}

function buildQuestionFingerprint(question: GeneratedQuestionPayload["questions"][number], batchId: string) {
  const payload = {
    stem: normalizeText(question.stem_markdown),
    options: question.options.map((option) => `${option.key}:${normalizeText(option.text)}`),
    correctKey: question.correctKey,
    explanation: normalizeText(question.explanation_markdown),
    whyOthersWrong: Object.entries(question.why_others_wrong)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}:${normalizeText(value)}`),
    keyTakeaways: question.key_takeaways.map((takeaway) => normalizeText(takeaway)),
    tags: question.tags.map((tag) => normalizeText(tag)),
    citations: question.citations.map((citation) => ({
      type: citation.type,
      source: citation.source?.trim() ?? "",
      page: citation.page ?? null,
      title: citation.title?.trim() ?? "",
    })),
  };
  const hash = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 20);
  return `manual-chatgpt-pro-${batchId}-${hash}`;
}

function moduleCodeFromTags(tags: string[]) {
  const joined = tags.join(" ; ");
  const match = joined.match(new RegExp(`${SUBJECT_CONFIG.moduleCodePrefix}\\s*\\d{2}`, "i"));
  return match ? match[0].toUpperCase() : null;
}

async function readStdin() {
  const chunks: string[] = [];
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return chunks.join("");
}

async function readInput(input: string) {
  if (input === "-") {
    return readStdin();
  }
  return fs.readFile(input, "utf8");
}

function defaultReportPath(input: string) {
  if (input === "-") return null;
  const parsed = path.parse(input);
  return path.join(parsed.dir, `${parsed.name}.import-report.json`);
}

function deriveBatchId(raw: string, explicitBatchId: string | null, input: string) {
  if (explicitBatchId && explicitBatchId.trim()) {
    return explicitBatchId.trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
  }
  if (input !== "-") {
    return path.basename(input, path.extname(input)).replace(/[^a-zA-Z0-9._-]+/g, "-");
  }
  return `stdin-${crypto.createHash("sha1").update(raw).digest("hex").slice(0, 12)}`;
}

async function writeReport(reportPath: string, payload: unknown) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(payload, null, 2), "utf8");
}

async function resolveTagIds(prisma: PrismaClient, tags: string[]) {
  const uniqueLeaves = Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
  if (uniqueLeaves.length === 0) return [];

  const existing = await prisma.tag.findMany({
    where: {
      name: {
        in: uniqueLeaves,
        mode: "insensitive",
      },
    },
    select: { id: true, name: true },
  });

  const byLowerName = new Map(existing.map((tag) => [tag.name.toLowerCase(), tag.id]));
  return uniqueLeaves
    .map((leaf) => byLowerName.get(leaf.toLowerCase()) ?? null)
    .filter((id): id is string => Boolean(id));
}

function findMaxOverlap(stem: string, candidates: Array<{ id: string; stem: string }>) {
  let maxOverlap = 0;
  let overlapQuestionId: string | null = null;

  for (const candidate of candidates) {
    const overlap = trigramOverlap(stem, candidate.stem);
    if (overlap > maxOverlap) {
      maxOverlap = overlap;
      overlapQuestionId = candidate.id;
    }
  }

  return { maxOverlap, overlapQuestionId };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const raw = await readInput(args.input);
  const batchId = deriveBatchId(raw, args.batchId, args.input);
  const reportPath = args.reportOut ?? defaultReportPath(args.input);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON input: ${error instanceof Error ? error.message : "unknown parse error"}`);
  }

  const validated = validateGeneratedPayload(parsed, "strict_internal");
  if (!validated.valid || !validated.data) {
    const payload = {
      ok: false,
      batchId,
      persist: args.persist,
      validationErrors: validated.errors,
    };
    if (reportPath) {
      await writeReport(reportPath, payload);
    }
    console.log(JSON.stringify(payload, null, 2));
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const admin = await prisma.user.findFirst({
      where: { role: "ADMIN" },
      select: { id: true, email: true },
    });
    if (!admin) {
      throw new Error("No admin user found.");
    }

    const existingQuestions = await prisma.question.findMany({
      where: { status: { in: ["published", "draft"] } },
      select: { id: true, stem: true, sourceFingerprint: true },
    });

    const existingByFingerprint = new Map(existingQuestions.map((question) => [question.sourceFingerprint, question.id]));
    const overlapCandidates = existingQuestions.map((question) => ({ id: question.id, stem: question.stem }));
    const decisions: ImportDecision[] = [];
    const acceptedInBatch: Array<{ id: string; stem: string }> = [];
    const curriculumAreas = Array.from(
      new Set(validated.data.questions.map((question) => question.tags[0]).filter((tag): tag is string => Boolean(tag))),
    );

    let runId: string | null = null;
    if (args.persist) {
      const run = await prisma.generatedQuestionRun.create({
        data: {
          userId: admin.id,
          weaknessTags: curriculumAreas.map((name) => ({ name, source: "manual_chatgpt_pro_import" })),
          strictness: "strict_internal",
          status: "processing",
          logs: {
            mode: "manual_chatgpt_pro_import",
            batchId,
            overlapThreshold: OVERLAP_THRESHOLD,
            importPath: args.input === "-" ? "stdin" : args.input,
            notes: [
              "Manual ChatGPT Pro JSON import.",
              "Schema validated locally.",
              "Similarity screening used local trigram overlap only.",
              "No OpenAI API key was used during this import.",
            ],
          },
        },
        select: { id: true },
      });
      runId = run.id;
    }

    for (let index = 0; index < validated.data.questions.length; index += 1) {
      const question = validated.data.questions[index];
      const sourceFingerprint = buildQuestionFingerprint(question, batchId);
      const curriculumArea = question.tags[0] ?? null;

      if (existingByFingerprint.has(sourceFingerprint)) {
        decisions.push({
          index,
          stem: question.stem_markdown,
          curriculumArea,
          sourceFingerprint,
          overlapScore: 0,
          overlapQuestionId: existingByFingerprint.get(sourceFingerprint) ?? null,
          status: "skipped_existing",
          reason: "existing_source_fingerprint",
          questionId: existingByFingerprint.get(sourceFingerprint) ?? null,
        });
        continue;
      }

      const overlap = findMaxOverlap(question.stem_markdown, [...overlapCandidates, ...acceptedInBatch]);
      if (overlap.maxOverlap >= OVERLAP_THRESHOLD) {
        decisions.push({
          index,
          stem: question.stem_markdown,
          curriculumArea,
          sourceFingerprint,
          overlapScore: overlap.maxOverlap,
          overlapQuestionId: overlap.overlapQuestionId,
          status: "rejected",
          reason: "local_trigram_overlap_threshold",
          questionId: null,
        });
        continue;
      }

      if (!args.persist || !runId) {
        const tempId = `accepted-${index + 1}`;
        acceptedInBatch.push({ id: tempId, stem: question.stem_markdown });
        decisions.push({
          index,
          stem: question.stem_markdown,
          curriculumArea,
          sourceFingerprint,
          overlapScore: overlap.maxOverlap,
          overlapQuestionId: overlap.overlapQuestionId,
          status: "created",
          reason: null,
          questionId: tempId,
        });
        continue;
      }

      const tagIds = await resolveTagIds(prisma, question.tags);
      const createdQuestion = await prisma.question.create({
        data: {
          type: "SBA",
          stem: question.stem_markdown,
          options: question.options,
          correctKey: question.correctKey,
          explanation: question.explanation_markdown,
          rationale: question.key_takeaways.join("; "),
          whyOthersWrong: question.why_others_wrong,
          citations: question.citations,
          difficulty: question.difficulty ?? null,
          ausScore: question.ausScore ?? null,
          moduleCode: question.moduleCode ?? moduleCodeFromTags(question.tags),
          createdBy: "ai",
          status: "draft",
          source: {
            generationRunId: runId,
            strictness: "strict_internal",
            generationMethod: "manual_chatgpt_pro_import",
            batchId,
            manualImportPath: args.input === "-" ? "stdin" : args.input,
            sourceRefs: question.citations.map((citation) => citation.source ?? citation.title ?? "unknown"),
            originalTags: question.tags,
            localSimilarityCheck: {
              mode: "trigram_overlap_only",
              threshold: OVERLAP_THRESHOLD,
              maxOverlap: overlap.maxOverlap,
              overlapQuestionId: overlap.overlapQuestionId,
            },
          },
          sourceFingerprint,
          ...(tagIds.length > 0
            ? {
                questionTags: {
                  createMany: {
                    data: tagIds.map((tagId) => ({ tagId })),
                    skipDuplicates: true,
                  },
                },
              }
            : {}),
        },
        select: { id: true },
      });

      await prisma.generatedQuestionItem.create({
        data: {
          runId,
          questionId: createdQuestion.id,
          status: "draft",
          overlapScore: overlap.maxOverlap,
          similarityScore: null,
          validationErrors: {
            similarity: {
              overlapOnly: true,
              threshold: OVERLAP_THRESHOLD,
              overlapQuestionId: overlap.overlapQuestionId,
              maxOverlap: overlap.maxOverlap,
              cosineSkipped: "manual_no_api_key",
            },
          },
          reviewerNotes: "Imported from manual ChatGPT Pro JSON with local overlap-only similarity screening.",
        },
      });

      overlapCandidates.push({ id: createdQuestion.id, stem: question.stem_markdown });
      acceptedInBatch.push({ id: createdQuestion.id, stem: question.stem_markdown });
      existingByFingerprint.set(sourceFingerprint, createdQuestion.id);

      decisions.push({
        index,
        stem: question.stem_markdown,
        curriculumArea,
        sourceFingerprint,
        overlapScore: overlap.maxOverlap,
        overlapQuestionId: overlap.overlapQuestionId,
        status: "created",
        reason: null,
        questionId: createdQuestion.id,
      });
    }

    if (args.persist && runId) {
      for (const decision of decisions.filter((entry) => entry.status !== "created")) {
        await prisma.generatedQuestionItem.create({
          data: {
            runId,
            status: "rejected",
            overlapScore: decision.overlapScore,
            similarityScore: null,
            validationErrors: {
              similarity: {
                overlapOnly: true,
                threshold: OVERLAP_THRESHOLD,
                overlapQuestionId: decision.overlapQuestionId,
                maxOverlap: decision.overlapScore,
              },
              importDecision: {
                reason: decision.reason,
                stem: decision.stem,
                sourceFingerprint: decision.sourceFingerprint,
              },
            },
            reviewerNotes: decision.reason === "existing_source_fingerprint"
              ? "Skipped existing manual ChatGPT Pro import with matching fingerprint."
              : "Rejected during manual ChatGPT Pro import due to local trigram-overlap threshold.",
          },
        });
      }

      await prisma.generatedQuestionRun.update({
        where: { id: runId },
        data: {
          status: "completed",
          logs: {
            mode: "manual_chatgpt_pro_import",
            batchId,
            overlapThreshold: OVERLAP_THRESHOLD,
            importPath: args.input === "-" ? "stdin" : args.input,
            created: decisions.filter((entry) => entry.status === "created").length,
            rejected: decisions.filter((entry) => entry.status === "rejected").length,
            skippedExisting: decisions.filter((entry) => entry.status === "skipped_existing").length,
            totalQuestions: validated.data.questions.length,
            notes: [
              "Manual ChatGPT Pro JSON import.",
              "Schema validated locally.",
              "Similarity screening used local trigram overlap only.",
              "No OpenAI API key was used during this import.",
            ],
          },
        },
      });
    }

    const summary = {
      ok: true,
      batchId,
      persist: args.persist,
      runId,
      totalQuestions: validated.data.questions.length,
      created: decisions.filter((entry) => entry.status === "created").length,
      rejected: decisions.filter((entry) => entry.status === "rejected").length,
      skippedExisting: decisions.filter((entry) => entry.status === "skipped_existing").length,
      decisions,
    };

    if (reportPath) {
      await writeReport(reportPath, summary);
    }

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
