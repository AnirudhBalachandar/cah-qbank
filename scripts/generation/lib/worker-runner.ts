import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { PrismaClient } from "@/lib/generated/prisma";
import { trigramOverlap } from "@/lib/server/generation/similarity";
import {
  validateGeneratedPayload,
  type GeneratedQuestionPayload,
} from "@/lib/server/generation/validator";

import { deriveAngleFamily, angleFamilySimilarity } from "./angle-family";
import { runCodexStructuredOutput } from "./codex-runner";
import {
  importWorkerReportSchema,
  overlapReportSchema,
  semanticOriginalityReportSchema,
  validationReportSchema,
  type BatchState,
  type ImportExecutionMode,
  type ImportWorkerReport,
  type OverlapReport,
  type SemanticOriginalityReport,
  type ValidationReport,
  type WorkflowBatch,
  type WorkflowManifest,
} from "./contracts";

const execFileAsync = promisify(execFile);
const LOCAL_OVERLAP_THRESHOLD = 0.35;
const ANGLE_FAMILY_REUSE_THRESHOLD = 0.78;
const SEMANTIC_REJECTION_CONFIDENCE_THRESHOLD = 0.75;
export const SEMANTIC_AUDITOR_TIMEOUT_MS = Number(process.env.CODEX_WORKFLOW_SEMANTIC_TIMEOUT_MS ?? 10_000);
export const IMPORT_WORKER_TIMEOUT_MS = 120_000;
export const IMPORT_WORKER_MAX_BUFFER_BYTES = 10 * 1024 * 1024;
const QUESTION_TYPE_TAGS = new Set(["SBA", "EMQ_STEM"]);

type ExecFileLike = (
  file: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    timeout: number;
    killSignal: NodeJS.Signals | number;
    maxBuffer: number;
  },
) => Promise<{ stdout: string; stderr: string }>;

function getExpectedCount(state: BatchState, batch: WorkflowBatch) {
  return state.attempts === 0 ? batch.targetCount : state.remaining;
}

function uniquePreservingOrder(values: string[]) {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    deduped.push(value);
  }

  return deduped;
}

function padAttemptNumber(attemptNumber: number) {
  return String(attemptNumber).padStart(2, "0");
}

function sanitizeImportRunId(runId: string) {
  const sanitized = runId
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return sanitized || "run";
}

export function buildImportBatchRunId({
  batchId,
  attemptNumber,
  mode = "live",
  artifactRunId,
}: {
  batchId: string;
  attemptNumber: number;
  mode?: ImportExecutionMode;
  artifactRunId?: string | null;
}) {
  const baseRunId = `${batchId}-attempt-${padAttemptNumber(attemptNumber)}`;
  if (mode === "live") {
    return baseRunId;
  }

  const suffix = artifactRunId ? `-dry-run-${sanitizeImportRunId(artifactRunId)}` : "-dry-run";
  return `${baseRunId}${suffix}`;
}

export function normalizeQuestionTags(tags: string[], batch: WorkflowBatch) {
  const trimmedTags = tags.map((tag) => tag.trim()).filter(Boolean);
  const withoutQuestionType = trimmedTags.filter((tag) => !QUESTION_TYPE_TAGS.has(tag));
  const withoutCurriculumArea = withoutQuestionType.filter((tag) => tag !== batch.curriculumArea);

  return uniquePreservingOrder([batch.curriculumArea, ...withoutCurriculumArea]);
}

export function normalizeGeneratedPayload(
  payload: GeneratedQuestionPayload,
  batch: WorkflowBatch,
): GeneratedQuestionPayload {
  return {
    questions: payload.questions.map((question) => ({
      ...question,
      options: [...question.options].sort((a, b) => a.key.localeCompare(b.key)),
      tags: normalizeQuestionTags(question.tags, batch),
      why_others_wrong: Object.fromEntries(
        Object.entries(question.why_others_wrong).filter(([key]) => key !== question.correctKey),
      ),
      citations: question.citations.map((citation) => ({
        ...citation,
        source: citation.source?.trim(),
        title: citation.title?.trim(),
      })),
    })),
  };
}

export async function runSchemaCitationStyleAuditor({
  manifest,
  batch,
  state,
  payload,
  attempt,
}: {
  manifest: WorkflowManifest;
  batch: WorkflowBatch;
  state: BatchState;
  payload: unknown;
  attempt: number;
}): Promise<ValidationReport> {
  const strictness = manifest.defaultStrictness;
  const validated = validateGeneratedPayload(payload, strictness);
  const issues: ValidationReport["issues"] = [];

  if (!validated.valid || !validated.data) {
    for (const error of validated.errors) {
      issues.push({
        questionIndex: null,
        category: "structural",
        severity: "error",
        message: error,
      });
    }
  } else {
    const expectedCount = getExpectedCount(state, batch);
    if (validated.data.questions.length !== expectedCount) {
      issues.push({
        questionIndex: null,
        category: "structural",
        severity: "error",
        message: `Expected ${expectedCount} questions but received ${validated.data.questions.length}.`,
      });
    }

    const allowedCurriculumAreas = new Set([
      "General Paediatrics",
      "Paediatric Sub-specialties",
      "Paediatric Surgery",
      "Emergency Paediatrics",
      "Adolescent Medicine",
      "Community-based Paediatrics",
    ]);

    for (const [index, question] of validated.data.questions.entries()) {
      if (question.tags[0] !== batch.curriculumArea) {
        issues.push({
          questionIndex: index,
          category: "scope",
          severity: "error",
          message: `First tag must be ${batch.curriculumArea}.`,
        });
      }

      if (!allowedCurriculumAreas.has(question.tags[0] ?? "")) {
        issues.push({
          questionIndex: index,
          category: "format",
          severity: "error",
          message: "First tag must be a supported curriculum area.",
        });
      }

      if (strictness === "strict_internal" && question.citations.some((citation) => citation.type !== "internal")) {
        issues.push({
          questionIndex: index,
          category: "evidence_mode",
          severity: "error",
          message: "strict_internal batches may only use internal citations.",
        });
      }
    }
  }

  return validationReportSchema.parse({
    workflowId: manifest.workflowId,
    batchId: batch.batchId,
    attempt,
    ok: issues.length === 0,
    structuralOk: !issues.some((issue) => issue.category === "structural" && issue.severity === "error"),
    formatOk: !issues.some((issue) => issue.category === "format" && issue.severity === "error"),
    scopeOk: !issues.some((issue) => issue.category === "scope" && issue.severity === "error"),
    sourcePolicyOk: !issues.some((issue) => issue.category === "source_policy" && issue.severity === "error"),
    evidenceModeOk: !issues.some((issue) => issue.category === "evidence_mode" && issue.severity === "error"),
    issues,
  });
}

type StemRow = {
  id: string;
  stem: string;
};

async function loadOverlapCorpus(importedQuestionIds: string[]) {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.question.findMany({
      where: { status: { in: ["published", "draft"] } },
      select: { id: true, stem: true },
    });
    const importedIdSet = new Set(importedQuestionIds);
    return {
      rows,
      importedIdSet,
    };
  } finally {
    await prisma.$disconnect();
  }
}

function findExistingOverlap(stem: string, rows: StemRow[]) {
  let bestScore = 0;
  let bestId: string | null = null;
  for (const row of rows) {
    const score = trigramOverlap(stem, row.stem);
    if (score > bestScore) {
      bestScore = score;
      bestId = row.id;
    }
  }
  return { bestScore, bestId };
}

export async function runOverlapAuditor({
  manifest,
  batch,
  state,
  payload,
  attempt,
}: {
  manifest: WorkflowManifest;
  batch: WorkflowBatch;
  state: BatchState;
  payload: GeneratedQuestionPayload;
  attempt: number;
}): Promise<OverlapReport> {
  const { rows, importedIdSet } = await loadOverlapCorpus(state.importedQuestionIds);
  const acceptedIndices: number[] = [];
  const rejectedIndices: number[] = [];
  const findings: OverlapReport["findings"] = [];
  const acceptedInAttempt: Array<{ index: number; stem: string; angleFamily: string }> = [];

  for (const [index, question] of payload.questions.entries()) {
    const angleFamily = deriveAngleFamily(question);
    const acceptedAngleMatch = state.acceptedAngleFamilies.find(
      (family) => angleFamilySimilarity(family, angleFamily) >= ANGLE_FAMILY_REUSE_THRESHOLD,
    );
    if (acceptedAngleMatch) {
      rejectedIndices.push(index);
      findings.push({
        questionIndex: index,
        classification: "accepted_angle_reuse",
        angleFamily,
        matchedQuestionId: null,
        score: Number(angleFamilySimilarity(acceptedAngleMatch, angleFamily).toFixed(4)),
        reason: `Reuses accepted angle family: ${acceptedAngleMatch}`,
      });
      continue;
    }

    const rejectedAngleMatch = state.rejectedAngleFamilies.find(
      (family) => angleFamilySimilarity(family, angleFamily) >= ANGLE_FAMILY_REUSE_THRESHOLD,
    );
    if (rejectedAngleMatch) {
      rejectedIndices.push(index);
      findings.push({
        questionIndex: index,
        classification: "rejected_angle_reuse",
        angleFamily,
        matchedQuestionId: null,
        score: Number(angleFamilySimilarity(rejectedAngleMatch, angleFamily).toFixed(4)),
        reason: `Reuses rejected angle family: ${rejectedAngleMatch}`,
      });
      continue;
    }

    const inAttemptAngleMatch = acceptedInAttempt.find(
      (entry) => angleFamilySimilarity(entry.angleFamily, angleFamily) >= ANGLE_FAMILY_REUSE_THRESHOLD,
    );
    if (inAttemptAngleMatch) {
      rejectedIndices.push(index);
      findings.push({
        questionIndex: index,
        classification: "same_teaching_point",
        angleFamily,
        matchedQuestionId: null,
        score: Number(angleFamilySimilarity(inAttemptAngleMatch.angleFamily, angleFamily).toFixed(4)),
        reason: `Too close to accepted question ${inAttemptAngleMatch.index + 1} in the same attempt.`,
      });
      continue;
    }

    const localAttemptOverlap = acceptedInAttempt
      .map((entry) => ({
        entry,
        score: trigramOverlap(question.stem_markdown, entry.stem),
      }))
      .sort((a, b) => b.score - a.score)[0];
    if (localAttemptOverlap && localAttemptOverlap.score >= LOCAL_OVERLAP_THRESHOLD) {
      rejectedIndices.push(index);
      findings.push({
        questionIndex: index,
        classification: "local_batch_overlap",
        angleFamily,
        matchedQuestionId: null,
        score: Number(localAttemptOverlap.score.toFixed(4)),
        reason: `Stem overlaps with accepted question ${localAttemptOverlap.entry.index + 1} in the same attempt.`,
      });
      continue;
    }

    const existingOverlap = findExistingOverlap(question.stem_markdown, rows);
    if (existingOverlap.bestScore >= LOCAL_OVERLAP_THRESHOLD) {
      rejectedIndices.push(index);
      findings.push({
        questionIndex: index,
        classification: importedIdSet.has(existingOverlap.bestId ?? "") ? "local_batch_overlap" : "existing_bank_overlap",
        angleFamily,
        matchedQuestionId: existingOverlap.bestId,
        score: Number(existingOverlap.bestScore.toFixed(4)),
        reason: `Stem overlaps with existing local question ${existingOverlap.bestId ?? "unknown"}.`,
      });
      continue;
    }

    acceptedIndices.push(index);
    acceptedInAttempt.push({
      index,
      stem: question.stem_markdown,
      angleFamily,
    });
    findings.push({
      questionIndex: index,
      classification: "accepted",
      angleFamily,
      matchedQuestionId: null,
      score: null,
      reason: "Passed local overlap and angle-family checks.",
    });
  }

  return overlapReportSchema.parse({
    workflowId: manifest.workflowId,
    batchId: batch.batchId,
    attempt,
    generatedCount: payload.questions.length,
    acceptedIndices,
    rejectedIndices,
    findings,
    warnings: rejectedIndices.length === payload.questions.length
      ? ["All generated questions were rejected by the overlap/originality auditor."]
      : [],
  });
}

export async function runSemanticOriginalityAuditor({
  repoRoot,
  manifest,
  batch,
  state,
  payload,
  attempt,
}: {
  repoRoot: string;
  manifest: WorkflowManifest;
  batch: WorkflowBatch;
  state: BatchState;
  payload: GeneratedQuestionPayload;
  attempt: number;
}): Promise<SemanticOriginalityReport> {
  if (!manifest.workerLanes.semanticOriginalityAudit) {
    return semanticOriginalityReportSchema.parse({
      workflowId: manifest.workflowId,
      batchId: batch.batchId,
      attempt,
      findings: [],
      warnings: [],
    });
  }

  const schemaPath = path.join(repoRoot, "schemas", "semantic-originality-report.schema.json");
  const prompt = [
    "You are a semantic originality auditor for a notes-first paediatrics MCQ workflow.",
    "Assess only semantic overlap and originality risk. Do not evaluate factual correctness or formatting.",
    "Flag a question only when it clearly reuses a teaching point, discriminator, scenario family, or angle family in a way that would be too close for a replacement batch.",
    "Be conservative. When in doubt, do not reject.",
    `Workflow: ${manifest.workflowId}`,
    `Batch: ${batch.batchId} ${batch.topicCluster}`,
    `Attempt: ${attempt}`,
    `Curriculum area: ${batch.curriculumArea}`,
    `Subtopics: ${batch.subtopics.join(" | ")}`,
    `Accepted angle families to avoid: ${state.acceptedAngleFamilies.join(" || ") || "none"}`,
    `Rejected angle families to avoid: ${state.rejectedAngleFamilies.join(" || ") || "none"}`,
    "Return only issues. Do not include accepted/clean questions in findings.",
    "Allowed classifications: existing_bank_overlap, local_batch_overlap, accepted_angle_reuse, rejected_angle_reuse, same_teaching_point.",
    "Set shouldReject=true only for high-confidence issues.",
    "Questions to audit:",
    JSON.stringify(payload.questions.map((question, index) => ({
      questionIndex: index,
      stem_markdown: question.stem_markdown,
      correctKey: question.correctKey,
      explanation_markdown: question.explanation_markdown,
      key_takeaways: question.key_takeaways,
      tags: question.tags,
      angleFamily: deriveAngleFamily(question),
    })), null, 2),
    "",
    "Return exactly this JSON object shape:",
    JSON.stringify({
      workflowId: manifest.workflowId,
      batchId: batch.batchId,
      attempt,
      findings: [
        {
          questionIndex: 0,
          classification: "same_teaching_point",
          angleFamily: "string",
          confidence: 0.9,
          shouldReject: true,
          reason: "string",
        },
      ],
      warnings: ["string"],
    }, null, 2),
  ].join("\n\n");

  try {
    const result = await runCodexStructuredOutput<SemanticOriginalityReport>({
      cwd: repoRoot,
      prompt,
      schemaPath,
      timeoutMs: SEMANTIC_AUDITOR_TIMEOUT_MS,
    });
    const parsed = semanticOriginalityReportSchema.parse(result.data);
    return {
      ...parsed,
      findings: parsed.findings.filter((finding) => finding.confidence >= SEMANTIC_REJECTION_CONFIDENCE_THRESHOLD),
    };
  } catch (error) {
    return semanticOriginalityReportSchema.parse({
      workflowId: manifest.workflowId,
      batchId: batch.batchId,
      attempt,
      findings: [],
      warnings: [`Semantic originality worker returned unusable output: ${error instanceof Error ? error.message : String(error)}`],
    });
  }
}

function normalizeImportWorkerError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const signal = typeof error === "object" && error !== null && "signal" in error ? String((error as { signal?: unknown }).signal ?? "") : "";
  const killed = typeof error === "object" && error !== null && "killed" in error ? Boolean((error as { killed?: unknown }).killed) : false;

  if (code === "ETIMEDOUT" || killed || signal === "SIGTERM" || signal === "SIGKILL") {
    return `Import worker timed out after ${IMPORT_WORKER_TIMEOUT_MS}ms`;
  }

  return `Import worker failed: ${message}`;
}

function buildImportFailureReport({
  batchId,
  payload,
  error,
}: {
  batchId: string;
  payload: GeneratedQuestionPayload;
  error: string;
}): ImportWorkerReport {
  return importWorkerReportSchema.parse({
    ok: false,
    mode: "live",
    persisted: false,
    batchId,
    runId: null,
    totalQuestions: payload.questions.length,
    created: 0,
    rejected: payload.questions.length,
    skippedExisting: 0,
    wouldImport: payload.questions.length,
    decisions: [],
    error,
  });
}

export function buildDryRunImportReport({
  batchId,
  payload,
  runId,
  reason = "DB import skipped in dry-run mode.",
}: {
  batchId: string;
  payload: GeneratedQuestionPayload;
  runId?: string | null;
  reason?: string;
}): ImportWorkerReport {
  return importWorkerReportSchema.parse({
    ok: true,
    mode: "dry_run",
    persisted: false,
    batchId,
    runId: runId ?? null,
    totalQuestions: payload.questions.length,
    created: 0,
    rejected: 0,
    skippedExisting: 0,
    wouldImport: payload.questions.length,
    decisions: payload.questions.map((_, index) => ({
      index,
      status: "skipped_no_import",
      questionId: null,
      reason,
    })),
  });
}

export async function runImportWorker({
  repoRoot,
  payload,
  inputPath,
  reportPath,
  batchId,
  execFileImpl = execFileAsync as ExecFileLike,
}: {
  repoRoot: string;
  payload: GeneratedQuestionPayload;
  inputPath: string;
  reportPath: string;
  batchId: string;
  execFileImpl?: ExecFileLike;
}): Promise<ImportWorkerReport> {
  await fs.writeFile(inputPath, JSON.stringify(payload, null, 2), "utf8");

  try {
    await execFileImpl("pnpm", [
      "tsx",
      "scripts/generation/import_manual_generated_json.ts",
      "--input",
      inputPath,
      "--persist-db",
      "true",
      "--report-out",
      reportPath,
      "--batch-id",
      batchId,
    ], {
      cwd: repoRoot,
      env: process.env,
      timeout: IMPORT_WORKER_TIMEOUT_MS,
      killSignal: "SIGKILL",
      maxBuffer: IMPORT_WORKER_MAX_BUFFER_BYTES,
    });

    const raw = await fs.readFile(reportPath, "utf8");
    return importWorkerReportSchema.parse(JSON.parse(raw));
  } catch (error) {
    const normalizedError = normalizeImportWorkerError(error);
    const failureReport = buildImportFailureReport({
      batchId,
      payload,
      error: normalizedError,
    });
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(failureReport, null, 2), "utf8");
    throw new Error(normalizedError);
  }
}
