import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { Prisma } from "../../app/src/lib/generated/prisma";
import { PrismaClient } from "../../app/src/lib/generated/prisma";
import type { QuestionOption } from "../../app/src/lib/types";

const OVERLAP_THRESHOLD = 0.35;
const DEFAULT_TAG_NAME = "notebookLM";

type NotebookLmCsvRow = {
  lecture: string;
  title: string;
  source_id: string;
  artifact_id: string;
};

type NotebookLmAnswerOption = {
  text?: unknown;
  isCorrect?: unknown;
  rationale?: unknown;
};

type NotebookLmRawQuestion = {
  question?: unknown;
  hint?: unknown;
  answerOptions?: unknown;
  answer_options?: unknown;
  answer?: unknown;
  label?: unknown;
  text?: unknown;
};

type NotebookLmQuizFile = {
  title?: unknown;
  questions?: unknown;
};

type ImportedNotebookLmQuestion = {
  stem: string;
  options: QuestionOption[];
  correctKey: string;
  explanation: string | null;
  rationale: string | null;
  whyOthersWrong: Record<string, string>;
  citations: Prisma.InputJsonValue;
  source: Prisma.InputJsonValue;
  sourceFingerprint: string;
  lecture: string;
  quizFileName: string;
  questionIndex: number;
};

type ImportDecision = {
  lecture: string;
  quizFileName: string;
  questionIndex: number;
  stem: string | null;
  status: "created" | "created_overlap_override" | "rejected_overlap" | "skipped_existing" | "malformed";
  reason: string | null;
  questionId: string | null;
  sourceFingerprint: string | null;
  overlapScore: number | null;
  overlapQuestionId: string | null;
};

type ImportReport = {
  ok: boolean;
  zipPath: string;
  bundleId: string;
  persist: boolean;
  tagName: string;
  totals: {
    csvRows: number;
    quizFiles: number;
    questionsScanned: number;
    created: number;
    createdOverlapOverride: number;
    rejectedOverlap: number;
    skippedExisting: number;
    malformed: number;
  };
  malformedExamples: Array<{
    lecture: string;
    quizFileName: string;
    questionIndex: number;
    reason: string;
  }>;
  decisions: ImportDecision[];
  runId: string | null;
};

type Args = {
  zip: string;
  persist: boolean;
  reportOut: string | null;
  bundleId: string | null;
  tagName: string;
  allowOverlap: boolean;
};

function usage() {
  console.log(
    [
      "Usage:",
      "  pnpm tsx scripts/generation/import_notebooklm_quizzes.ts --zip <path/to/notebooklm.zip> [--persist-db true|false] [--report-out <path>] [--bundle-id <id>] [--tag-name notebookLM] [--allow-overlap true|false]",
      "",
      "Notes:",
      "  - Reads the zip file directly; no manual extraction is required.",
      "  - Persists imported questions as draft review items linked to a GeneratedQuestionRun.",
      "  - Designed for NotebookLM quiz bundles with CSV metadata + quiz_XXX.json files.",
      "  - Use --allow-overlap true only when intentionally importing questions that would normally be rejected by the trigram overlap gate.",
    ].join("\n"),
  );
}

export function parseArgs(argv: string[]): Args {
  const args: Args = {
    zip: "",
    persist: true,
    reportOut: null,
    bundleId: null,
    tagName: DEFAULT_TAG_NAME,
    allowOverlap: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--zip") {
      args.zip = argv[i + 1] ?? "";
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
    if (arg === "--bundle-id") {
      args.bundleId = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg === "--tag-name") {
      args.tagName = argv[i + 1] ?? DEFAULT_TAG_NAME;
      i += 1;
      continue;
    }
    if (arg === "--allow-overlap") {
      args.allowOverlap = (argv[i + 1] ?? "false").toLowerCase() === "true";
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.zip) {
    throw new Error("Missing required --zip argument.");
  }

  return args;
}

function normalizeText(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function hashValue(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
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

function sanitizeBundleId(raw: string) {
  return raw.trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function deriveBundleId(zipPath: string, explicitBundleId: string | null) {
  if (explicitBundleId && explicitBundleId.trim()) {
    return sanitizeBundleId(explicitBundleId);
  }
  return sanitizeBundleId(path.basename(zipPath, path.extname(zipPath)));
}

function defaultReportPath(zipPath: string) {
  return path.resolve("scripts/ingest/reports", `${path.basename(zipPath, path.extname(zipPath))}.import-report.json`);
}

function listZipEntries(zipPath: string) {
  const output = execFileSync("unzip", ["-Z1", zipPath], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function readZipEntry(zipPath: string, entryName: string) {
  return execFileSync("unzip", ["-p", zipPath, entryName], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

function parseCsvRows(raw: string): NotebookLmCsvRow[] {
  const lines = raw.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const [headerLine, ...body] = lines;
  const headers = headerLine.split(",").map((part) => part.trim());

  return body.map((line) => {
    const values = line.split(",").map((part) => part.trim());
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])) as Record<string, string>;
    return {
      lecture: row.lecture ?? "",
      title: row.title ?? "",
      source_id: row.source_id ?? "",
      artifact_id: row.artifact_id ?? "",
    };
  });
}

function questionIndexToKey(index: number) {
  return String.fromCharCode("A".charCodeAt(0) + index);
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getRawAnswerOptions(rawQuestion: NotebookLmRawQuestion) {
  const preferred = Array.isArray(rawQuestion.answerOptions) ? rawQuestion.answerOptions : null;
  if (preferred) return preferred;
  return Array.isArray(rawQuestion.answer_options) ? rawQuestion.answer_options : [];
}

export function normalizeNotebookLmQuestion({
  rawQuestion,
  lectureRow,
  quizFileName,
  quizTitle,
  questionIndex,
  bundleId,
  zipPath,
}: {
  rawQuestion: NotebookLmRawQuestion;
  lectureRow: NotebookLmCsvRow | null;
  quizFileName: string;
  quizTitle: string | null;
  questionIndex: number;
  bundleId: string;
  zipPath: string;
}): { ok: true; value: ImportedNotebookLmQuestion } | { ok: false; reason: string } {
  const stem = asString(rawQuestion.question || rawQuestion.text || rawQuestion.label);
  if (!stem) {
    return { ok: false, reason: "Missing question stem." };
  }

  const rawOptions = getRawAnswerOptions(rawQuestion) as NotebookLmAnswerOption[];
  if (rawOptions.length < 2) {
    return { ok: false, reason: `Expected at least 2 answer options but found ${rawOptions.length}.` };
  }

  const options: QuestionOption[] = [];
  const whyOthersWrong: Record<string, string> = {};
  let correctKey: string | null = null;
  let correctRationale: string | null = null;

  rawOptions.forEach((option, index) => {
    const text = asString(option?.text);
    if (!text) {
      return;
    }
    const key = questionIndexToKey(index);
    options.push({ key, text });

    const rationale = asString(option?.rationale);
    if (rationale) {
      whyOthersWrong[key] = rationale;
    }

    if (option?.isCorrect === true) {
      if (correctKey) {
        correctKey = null;
      } else {
        correctKey = key;
        correctRationale = rationale || null;
      }
    }
  });

  if (options.length < 2) {
    return { ok: false, reason: `Expected at least 2 non-empty answer options but found ${options.length}.` };
  }

  const trueCorrectCount = rawOptions.filter((option) => option?.isCorrect === true).length;
  if (trueCorrectCount !== 1 || !correctKey) {
    return { ok: false, reason: `Expected exactly 1 correct answer but found ${trueCorrectCount}.` };
  }

  const hint = asString(rawQuestion.hint);
  const explanation = correctRationale || hint || "Imported from NotebookLM quiz bundle.";
  const rationale = hint && hint !== explanation ? hint : null;
  const lecture = lectureRow?.lecture?.trim() || String(questionIndex);
  const sourceFingerprint = buildNotebookLmFingerprint({
    bundleId,
    lecture,
    quizFileName,
    questionIndex,
    stem,
    options,
  });

  const citations = [
    {
      type: "external",
      source: lectureRow?.artifact_id ?? null,
      page: null,
      url: null,
      title: lectureRow?.title ?? quizTitle ?? quizFileName,
    },
  ] satisfies Array<Record<string, string | number | null>>;

  const source = {
    importKind: "notebooklm_quiz_bundle",
    zipPath,
    bundleId,
    lecture,
    lectureTitle: lectureRow?.title ?? null,
    sourceId: lectureRow?.source_id ?? null,
    artifactId: lectureRow?.artifact_id ?? null,
    quizFileName,
    quizTitle,
    questionIndex,
    hint: hint || null,
    rawAnswerOptionCount: rawOptions.length,
  } satisfies Record<string, unknown>;

  return {
    ok: true,
    value: {
      stem,
      options,
      correctKey,
      explanation,
      rationale,
      whyOthersWrong,
      citations,
      source,
      sourceFingerprint,
      lecture,
      quizFileName,
      questionIndex,
    },
  };
}

export function buildNotebookLmFingerprint({
  bundleId,
  lecture,
  quizFileName,
  questionIndex,
  stem,
  options,
}: {
  bundleId: string;
  lecture: string;
  quizFileName: string;
  questionIndex: number;
  stem: string;
  options: QuestionOption[];
}) {
  const payload = {
    lecture,
    quizFileName,
    questionIndex,
    stem: normalizeText(stem),
    options: options.map((option) => `${option.key}:${normalizeText(option.text)}`),
  };
  const digest = hashValue(JSON.stringify(payload)).slice(0, 20);
  return `notebooklm-${bundleId}-${digest}`;
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

async function writeReport(reportPath: string, payload: unknown) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(payload, null, 2), "utf8");
}

async function ensureNotebookLmTag(prisma: PrismaClient, tagName: string) {
  const existing = await prisma.tag.findFirst({
    where: {
      name: {
        equals: tagName,
        mode: "insensitive",
      },
    },
    select: { id: true },
  });

  if (existing) {
    return existing.id;
  }

  const created = await prisma.tag.create({
    data: {
      name: tagName,
      kind: "meta",
    },
    select: { id: true },
  });
  return created.id;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const zipPath = path.resolve(args.zip);
  const reportPath = args.reportOut ? path.resolve(args.reportOut) : defaultReportPath(zipPath);
  const bundleId = deriveBundleId(zipPath, args.bundleId);

  const zipEntries = listZipEntries(zipPath);
  const csvEntry = zipEntries.find((entry) => /cah_quizzes_\d+-\d+\.csv$/i.test(entry));
  if (!csvEntry) {
    throw new Error("Could not find the metadata CSV in the zip archive.");
  }

  const quizEntries = zipEntries
    .filter((entry) => /quiz_\d+\.json$/i.test(entry) && !entry.startsWith("__MACOSX/"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const csvRows = parseCsvRows(readZipEntry(zipPath, csvEntry));
  const lectureByNumber = new Map(csvRows.map((row) => [String(Number.parseInt(row.lecture, 10)), row]));
  const malformedExamples: ImportReport["malformedExamples"] = [];
  const parsedQuestions: ImportedNotebookLmQuestion[] = [];
  const decisions: ImportDecision[] = [];

  for (const entry of quizEntries) {
    const rawQuiz = JSON.parse(readZipEntry(zipPath, entry)) as NotebookLmQuizFile;
    const rawQuestions = Array.isArray(rawQuiz.questions) ? rawQuiz.questions : [];
    const quizFileName = path.basename(entry);
    const quizMatch = quizFileName.match(/quiz_(\d+)\.json$/i);
    const lectureNumber = quizMatch ? String(Number.parseInt(quizMatch[1], 10)) : "";
    const lectureRow = lectureByNumber.get(lectureNumber) ?? null;
    const quizTitle = asString(rawQuiz.title) || lectureRow?.title || null;

    for (let index = 0; index < rawQuestions.length; index += 1) {
      const normalized = normalizeNotebookLmQuestion({
        rawQuestion: rawQuestions[index] as NotebookLmRawQuestion,
        lectureRow,
        quizFileName,
        quizTitle,
        questionIndex: index + 1,
        bundleId,
        zipPath,
      });

      if (!normalized.ok) {
        malformedExamples.push({
          lecture: lectureRow?.lecture ?? lectureNumber,
          quizFileName,
          questionIndex: index + 1,
          reason: normalized.reason,
        });
        decisions.push({
          lecture: lectureRow?.lecture ?? lectureNumber,
          quizFileName,
          questionIndex: index + 1,
          stem: asString((rawQuestions[index] as NotebookLmRawQuestion)?.question),
          status: "malformed",
          reason: normalized.reason,
          questionId: null,
          sourceFingerprint: null,
          overlapScore: null,
          overlapQuestionId: null,
        });
        continue;
      }

      parsedQuestions.push(normalized.value);
    }
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

    let runId: string | null = null;
    let notebookLmTagId: string | null = null;

    if (args.persist) {
      const run = await prisma.generatedQuestionRun.create({
        data: {
          userId: admin.id,
          weaknessTags: [{ name: args.tagName }],
          strictness: "augmented",
          status: "processing",
          logs: {
            importKind: "notebooklm_quiz_bundle",
            zipPath,
            bundleId,
            tagName: args.tagName,
          },
        },
        select: { id: true },
      });
      runId = run.id;
      notebookLmTagId = await ensureNotebookLmTag(prisma, args.tagName);
    }

    for (const question of parsedQuestions) {
      const existingQuestionId = existingByFingerprint.get(question.sourceFingerprint) ?? null;
      if (existingQuestionId) {
        decisions.push({
          lecture: question.lecture,
          quizFileName: question.quizFileName,
          questionIndex: question.questionIndex,
          stem: question.stem,
          status: "skipped_existing",
          reason: "Matching sourceFingerprint already exists.",
          questionId: existingQuestionId,
          sourceFingerprint: question.sourceFingerprint,
          overlapScore: 1,
          overlapQuestionId: existingQuestionId,
        });

        if (args.persist && runId) {
          await prisma.generatedQuestionItem.create({
            data: {
              runId,
              questionId: existingQuestionId,
              status: "rejected",
              overlapScore: 1,
              validationErrors: {
                reason: "skipped_existing",
                sourceFingerprint: question.sourceFingerprint,
              },
            },
          });
        }

        continue;
      }

      const overlap = findMaxOverlap(question.stem, overlapCandidates);
      if (overlap.maxOverlap >= OVERLAP_THRESHOLD) {
        if (args.allowOverlap) {
          const createdStatus = "created_overlap_override" as const;

          if (!args.persist) {
            const dryRunId = `dry-run-${question.sourceFingerprint}`;
            decisions.push({
              lecture: question.lecture,
              quizFileName: question.quizFileName,
              questionIndex: question.questionIndex,
              stem: question.stem,
              status: createdStatus,
              reason: `Imported despite overlap ${overlap.maxOverlap.toFixed(3)} because --allow-overlap true.`,
              questionId: dryRunId,
              sourceFingerprint: question.sourceFingerprint,
              overlapScore: overlap.maxOverlap,
              overlapQuestionId: overlap.overlapQuestionId,
            });
            overlapCandidates.push({ id: dryRunId, stem: question.stem });
            existingByFingerprint.set(question.sourceFingerprint, dryRunId);
            continue;
          }

          const createdQuestion = await prisma.question.create({
            data: {
              type: "SBA",
              stem: question.stem,
              options: question.options,
              correctKey: question.correctKey,
              explanation: question.explanation,
              rationale: question.rationale,
              whyOthersWrong: question.whyOthersWrong,
              citations: question.citations,
              createdBy: "manual",
              status: "draft",
              source: {
                ...(question.source as Record<string, unknown>),
                overlapOverrideImport: true,
                overlapScore: overlap.maxOverlap,
                overlapQuestionId: overlap.overlapQuestionId,
              },
              sourceFingerprint: question.sourceFingerprint,
              ...(notebookLmTagId
                ? {
                    questionTags: {
                      create: [{ tagId: notebookLmTagId }],
                    },
                  }
                : {}),
            },
            select: { id: true },
          });

          if (runId) {
            await prisma.generatedQuestionItem.create({
              data: {
                runId,
                questionId: createdQuestion.id,
                status: "draft",
                overlapScore: overlap.maxOverlap,
                reviewerNotes: "Imported with NotebookLM overlap override.",
              },
            });
          }

          decisions.push({
            lecture: question.lecture,
            quizFileName: question.quizFileName,
            questionIndex: question.questionIndex,
            stem: question.stem,
            status: createdStatus,
            reason: `Imported despite overlap ${overlap.maxOverlap.toFixed(3)} because --allow-overlap true.`,
            questionId: createdQuestion.id,
            sourceFingerprint: question.sourceFingerprint,
            overlapScore: overlap.maxOverlap,
            overlapQuestionId: overlap.overlapQuestionId,
          });

          overlapCandidates.push({ id: createdQuestion.id, stem: question.stem });
          existingByFingerprint.set(question.sourceFingerprint, createdQuestion.id);
          continue;
        }

        decisions.push({
          lecture: question.lecture,
          quizFileName: question.quizFileName,
          questionIndex: question.questionIndex,
          stem: question.stem,
          status: "rejected_overlap",
          reason: `Overlap ${overlap.maxOverlap.toFixed(3)} exceeds threshold ${OVERLAP_THRESHOLD}.`,
          questionId: null,
          sourceFingerprint: question.sourceFingerprint,
          overlapScore: overlap.maxOverlap,
          overlapQuestionId: overlap.overlapQuestionId,
        });

        if (args.persist && runId) {
          await prisma.generatedQuestionItem.create({
            data: {
              runId,
              status: "rejected",
              overlapScore: overlap.maxOverlap,
              validationErrors: {
                reason: "rejected_overlap",
                overlapQuestionId: overlap.overlapQuestionId,
                sourceFingerprint: question.sourceFingerprint,
              },
            },
          });
        }

        continue;
      }

      if (!args.persist) {
        decisions.push({
          lecture: question.lecture,
          quizFileName: question.quizFileName,
          questionIndex: question.questionIndex,
          stem: question.stem,
          status: "created",
          reason: null,
          questionId: `dry-run-${question.sourceFingerprint}`,
          sourceFingerprint: question.sourceFingerprint,
          overlapScore: overlap.maxOverlap,
          overlapQuestionId: overlap.overlapQuestionId,
        });
        overlapCandidates.push({ id: `dry-run-${question.sourceFingerprint}`, stem: question.stem });
        existingByFingerprint.set(question.sourceFingerprint, `dry-run-${question.sourceFingerprint}`);
        continue;
      }

      const createdQuestion = await prisma.question.create({
        data: {
          type: "SBA",
          stem: question.stem,
          options: question.options,
          correctKey: question.correctKey,
          explanation: question.explanation,
          rationale: question.rationale,
          whyOthersWrong: question.whyOthersWrong,
          citations: question.citations,
          createdBy: "manual",
          status: "draft",
          source: question.source,
          sourceFingerprint: question.sourceFingerprint,
          ...(notebookLmTagId
            ? {
                questionTags: {
                  create: [{ tagId: notebookLmTagId }],
                },
              }
            : {}),
        },
        select: { id: true },
      });

      if (runId) {
        await prisma.generatedQuestionItem.create({
          data: {
            runId,
            questionId: createdQuestion.id,
            status: "draft",
            overlapScore: overlap.maxOverlap,
          },
        });
      }

      decisions.push({
        lecture: question.lecture,
        quizFileName: question.quizFileName,
        questionIndex: question.questionIndex,
        stem: question.stem,
        status: "created",
        reason: null,
        questionId: createdQuestion.id,
        sourceFingerprint: question.sourceFingerprint,
        overlapScore: overlap.maxOverlap,
        overlapQuestionId: overlap.overlapQuestionId,
      });

      overlapCandidates.push({ id: createdQuestion.id, stem: question.stem });
      existingByFingerprint.set(question.sourceFingerprint, createdQuestion.id);
    }

    if (args.persist && runId) {
      await prisma.generatedQuestionRun.update({
        where: { id: runId },
        data: {
          status: "completed",
          logs: {
            importKind: "notebooklm_quiz_bundle",
            zipPath,
            bundleId,
            tagName: args.tagName,
            totals: {
              csvRows: csvRows.length,
              quizFiles: quizEntries.length,
              questionsScanned: decisions.length,
              created: decisions.filter((decision) => decision.status === "created" || decision.status === "created_overlap_override").length,
              createdOverlapOverride: decisions.filter((decision) => decision.status === "created_overlap_override").length,
              rejectedOverlap: decisions.filter((decision) => decision.status === "rejected_overlap").length,
              skippedExisting: decisions.filter((decision) => decision.status === "skipped_existing").length,
              malformed: decisions.filter((decision) => decision.status === "malformed").length,
            },
          },
        },
      });
    }

    const report: ImportReport = {
      ok: true,
      zipPath,
      bundleId,
      persist: args.persist,
      tagName: args.tagName,
      totals: {
        csvRows: csvRows.length,
        quizFiles: quizEntries.length,
        questionsScanned: decisions.length,
        created: decisions.filter((decision) => decision.status === "created" || decision.status === "created_overlap_override").length,
        createdOverlapOverride: decisions.filter((decision) => decision.status === "created_overlap_override").length,
        rejectedOverlap: decisions.filter((decision) => decision.status === "rejected_overlap").length,
        skippedExisting: decisions.filter((decision) => decision.status === "skipped_existing").length,
        malformed: decisions.filter((decision) => decision.status === "malformed").length,
      },
      malformedExamples,
      decisions,
      runId,
    };

    await writeReport(reportPath, report);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

if (path.basename(process.argv[1] ?? "") === "import_notebooklm_quizzes.ts") {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
