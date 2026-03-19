import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { type GeneratedQuestionPayload, validateGeneratedPayload } from "@/lib/server/generation/validator";

import { buildInitialPrompt } from "./build_initial_prompt";
import { buildReplacementPrompt } from "./build_replacement_prompt";
import { buildReviewPack, synthesizeReviewPack, writeReviewPackArtifacts } from "./build_review_pack";
import { buildBatchArtifactContext, ensureBatchArtifactDirs, ensureWorkflowArtifactDirs, writeJsonArtifact, writeTextArtifact } from "./lib/artifacts";
import { deriveAngleFamily, uniqueAngleFamilies } from "./lib/angle-family";
import {
  batchAttemptResultSchema,
  batchStateSchema,
  mergedDecisionReportSchema,
  type ArtifactNamespace,
  type BatchAttemptMode,
  type BatchAttemptResult,
  type BatchAttemptTerminalMode,
  type BatchState,
} from "./lib/contracts";
import {
  type CodexStructuredResult,
  runCodexStructuredOutput,
  runCodexStructuredOutputJob,
  runCodexTextOutputJob,
  type CodexPendingError,
} from "./lib/codex-runner";
import { getBatchFromManifest, loadWorkflowManifest, sortBatchIds } from "./lib/manifest";
import { mergeWorkerReports } from "./lib/report-merge";
import { getSaturationDecision } from "./lib/saturation";
import { buildSourcePack } from "./lib/source-pack";
import {
  applyPrelaunchBatchTerminalState,
  abandonBatchAttempt,
  beginBatchAttempt,
  completeBatchAttempt,
  failBatchAttempt,
  isBatchActiveJobStale,
  loadBatchState,
  loadOrInitBatchState,
  saveBatchState,
  touchBatchActiveJob,
} from "./lib/state";
import {
  buildDryRunImportReport,
  buildImportBatchRunId,
  normalizeGeneratedPayload,
  runImportWorker,
  runOverlapAuditor,
  runSemanticOriginalityAuditor,
  runSchemaCitationStyleAuditor,
} from "./lib/worker-runner";
import { runAustralianVerification, summarizeVerificationFindings } from "./lib/verification";

type Command =
  | { name: "run-batch"; workflow: string; batch: string; force: boolean; dryRun: boolean; noImport: boolean; artifactRunId?: string }
  | { name: "run-batch-worker"; workflow: string; batch: string; force: boolean; noImport: boolean; jobId?: string }
  | { name: "run-range"; workflow: string; from: string; to: string; continueOnFailure: boolean; dryRun: boolean; noImport: boolean; artifactRunId?: string }
  | { name: "resume"; workflow: string; batch: string }
  | { name: "review-pack"; workflow: string; batch?: string; from?: string; to?: string };

type ExecutionContext = {
  dryRun: boolean;
  noImport: boolean;
  persistState: boolean;
  artifactNamespace: ArtifactNamespace;
  artifactRunId: string | null;
};

type DryRunAttemptResult = {
  attemptNumber: number;
  mode: BatchAttemptMode;
  generatedCount: number;
  overlapAcceptedCount: number;
  acceptedCount: number;
  rejectedCount: number;
  remaining: number;
  importSkipped: true;
  validationOk: boolean;
  importable: boolean;
  promptPath: string;
  rawOutputPath: string;
  mergedDecisionReportPath: string;
  importReportPath: string;
};

type DryRunResultPayload = {
  ok: true;
  workflowId: string;
  batchId: string;
  dryRun: true;
  noImport: true;
  foregroundOnly: true;
  status: BatchState["status"];
  acceptedTotal: number;
  rejectedTotal: number;
  remaining: number;
  saturationReason: string | null;
  nextAction: string | null;
  initialState: {
    status: BatchState["status"];
    acceptedTotal: number;
    rejectedTotal: number;
    remaining: number;
  };
  attempts: DryRunAttemptResult[];
  artifactPaths: {
    batchDir: string;
    rawDir: string;
    reportsDir: string;
    promptsDir: string;
    summaryPath: string | null;
    artifactRunId: string | null;
  } | null;
};

type BatchCommandResult = BatchState | DryRunResultPayload;

function usage() {
  console.log(
    [
      "Usage:",
      "  pnpm tsx scripts/generation/run_notes_workflow.ts run-batch --workflow <id> --batch <BXX> [--force] [--dry-run] [--no-import] [--artifact-run-id <id>]",
      "  pnpm tsx scripts/generation/run_notes_workflow.ts run-range --workflow <id> --from <BXX> --to <BYY> [--continue-on-failure] [--dry-run] [--no-import] [--artifact-run-id <id>]",
      "  pnpm tsx scripts/generation/run_notes_workflow.ts resume --workflow <id> --batch <BXX>",
      "  pnpm tsx scripts/generation/run_notes_workflow.ts review-pack --workflow <id> [--batch <BXX> | --from <BXX> --to <BYY>]",
    ].join("\n"),
  );
}

// `run-batch-worker` is intentionally internal to support detached background execution.
// Public batch loop primitives remain: `run-batch`, `run-range`, and `resume`.

export function parseArgs(argv: string[]): Command {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h") {
    usage();
    process.exit(0);
  }

  const args = new Map<string, string>();
  const flags = new Set<string>();

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token.startsWith("--")) {
      const next = rest[index + 1];
      if (!next || next.startsWith("--")) {
        flags.add(token);
        continue;
      }
      args.set(token, next);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  const workflow = args.get("--workflow");
  if (!workflow) {
    throw new Error("Missing required --workflow argument.");
  }
  const dryRun = flags.has("--dry-run") || flags.has("--no-import");
  const noImport = flags.has("--no-import");

  if (command === "run-batch") {
    const batch = args.get("--batch");
    if (!batch) throw new Error("Missing required --batch argument.");
    return {
      name: "run-batch",
      workflow,
      batch,
      force: flags.has("--force"),
      dryRun,
      noImport,
      artifactRunId: args.get("--artifact-run-id"),
    };
  }

  if (command === "run-batch-worker") {
    const batch = args.get("--batch");
    if (!batch) throw new Error("Missing required --batch argument.");
    if (dryRun || noImport) {
      throw new Error("run-batch-worker does not support --dry-run or --no-import.");
    }
    return {
      name: "run-batch-worker",
      workflow,
      batch,
      force: flags.has("--force"),
      noImport,
      jobId: args.get("--job-id"),
    };
  }

  if (command === "run-range") {
    const from = args.get("--from");
    const to = args.get("--to");
    if (!from || !to) throw new Error("Missing required --from/--to arguments.");
    return {
      name: "run-range",
      workflow,
      from,
      to,
      continueOnFailure: flags.has("--continue-on-failure"),
      dryRun,
      noImport,
      artifactRunId: args.get("--artifact-run-id"),
    };
  }

  if (command === "resume") {
    const batch = args.get("--batch");
    if (!batch) throw new Error("Missing required --batch argument.");
    if (dryRun || noImport) {
      throw new Error("resume does not support --dry-run or --no-import.");
    }
    return { name: "resume", workflow, batch };
  }

  if (command === "review-pack") {
    return {
      name: "review-pack",
      workflow,
      batch: args.get("--batch"),
      from: args.get("--from"),
      to: args.get("--to"),
    };
  }

  throw new Error(`Unknown command: ${command}`);
}

function determineMode(state: BatchState): BatchAttemptMode {
  if (state.status === "running") return "resume";
  if (state.acceptedTotal === 0 && state.rejectedAngleFamilies.length === 0) return "initial";
  return "replacement";
}

function createExecutionContext(dryRun: boolean, noImport: boolean, artifactRunId?: string): ExecutionContext {
  return {
    dryRun,
    noImport: dryRun || noImport,
    persistState: !dryRun,
    artifactNamespace: dryRun ? "dry_run" : "live",
    artifactRunId: dryRun ? artifactRunId?.trim() || `dry-run-${randomUUID().slice(0, 8)}` : null,
  };
}

function cloneBatchState(state: BatchState): BatchState {
  return batchStateSchema.parse(JSON.parse(JSON.stringify(state)) as BatchState);
}

async function saveBatchStateIfEnabled(state: BatchState, executionContext: ExecutionContext) {
  if (!executionContext.persistState) {
    return;
  }
  await saveBatchState(state);
}

export function resolveAcceptedCountForAttempt({
  importSkipped,
  mergedAcceptedCount,
  createdCount,
}: {
  importSkipped: boolean;
  mergedAcceptedCount: number;
  createdCount: number;
}) {
  return importSkipped ? mergedAcceptedCount : createdCount;
}

function getDryRunAttemptTerminalMode(status: BatchState["status"]): BatchAttemptTerminalMode {
  if (status === "completed") return "preview_completed";
  if (status === "saturated") return "preview_saturated";
  return "failed";
}

function getLiveAttemptTerminalMode(status: BatchState["status"]): BatchAttemptTerminalMode {
  if (status === "completed" || status === "saturated" || status === "failed") return status;
  return "failed";
}

function buildAttemptResultPayload({
  state,
  workflowId,
  batchId,
  attemptNumber,
  mode,
  importMode,
  startedAt,
  lastHeartbeatAt,
  completedAt,
  acceptedCount,
  rejectedCount,
  remaining,
  acceptedTotal,
  rejectedTotal,
  saturationReason,
  artifactPaths,
  phase,
  isDryRun,
  terminalModeOverride,
  errorMessage,
}: {
  state: BatchState;
  workflowId: string;
  batchId: string;
  attemptNumber: number;
  mode: BatchAttemptMode;
  importMode: "live" | "dry_run";
  startedAt: string;
  lastHeartbeatAt?: string | null;
  completedAt: string;
  acceptedCount: number;
  rejectedCount: number;
  remaining: number;
  acceptedTotal: number;
  rejectedTotal: number;
  saturationReason: string | null;
  artifactPaths: {
    rawOutputPath: string;
    draftOutputPath: string | null | undefined;
    repairOutputPath: string | null | undefined;
    sourcePackPath: string;
    promptPath: string;
    overlapReportPath: string;
    semanticOverlapReportPath: string | null | undefined;
    validationReportPath: string;
    australianVerificationReportPath: string;
    mergedDecisionReportPath: string;
    importReportPath: string | null;
    attemptResultPath?: string;
    batchResultPath?: string;
    summaryPath?: string | null;
  };
  phase: string;
  terminalModeOverride?: BatchAttemptTerminalMode;
  isDryRun: boolean;
  errorMessage?: string | null;
}): BatchAttemptResult {
  return batchAttemptResultSchema.parse({
    workflowId,
    batchId,
    attemptNumber,
    terminalMode: terminalModeOverride
      ?? (isDryRun ? getDryRunAttemptTerminalMode(state.status) : getLiveAttemptTerminalMode(state.status)),
    mode,
    importMode,
    startedAt,
    lastHeartbeatAt: lastHeartbeatAt ?? null,
    completedAt,
    acceptedCount,
    rejectedCount,
    remaining,
    acceptedTotal,
    rejectedTotal,
    saturationReason,
    projectedAcceptanceSummary: isDryRun
      ? {
          acceptedTotalProjected: acceptedTotal,
          rejectedTotalProjected: rejectedTotal,
          remainingProjected: remaining,
        }
      : undefined,
    artifactPaths: {
      rawOutputPath: artifactPaths.rawOutputPath,
      draftOutputPath: artifactPaths.draftOutputPath,
      repairOutputPath: artifactPaths.repairOutputPath,
      sourcePackPath: artifactPaths.sourcePackPath,
      promptPath: artifactPaths.promptPath,
      overlapReportPath: artifactPaths.overlapReportPath,
      semanticOverlapReportPath: artifactPaths.semanticOverlapReportPath,
      validationReportPath: artifactPaths.validationReportPath,
      australianVerificationReportPath: artifactPaths.australianVerificationReportPath,
      mergedDecisionReportPath: artifactPaths.mergedDecisionReportPath,
      importReportPath: artifactPaths.importReportPath,
      attemptResultPath: artifactPaths.attemptResultPath,
      batchResultPath: artifactPaths.batchResultPath,
      summaryPath: artifactPaths.summaryPath,
    },
    phase,
    errorMessage: errorMessage ?? null,
  });
}

async function writeAttemptResultArtifacts({
  targetPaths,
  payload,
}: {
  targetPaths: {
    attemptResultPath: string;
    batchResultPath?: string;
  };
  payload: BatchAttemptResult;
}) {
  await writeJsonArtifact(targetPaths.attemptResultPath, payload);
  if (targetPaths.batchResultPath) {
    await writeJsonArtifact(targetPaths.batchResultPath, payload);
  }
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function coercePositiveInt(raw: string | undefined, fallback: number) {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

const DEFAULT_GENERATION_CHUNK_SIZE = coercePositiveInt(process.env.CODEX_WORKFLOW_MAX_GENERATION_CHUNK_SIZE, 6);
const INITIAL_GENERATION_CHUNK_SIZE = coercePositiveInt(
  process.env.CODEX_WORKFLOW_INITIAL_GENERATION_CHUNK_SIZE,
  DEFAULT_GENERATION_CHUNK_SIZE,
);
const REPLACEMENT_GENERATION_CHUNK_SIZE = coercePositiveInt(
  process.env.CODEX_WORKFLOW_REPLACEMENT_GENERATION_CHUNK_SIZE,
  4,
);
const DRAFT_GENERATION_WAIT_SLICE_MS = Number(
  process.env.CODEX_WORKFLOW_DRAFT_WAIT_SLICE_MS ?? process.env.CODEX_WORKFLOW_DRAFT_TIMEOUT_MS ?? 30_000,
);
const DRAFT_GENERATION_MAX_WALL_MS = Number(process.env.CODEX_WORKFLOW_DRAFT_MAX_WALL_MS ?? 20 * 60_000);
const STRUCTURED_GENERATION_TIMEOUT_MS = Number(process.env.CODEX_WORKFLOW_STRUCTURED_TIMEOUT_MS ?? Math.min(DRAFT_GENERATION_MAX_WALL_MS, 8 * 60_000));
const REPAIR_GENERATION_TIMEOUT_MS = Number(process.env.CODEX_WORKFLOW_REPAIR_TIMEOUT_MS ?? 180_000);
const CONTROLLER_POLL_INTERVAL_MS = Number(process.env.CODEX_WORKFLOW_POLL_INTERVAL_MS ?? 1_000);
const CONTROLLER_WAIT_TIMEOUT_MS = Number(process.env.CODEX_WORKFLOW_WAIT_TIMEOUT_MS ?? 30 * 60_000);
const ACTIVE_JOB_STALE_MS = Number(process.env.CODEX_WORKFLOW_ACTIVE_JOB_STALE_MS ?? 15 * 60 * 1000);

function nowIso() {
  return new Date().toISOString();
}

function stripMarkdownCodeFence(raw: string) {
  const trimmed = raw.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fencedMatch ? fencedMatch[1].trim() : trimmed;
}

function extractJsonCandidates(raw: string) {
  const trimmed = raw.trim();
  const stripped = stripMarkdownCodeFence(trimmed);
  const candidates = [trimmed, stripped];

  const objectStart = stripped.indexOf("{");
  const objectEnd = stripped.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd !== -1 && objectEnd > objectStart) {
    candidates.push(stripped.slice(objectStart, objectEnd + 1));
  }

  return Array.from(new Set(candidates.map((candidate) => candidate.trim()).filter(Boolean)));
}

function parseDraftPayload(raw: string): GeneratedQuestionPayload {
  let lastError: Error | null = null;
  for (const candidate of extractJsonCandidates(raw)) {
    try {
      return JSON.parse(candidate) as GeneratedQuestionPayload;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw new Error(`Could not parse Codex draft as JSON: ${lastError?.message ?? "unknown parse error"}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPidAlive(pid: number | null | undefined) {
  if (!pid || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function resolveGenerationChunkSize({
  mode,
  remainingCount,
  isFirstChunk = false,
}: {
  mode: BatchAttemptMode;
  remainingCount: number;
  isFirstChunk?: boolean;
}) {
  const boundedRemaining = Math.max(1, remainingCount);
  if (isFirstChunk) {
    return boundedRemaining;
  }
  const target = mode === "initial" ? INITIAL_GENERATION_CHUNK_SIZE : REPLACEMENT_GENERATION_CHUNK_SIZE;
  return Math.max(1, Math.min(target, boundedRemaining));
}

function buildBatchStatusPayload(state: BatchState, executionContext?: ExecutionContext) {
  return {
    ok: state.status !== "failed",
    workflowId: state.workflowId,
    batchId: state.batchId,
    status: state.status,
    dryRun: executionContext?.dryRun ?? false,
    noImport: executionContext?.noImport ?? false,
    acceptedTotal: state.acceptedTotal,
    remaining: state.remaining,
    saturationReason: state.saturationReason,
    nextAction: state.nextAction,
    summaryPath: state.artifactPaths.summaryPath,
    artifactPaths: {
      batchDir: state.artifactPaths.batchDir,
      rawDir: state.artifactPaths.rawDir,
      reportsDir: state.artifactPaths.reportsDir,
      promptsDir: state.artifactPaths.promptsDir,
      summaryPath: state.artifactPaths.summaryPath,
    },
    activeJob: state.activeJob
      ? {
          jobId: state.activeJob.jobId,
          pid: state.activeJob.pid,
          phase: state.activeJob.phase,
          attemptNumber: state.activeJob.attemptNumber,
          mode: state.activeJob.mode,
          logPath: state.activeJob.logPath,
          heartbeatAt: state.activeJob.heartbeatAt,
        }
      : null,
  };
}

function buildDryRunResultPayload({
  state,
  initialState,
  executionContext,
  attempts,
}: {
  state: BatchState;
  initialState: BatchState;
  executionContext: ExecutionContext;
  attempts: DryRunAttemptResult[];
}): DryRunResultPayload {
  return {
    ok: true,
    workflowId: state.workflowId,
    batchId: state.batchId,
    dryRun: true,
    noImport: true,
    foregroundOnly: true,
    status: state.status,
    acceptedTotal: state.acceptedTotal,
    rejectedTotal: state.rejectedTotal,
    remaining: state.remaining,
    saturationReason: state.saturationReason,
    nextAction: state.nextAction,
    initialState: {
      status: initialState.status,
      acceptedTotal: initialState.acceptedTotal,
      rejectedTotal: initialState.rejectedTotal,
      remaining: initialState.remaining,
    },
    attempts,
    artifactPaths: attempts.length > 0 && state.artifactPaths
      ? {
          batchDir: state.artifactPaths.batchDir,
          rawDir: state.artifactPaths.rawDir,
          reportsDir: state.artifactPaths.reportsDir,
          promptsDir: state.artifactPaths.promptsDir,
          summaryPath: state.artifactPaths.summaryPath ?? null,
          artifactRunId: executionContext.artifactRunId,
        }
      : null,
  };
}

function isDryRunResult(result: BatchCommandResult): result is DryRunResultPayload {
  return "dryRun" in result && result.dryRun;
}

function buildRepairPrompt({
  draftText,
  strictness,
  requestedCount,
}: {
  draftText: string;
  strictness: "strict_internal" | "augmented";
  requestedCount: number;
}) {
  return [
    "Repair the invalid draft into schema-valid JSON only.",
    `Return exactly ${requestedCount} question object${requestedCount === 1 ? "" : "s"} inside the top-level {"questions":[...]} shape.`,
    "Do not add markdown fences or prose.",
    "Preserve the draft's intended teaching points and Australian paediatrics framing.",
    "Keep the question type as SBA with exactly 5 options A-E and one best answer.",
    strictness === "strict_internal"
      ? "Do not add external citations. If a citation field value is unknown, use null rather than inventing facts."
      : "Prefer internal citations; only keep external citations if already present in the draft.",
    "For why_others_wrong, ensure the 4 incorrect options have real explanations. If the schema requires the correct option key too, keep that entry brief and neutral.",
    "Draft to repair:",
    draftText.trim(),
  ].join("\n\n");
}

type StructuredOutputJobRunner = typeof runCodexStructuredOutputJob;
type TextOutputJobRunner = typeof runCodexTextOutputJob;

export async function generateStructuredChunk({
  repoRoot,
  batch,
  strictness,
  requestedCount,
  promptArtifactPath,
  draftArtifactPath,
  repairArtifactPath,
  repairRetries,
  onPending,
  runStructuredOutputJobImpl = runCodexStructuredOutputJob,
  runTextOutputJobImpl = runCodexTextOutputJob,
}: {
  repoRoot: string;
  batch: ReturnType<typeof getBatchFromManifest>;
  strictness: "strict_internal" | "augmented";
  requestedCount: number;
  promptArtifactPath: string;
  draftArtifactPath: string;
  repairArtifactPath: string;
  repairRetries: number;
  onPending?: (error: CodexPendingError) => Promise<void>;
  runStructuredOutputJobImpl?: StructuredOutputJobRunner;
  runTextOutputJobImpl?: TextOutputJobRunner;
}): Promise<{
  payload: GeneratedQuestionPayload;
  usage: {
    model: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
  repaired: boolean;
}> {
  const structuredDraftArtifactPath = draftArtifactPath;
  const structuredStdoutArtifactPath = structuredDraftArtifactPath.replace(/\.txt$/, ".stdout.jsonl");
  const structuredStderrArtifactPath = structuredDraftArtifactPath.replace(/\.txt$/, ".stderr.log");
  const structuredJobArtifactPath = structuredDraftArtifactPath.replace(/\.txt$/, ".job.json");
  const fallbackDraftArtifactPath = draftArtifactPath.replace(/\.txt$/, ".fallback.txt");
  const fallbackStdoutArtifactPath = fallbackDraftArtifactPath.replace(/\.txt$/, ".stdout.jsonl");
  const fallbackStderrArtifactPath = fallbackDraftArtifactPath.replace(/\.txt$/, ".stderr.log");
  const fallbackJobArtifactPath = fallbackDraftArtifactPath.replace(/\.txt$/, ".job.json");
  const schemaPath = path.join(repoRoot, "schemas", "generated-batch.schema.json");

  let structuredDraft: CodexStructuredResult<GeneratedQuestionPayload> | null = null;
  let structuredDraftText: string | null = null;
  while (!structuredDraft) {
    try {
      structuredDraft = await runStructuredOutputJobImpl<GeneratedQuestionPayload>({
        cwd: repoRoot,
        promptPath: promptArtifactPath,
        outputPath: structuredDraftArtifactPath,
        stdoutPath: structuredStdoutArtifactPath,
        stderrPath: structuredStderrArtifactPath,
        jobPath: structuredJobArtifactPath,
        schemaPath,
        waitSliceMs: DRAFT_GENERATION_WAIT_SLICE_MS,
        maxWallMs: STRUCTURED_GENERATION_TIMEOUT_MS,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "CodexPendingError" && onPending) {
        await onPending(error as CodexPendingError);
        continue;
      }
      break;
    }
  }

  if (structuredDraft) {
    structuredDraftText = JSON.stringify(structuredDraft.data, null, 2);
    const structuredValidation = validateGeneratedPayload(structuredDraft.data, strictness);
    if (structuredValidation.valid && structuredValidation.data) {
      return {
        payload: normalizeGeneratedPayload(structuredValidation.data, batch),
        usage: {
          model: process.env.CODEX_MODEL?.trim() || null,
          inputTokens: structuredDraft.usage.inputTokens,
          outputTokens: structuredDraft.usage.outputTokens,
          totalTokens: structuredDraft.usage.inputTokens !== null && structuredDraft.usage.outputTokens !== null
            ? structuredDraft.usage.inputTokens + structuredDraft.usage.outputTokens
            : null,
        },
        repaired: false,
      };
    }

    if (repairRetries <= 0) {
      throw new Error(`Draft validation failed without repair retries remaining: ${structuredValidation.errors.join("; ")}`);
    }

    const repaired = await runCodexStructuredOutput<GeneratedQuestionPayload>({
      cwd: repoRoot,
      prompt: buildRepairPrompt({
        draftText: structuredDraftText,
        strictness,
        requestedCount,
      }),
      schemaPath,
      timeoutMs: REPAIR_GENERATION_TIMEOUT_MS,
    });
    await writeJsonArtifact(repairArtifactPath, repaired.data);

    const repairedValidation = validateGeneratedPayload(repaired.data, strictness);
    if (!repairedValidation.valid || !repairedValidation.data) {
      throw new Error(`Draft repair failed validation: ${repairedValidation.errors.join("; ")}`);
    }

    return {
      payload: normalizeGeneratedPayload(repairedValidation.data, batch),
      usage: {
        model: process.env.CODEX_MODEL?.trim() || null,
        inputTokens: structuredDraft.usage.inputTokens !== null && repaired.usage.inputTokens !== null
          ? structuredDraft.usage.inputTokens + repaired.usage.inputTokens
          : null,
        outputTokens: structuredDraft.usage.outputTokens !== null && repaired.usage.outputTokens !== null
          ? structuredDraft.usage.outputTokens + repaired.usage.outputTokens
          : null,
        totalTokens: structuredDraft.usage.inputTokens !== null
          && structuredDraft.usage.outputTokens !== null
          && repaired.usage.inputTokens !== null
          && repaired.usage.outputTokens !== null
          ? structuredDraft.usage.inputTokens + structuredDraft.usage.outputTokens + repaired.usage.inputTokens + repaired.usage.outputTokens
          : null,
      },
      repaired: true,
    };
  }

  let draft: Awaited<ReturnType<typeof runCodexTextOutputJob>> | null = null;
  while (!draft) {
    try {
      draft = await runTextOutputJobImpl({
        cwd: repoRoot,
        promptPath: promptArtifactPath,
        outputPath: fallbackDraftArtifactPath,
        stdoutPath: fallbackStdoutArtifactPath,
        stderrPath: fallbackStderrArtifactPath,
        jobPath: fallbackJobArtifactPath,
        waitSliceMs: DRAFT_GENERATION_WAIT_SLICE_MS,
        maxWallMs: DRAFT_GENERATION_MAX_WALL_MS,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "CodexPendingError" && onPending) {
        await onPending(error as CodexPendingError);
        continue;
      }
      throw error;
    }
  }

  let draftValidation:
    | ReturnType<typeof validateGeneratedPayload>
    | null = null;
  let parseFailure: Error | null = null;
  try {
    draftValidation = validateGeneratedPayload(parseDraftPayload(draft.text), strictness);
  } catch (error) {
    parseFailure = error instanceof Error ? error : new Error(String(error));
  }

  if (draftValidation?.valid && draftValidation.data) {
    return {
      payload: normalizeGeneratedPayload(draftValidation.data, batch),
      usage: {
        model: process.env.CODEX_MODEL?.trim() || null,
        inputTokens: draft.usage.inputTokens,
        outputTokens: draft.usage.outputTokens,
        totalTokens: draft.usage.inputTokens !== null && draft.usage.outputTokens !== null
          ? draft.usage.inputTokens + draft.usage.outputTokens
          : null,
      },
      repaired: false,
    };
  }

  if (repairRetries <= 0) {
    const reasons = parseFailure
      ? [parseFailure.message]
      : draftValidation?.errors ?? ["unknown draft validation failure"];
    throw new Error(`Draft validation failed without repair retries remaining: ${reasons.join("; ")}`);
  }

  const repaired = await runCodexStructuredOutput<GeneratedQuestionPayload>({
    cwd: repoRoot,
    prompt: buildRepairPrompt({
      draftText: draft.text,
      strictness,
      requestedCount,
    }),
    schemaPath,
    timeoutMs: REPAIR_GENERATION_TIMEOUT_MS,
  });
  await writeJsonArtifact(repairArtifactPath, repaired.data);

  const repairedValidation = validateGeneratedPayload(repaired.data, strictness);
  if (!repairedValidation.valid || !repairedValidation.data) {
    throw new Error(`Draft repair failed validation: ${repairedValidation.errors.join("; ")}`);
  }

  return {
    payload: normalizeGeneratedPayload(repairedValidation.data, batch),
    usage: {
      model: process.env.CODEX_MODEL?.trim() || null,
      inputTokens: draft.usage.inputTokens !== null && repaired.usage.inputTokens !== null
        ? draft.usage.inputTokens + repaired.usage.inputTokens
        : null,
      outputTokens: draft.usage.outputTokens !== null && repaired.usage.outputTokens !== null
        ? draft.usage.outputTokens + repaired.usage.outputTokens
        : null,
      totalTokens: draft.usage.inputTokens !== null
        && draft.usage.outputTokens !== null
        && repaired.usage.inputTokens !== null
        && repaired.usage.outputTokens !== null
        ? draft.usage.inputTokens + draft.usage.outputTokens + repaired.usage.inputTokens + repaired.usage.outputTokens
        : null,
    },
    repaired: true,
  };
}

function mergeUsage(usages: Array<{
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}>) {
  const firstModel = usages.find((entry) => entry.model)?.model ?? null;
  const sumNullable = (values: Array<number | null>) => values.every((value) => value !== null)
    ? values.reduce((sum, value) => sum + (value ?? 0), 0)
    : null;

  return {
    model: firstModel,
    inputTokens: sumNullable(usages.map((entry) => entry.inputTokens)),
    outputTokens: sumNullable(usages.map((entry) => entry.outputTokens)),
    totalTokens: sumNullable(usages.map((entry) => entry.totalTokens)),
  };
}

async function generateBatchPayload({
  repoRoot,
  batch,
  mode,
  strictness,
  repairRetries,
  totalCount,
  buildPrompt,
  onPromptBuilt,
  onChunkPending,
  resolveChunkArtifactPath,
  resolveChunkPromptPath,
}: {
  repoRoot: string;
  batch: ReturnType<typeof getBatchFromManifest>;
  mode: BatchAttemptMode;
  strictness: "strict_internal" | "augmented";
  repairRetries: number;
  totalCount: number;
  buildPrompt: (args: { requestedCount: number; additionalAvoidAngleFamilies: string[]; chunkIndex: number }) => Promise<string>;
  onPromptBuilt: (args: { prompt: string; chunkIndex: number }) => Promise<void>;
  onChunkPending?: (args: { chunkIndex: number; error: CodexPendingError }) => Promise<void>;
  resolveChunkArtifactPath: (args: { chunkIndex: number; kind: "draft" | "repair" }) => string;
  resolveChunkPromptPath: (chunkIndex: number) => string;
}): Promise<{
  payload: GeneratedQuestionPayload;
  usage: {
    model: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
}> {
  const questions: GeneratedQuestionPayload["questions"] = [];
  const usages: Array<{
    model: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  }> = [];
  const generatedAngleFamilies: string[] = [];

  let chunkIndex = 0;
  while (questions.length < totalCount) {
    const remainingCount = totalCount - questions.length;
    let requestedCount = resolveGenerationChunkSize({
      mode,
      remainingCount,
      isFirstChunk: chunkIndex === 0,
    });
    let prompt = await buildPrompt({
      requestedCount,
      additionalAvoidAngleFamilies: generatedAngleFamilies,
      chunkIndex,
    });
    await onPromptBuilt({ prompt, chunkIndex });

    let generated: Awaited<ReturnType<typeof generateStructuredChunk>>;
    try {
      generated = await generateStructuredChunk({
        repoRoot,
        batch,
        strictness,
        requestedCount,
        promptArtifactPath: resolveChunkPromptPath(chunkIndex),
        draftArtifactPath: resolveChunkArtifactPath({ chunkIndex, kind: "draft" }),
        repairArtifactPath: resolveChunkArtifactPath({ chunkIndex, kind: "repair" }),
        repairRetries,
        onPending: async (error) => {
          await onChunkPending?.({ chunkIndex, error });
        },
      });
    } catch (error) {
      const fallbackRequestedCount = chunkIndex === 0
        ? resolveGenerationChunkSize({
            mode,
            remainingCount,
            isFirstChunk: false,
          })
        : requestedCount;

      if (fallbackRequestedCount === requestedCount) {
        throw error;
      }

      requestedCount = fallbackRequestedCount;
      prompt = await buildPrompt({
        requestedCount,
        additionalAvoidAngleFamilies: generatedAngleFamilies,
        chunkIndex,
      });
      await onPromptBuilt({ prompt, chunkIndex });

      generated = await generateStructuredChunk({
        repoRoot,
        batch,
        strictness,
        requestedCount,
        promptArtifactPath: resolveChunkPromptPath(chunkIndex),
        draftArtifactPath: resolveChunkArtifactPath({ chunkIndex, kind: "draft" }),
        repairArtifactPath: resolveChunkArtifactPath({ chunkIndex, kind: "repair" }),
        repairRetries,
        onPending: async (pendingError) => {
          await onChunkPending?.({ chunkIndex, error: pendingError });
        },
      });
    }
    const chunkQuestions = generated.payload.questions.slice(0, requestedCount);
    if (chunkQuestions.length === 0) {
      throw new Error(`Generation chunk ${chunkIndex + 1} returned zero questions.`);
    }

    questions.push(...chunkQuestions);
    usages.push(generated.usage);
    generatedAngleFamilies.push(...uniqueAngleFamilies(chunkQuestions.map((question) => deriveAngleFamily(question))));
    chunkIndex += 1;
  }

  return {
    payload: {
      questions,
    },
    usage: mergeUsage(usages),
  };
}

function selectAcceptedPayload(payload: GeneratedQuestionPayload, acceptedIndices: number[]) {
  return {
    questions: acceptedIndices.map((index) => payload.questions[index]),
  } satisfies GeneratedQuestionPayload;
}

async function writeBatchSummary({
  state,
  topicCluster,
}: {
  state: BatchState;
  topicCluster: string;
}) {
  const lines = [
    `# ${state.batchId} Summary`,
    "",
    `- Status: \`${state.status}\``,
    `- Topic cluster: \`${topicCluster}\``,
    `- Accepted total: \`${state.acceptedTotal}\``,
    `- Rejected total: \`${state.rejectedTotal}\``,
    `- Remaining: \`${state.remaining}\``,
    `- Attempts: \`${state.attempts}\``,
    `- Next action: \`${state.nextAction ?? "none"}\``,
    state.saturationReason ? `- Saturation reason: \`${state.saturationReason}\`` : null,
  ].filter(Boolean);

  await writeTextArtifact(state.artifactPaths.summaryPath ?? path.join(state.artifactPaths.reportsDir, "batch-summary.md"), lines.join("\n"));
}

async function writeBatchSummaryIfEnabled({
  state,
  topicCluster,
  executionContext,
}: {
  state: BatchState;
  topicCluster: string;
  executionContext: ExecutionContext;
}) {
  await writeBatchSummary({ state, topicCluster });
}

async function loadBatchControllerState({
  workflowRef,
  batchId,
}: {
  workflowRef: string;
  batchId: string;
}) {
  const { repoRoot, manifest } = await loadWorkflowManifest(workflowRef);
  await ensureWorkflowArtifactDirs(repoRoot, manifest);
  const batch = getBatchFromManifest(manifest, batchId);
  const state = batchStateSchema.parse(await loadOrInitBatchState({ repoRoot, manifest, batch }));
  return { repoRoot, manifest, batch, state };
}

async function pollBatchState({
  repoRoot,
  manifest,
  batch,
  timeoutMs = CONTROLLER_WAIT_TIMEOUT_MS,
  expectedJobId,
  minUpdatedAtMs,
}: {
  repoRoot: string;
  manifest: Awaited<ReturnType<typeof loadWorkflowManifest>>["manifest"];
  batch: ReturnType<typeof getBatchFromManifest>;
  timeoutMs?: number;
  expectedJobId?: string;
  minUpdatedAtMs?: number;
}) {
  const deadline = Date.now() + timeoutMs;
  let latestState = batchStateSchema.parse(await loadOrInitBatchState({ repoRoot, manifest, batch }));

  while (Date.now() < deadline) {
    try {
      latestState = await loadBatchState(latestState.artifactPaths.statePath);
    } catch {
      // Ignore transient read failures while the worker is writing a state update.
    }

    const updatedAtMs = Date.parse(latestState.updatedAt);
    const isFreshState = !minUpdatedAtMs || !Number.isFinite(updatedAtMs) || updatedAtMs >= minUpdatedAtMs;
    const matchesExpectedJob = !expectedJobId
      || latestState.activeJob?.jobId === expectedJobId
      || latestState.currentAttempt?.jobId === expectedJobId
      || latestState.lastAttempt?.jobId === expectedJobId;

    if ((latestState.status === "completed" || latestState.status === "saturated" || latestState.status === "failed")
      && isFreshState
      && matchesExpectedJob) {
      return latestState;
    }

    await sleep(CONTROLLER_POLL_INTERVAL_MS);
  }

  try {
    latestState = await loadBatchState(latestState.artifactPaths.statePath);
  } catch {
    // Keep the last successfully observed state.
  }

  return latestState;
}

async function reconcileStaleBatchJob({
  state,
  batch,
}: {
  state: BatchState;
  batch: ReturnType<typeof getBatchFromManifest>;
}) {
  if (!state.activeJob) {
    return state;
  }

  const heartbeatStale = isBatchActiveJobStale({
    state,
    staleAfterMs: ACTIVE_JOB_STALE_MS,
  });
  const pidStale = state.activeJob.pid !== null && !isPidAlive(state.activeJob.pid);

  if (!heartbeatStale && !pidStale) {
    return state;
  }

  const staleReason = pidStale
    ? `Background worker pid ${state.activeJob.pid} is no longer running.`
    : `Background worker heartbeat is older than ${ACTIVE_JOB_STALE_MS}ms.`;

  const reconciledState = state.currentAttempt?.status === "running"
    ? abandonBatchAttempt({
        state,
        jobId: state.activeJob.jobId,
        phase: state.activeJob.phase,
        acceptedCount: state.currentAttempt.acceptedCount,
        rejectedCount: state.currentAttempt.rejectedCount,
        remainingCount: state.currentAttempt.remainingCount,
        acceptedTotal: state.acceptedTotal,
        rejectedTotal: state.rejectedTotal,
        remaining: state.remaining,
        batchStatus: "failed",
        nextAction: "resume_with_fresh_attempt",
        errorMessage: staleReason,
      })
    : batchStateSchema.parse({
        ...state,
        status: state.remaining > 0 ? "pending" : state.status,
        activeJob: null,
        nextAction: "resume_batch",
        updatedAt: nowIso(),
      });

  await saveBatchState(reconciledState);
  await writeBatchSummary({ state: reconciledState, topicCluster: batch.topicCluster });
  return reconciledState;
}

async function spawnBatchWorker({
  repoRoot,
  workflowRef,
  batchId,
  force,
  jobId,
  logPath,
}: {
  repoRoot: string;
  workflowRef: string;
  batchId: string;
  force: boolean;
  jobId: string;
  logPath: string;
}) {
  const scriptPath = path.join(repoRoot, "scripts", "generation", "run_notes_workflow.ts");
  const argv = [
    ...process.execArgv,
    scriptPath,
    "run-batch-worker",
    "--workflow",
    workflowRef,
    "--batch",
    batchId,
    "--job-id",
    jobId,
  ];

  if (force) {
    argv.push("--force");
  }

  const logFd = fs.openSync(logPath, "a");
  try {
    const child = spawn(process.execPath, argv, {
      cwd: repoRoot,
      detached: true,
      stdio: ["ignore", logFd, logFd],
    });
    child.unref();
    return {
      jobId,
      pid: child.pid ?? null,
      logPath,
    };
  } finally {
    fs.closeSync(logFd);
  }
}

async function launchOrPollBatch({
  workflowRef,
  batchId,
  force = false,
  dryRun = false,
  noImport = false,
  artifactRunId,
}: {
  workflowRef: string;
  batchId: string;
  force?: boolean;
  dryRun?: boolean;
  noImport?: boolean;
  artifactRunId?: string;
}): Promise<BatchCommandResult> {
  if (dryRun) {
    return runSingleBatchWorker({
      workflowRef,
      batchId,
      force,
      dryRun: true,
      noImport,
      artifactRunId,
    });
  }

  const { repoRoot, manifest, batch } = await loadBatchControllerState({ workflowRef, batchId });
  let state = batchStateSchema.parse(await loadOrInitBatchState({ repoRoot, manifest, batch }));

  if (!force && (state.status === "completed" || state.status === "saturated")) {
    await writeBatchSummary({ state, topicCluster: batch.topicCluster });
    return state;
  }

  state = await reconcileStaleBatchJob({ state, batch });

  if (!force) {
    const prelaunchState = applyPrelaunchBatchTerminalState({ state, manifest, batch });
    if (prelaunchState !== state) {
      state = prelaunchState;
      await saveBatchState(state);
      await writeBatchSummary({ state, topicCluster: batch.topicCluster });
    }
    if (state.status === "completed" || state.status === "saturated") {
      return state;
    }
  }

  if (state.activeJob) {
    return pollBatchState({ repoRoot, manifest, batch });
  }

  const mode = determineMode(state);
  const attemptNumber = state.nextAttemptNumber;
  const artifactPaths = buildBatchArtifactContext({
    repoRoot,
    manifest,
    batch,
    attemptNumber,
    mode,
  });
  await ensureBatchArtifactDirs(artifactPaths);

  const jobId = `${manifest.workflowId}-${batch.batchId}-${String(attemptNumber).padStart(2, "0")}-${Date.now()}`;
  const logPath = path.join(artifactPaths.batchDir, `job-${jobId}.log`);
  const launchStartedAtMs = Date.now();
  await writeTextArtifact(logPath, "");

  await spawnBatchWorker({
    repoRoot,
    workflowRef,
    batchId,
    force,
    jobId,
    logPath,
  });

  return pollBatchState({
    repoRoot,
    manifest,
    batch,
    expectedJobId: jobId,
    minUpdatedAtMs: launchStartedAtMs,
  });
}

async function runSingleBatchWorker({
  workflowRef,
  batchId,
  force = false,
  jobId,
  dryRun = false,
  noImport = false,
  artifactRunId,
}: {
  workflowRef: string;
  batchId: string;
  force?: boolean;
  jobId?: string;
  dryRun?: boolean;
  noImport?: boolean;
  artifactRunId?: string;
}): Promise<BatchCommandResult> {
  const { repoRoot, manifest, batch } = await loadBatchControllerState({ workflowRef, batchId });
  const executionContext = createExecutionContext(dryRun, noImport, artifactRunId);
  const initialState = cloneBatchState(batchStateSchema.parse(await loadOrInitBatchState({ repoRoot, manifest, batch })));
  const dryRunAttempts: DryRunAttemptResult[] = [];
  let state = cloneBatchState(initialState);

  if (dryRun) {
    state = batchStateSchema.parse({
      ...state,
      status: state.remaining === 0
        ? "completed"
        : state.status === "saturated"
          ? "saturated"
          : "pending",
      activeJob: null,
      currentAttempt: null,
      nextAction: state.remaining === 0 ? "no_action_completed" : "run_dry_generation",
      updatedAt: nowIso(),
    });
  }

  if (!dryRun && !force && (state.status === "completed" || state.status === "saturated")) {
    await writeBatchSummary({ state, topicCluster: batch.topicCluster });
    return state;
  }

  if (dryRun && !force && (state.status === "completed" || state.status === "saturated")) {
    return buildDryRunResultPayload({
      state,
      initialState,
      executionContext,
      attempts: dryRunAttempts,
    });
  }

  if (!dryRun && !force) {
    const prelaunchState = applyPrelaunchBatchTerminalState({ state, manifest, batch });
    if (prelaunchState !== state) {
      state = prelaunchState;
      await saveBatchStateIfEnabled(state, executionContext);
      await writeBatchSummaryIfEnabled({ state, topicCluster: batch.topicCluster, executionContext });
    }
    if (state.status === "completed" || state.status === "saturated") {
      return state;
    }
  }

  while (state.remaining > 0) {
    const mode = determineMode(state);
    const workerJobId = jobId ?? `${manifest.workflowId}-${batch.batchId}-${Date.now()}`;
    const previewPaths = buildBatchArtifactContext({
      repoRoot,
      manifest,
      batch,
      attemptNumber: state.nextAttemptNumber,
      mode,
      artifactNamespace: executionContext.artifactNamespace,
      artifactRunId: executionContext.artifactRunId,
    });
    const logPath = path.join(previewPaths.batchDir, `job-${workerJobId}.log`);
    const startedAt = nowIso();

    state = beginBatchAttempt({
      state,
      repoRoot,
      manifest,
      batch,
      mode,
      phase: "building_source_pack",
      logPath,
      artifactNamespace: executionContext.artifactNamespace,
      artifactRunId: executionContext.artifactRunId,
      importMode: executionContext.dryRun ? "dry_run" : "live",
      jobId: workerJobId,
      now: startedAt,
    });

    const attemptNumber = state.currentAttempt?.attemptNumber ?? state.attempts;
    const attemptStartedAt = state.currentAttempt?.startedAt ?? nowIso();
    const artifactPaths = buildBatchArtifactContext({
      repoRoot,
      manifest,
      batch,
      attemptNumber,
      mode,
      artifactNamespace: executionContext.artifactNamespace,
      artifactRunId: executionContext.artifactRunId,
    });
    state = batchStateSchema.parse({
      ...state,
      artifactPaths: {
        ...state.artifactPaths,
        statePath: artifactPaths.statePath,
        batchDir: artifactPaths.batchDir,
        rawDir: artifactPaths.rawDir,
        reportsDir: artifactPaths.reportsDir,
        promptsDir: artifactPaths.promptsDir,
        reviewPackDir: artifactPaths.reviewPackDir,
        summaryPath: artifactPaths.summaryPath,
      },
      updatedAt: nowIso(),
    });
    await ensureBatchArtifactDirs(artifactPaths);
    await saveBatchStateIfEnabled(state, executionContext);

    try {
      const touchPhase = async (phase: string) => {
        state = touchBatchActiveJob({
          state,
          jobId: workerJobId,
          phase,
        });
        await saveBatchStateIfEnabled(state, executionContext);
      };

      await touchPhase("building_source_pack");
      const sourcePack = await buildSourcePack({ repoRoot, manifest, batch });
      await writeJsonArtifact(artifactPaths.sourcePackPath, sourcePack);

      const targetCount = mode === "initial" ? batch.targetCount : state.remaining;
      await touchPhase("draft_generation");
      const generated = await generateBatchPayload({
        repoRoot,
        batch,
        mode,
        strictness: manifest.defaultStrictness,
        repairRetries: Math.max(manifest.retryPolicy.invalidJsonRepairRetries, manifest.retryPolicy.validationRepairRetries),
        totalCount: targetCount,
        buildPrompt: async ({ requestedCount, additionalAvoidAngleFamilies }) => (
          mode === "initial"
            ? buildInitialPrompt({
                manifest,
                batch,
                sourcePack,
                requestedCount,
                additionalAvoidAngleFamilies,
              })
            : buildReplacementPrompt({
                repoRoot,
                manifest,
                batch,
                state,
                sourcePack,
                requestedCount,
                additionalAvoidAngleFamilies,
              })
        ),
        onPromptBuilt: async ({ prompt, chunkIndex }) => {
          const promptPath = chunkIndex === 0
            ? artifactPaths.promptPath
            : artifactPaths.promptPath.replace(/\.md$/, `.chunk-${String(chunkIndex + 1).padStart(2, "0")}.md`);
          await touchPhase(`draft_generation_chunk_${String(chunkIndex + 1).padStart(2, "0")}`);
          await writeTextArtifact(promptPath, prompt);
        },
        onChunkPending: async ({ chunkIndex }) => {
          await touchPhase(`draft_generation_chunk_${String(chunkIndex + 1).padStart(2, "0")}_waiting`);
        },
        resolveChunkArtifactPath: ({ chunkIndex, kind }) => {
          const basePath = kind === "draft" ? artifactPaths.draftOutputPath : artifactPaths.repairOutputPath;
          return chunkIndex === 0
            ? basePath
            : basePath.replace(/\.(txt|json)$/, `.chunk-${String(chunkIndex + 1).padStart(2, "0")}.$1`);
        },
        resolveChunkPromptPath: (chunkIndex) => (
          chunkIndex === 0
            ? artifactPaths.promptPath
            : artifactPaths.promptPath.replace(/\.md$/, `.chunk-${String(chunkIndex + 1).padStart(2, "0")}.md`)
        ),
      });
      await writeJsonArtifact(artifactPaths.rawOutputPath, generated.payload);

      await touchPhase("validation_and_audits");
      const [validationReport, overlapReport, semanticOverlapReport, verificationReport] = await Promise.all([
        runSchemaCitationStyleAuditor({
          manifest,
          batch,
          state,
          payload: generated.payload,
          attempt: attemptNumber,
        }),
        runOverlapAuditor({
          manifest,
          batch,
          state,
          payload: generated.payload,
          attempt: attemptNumber,
        }),
        runSemanticOriginalityAuditor({
          repoRoot,
          manifest,
          batch,
          state,
          payload: generated.payload,
          attempt: attemptNumber,
        }),
        runAustralianVerification({
          repoRoot,
          manifest,
          batch,
          payload: generated.payload,
          attempt: attemptNumber,
        }),
      ]);

      await Promise.all([
        writeJsonArtifact(artifactPaths.validationReportPath, validationReport),
        writeJsonArtifact(artifactPaths.overlapReportPath, overlapReport),
        writeJsonArtifact(artifactPaths.semanticOverlapReportPath, semanticOverlapReport),
        writeJsonArtifact(artifactPaths.australianVerificationReportPath, verificationReport),
      ]);

      const merged = mergedDecisionReportSchema.parse(
        mergeWorkerReports({
          workflowId: manifest.workflowId,
          batchId: batch.batchId,
          attempt: attemptNumber,
          generatedCount: generated.payload.questions.length,
          validationReport,
          overlapReport,
          semanticOriginalityReport: semanticOverlapReport,
          verificationReport,
        }),
      );
      await writeJsonArtifact(artifactPaths.mergedDecisionReportPath, merged);

      await touchPhase("import");
      const acceptedPayload = selectAcceptedPayload(generated.payload, merged.acceptedIndices);
      const importInputPath = artifactPaths.rawOutputPath.replace(/\.generated\.json$/, ".accepted-import.json");
      const importBatchRunId = buildImportBatchRunId({
        batchId: batch.batchId,
        attemptNumber,
        mode: executionContext.dryRun ? "dry_run" : "live",
        artifactRunId: executionContext.artifactRunId,
      });
      const importReport = executionContext.noImport
        ? buildDryRunImportReport({
            batchId: importBatchRunId,
            payload: acceptedPayload,
            runId: executionContext.artifactRunId,
            reason: executionContext.dryRun
              ? "DB import skipped in dry-run mode."
              : "DB import skipped because --no-import was set.",
          })
        : merged.acceptedIndices.length > 0 && merged.importable
        ? await runImportWorker({
            repoRoot,
            payload: acceptedPayload,
            inputPath: importInputPath,
            reportPath: artifactPaths.importReportPath,
            batchId: importBatchRunId,
          })
        : {
            ok: true,
            mode: "live" as const,
            persisted: false,
            batchId: importBatchRunId,
            runId: null,
            totalQuestions: acceptedPayload.questions.length,
            created: 0,
            rejected: 0,
            skippedExisting: 0,
            wouldImport: acceptedPayload.questions.length,
            decisions: [],
          };
      await writeJsonArtifact(artifactPaths.importReportPath, importReport);

      const createdOriginalIndices = importReport.decisions
        .filter((decision) => decision.status === "created")
        .map((decision) => merged.acceptedIndices[decision.index])
        .filter((index): index is number => index !== undefined);
      const createdAngleFamilies = createdOriginalIndices.map((index) => deriveAngleFamily(generated.payload.questions[index]));
      const acceptedOriginalIndices = executionContext.noImport ? merged.acceptedIndices : createdOriginalIndices;
      const rejectedAngleFamilies = uniqueAngleFamilies([
        ...merged.rejectedIndices.map((index) => deriveAngleFamily(generated.payload.questions[index])),
        ...importReport.decisions
          .filter((decision) => !executionContext.noImport && decision.status !== "created")
          .map((decision) => {
            const originalIndex = merged.acceptedIndices[decision.index];
            return originalIndex === undefined ? null : deriveAngleFamily(generated.payload.questions[originalIndex]);
          })
          .filter((family): family is string => Boolean(family)),
      ]);

      const verificationSummary = summarizeVerificationFindings(verificationReport, manifest.evidenceMode);
      const acceptedCount = resolveAcceptedCountForAttempt({
        importSkipped: executionContext.noImport,
        mergedAcceptedCount: merged.acceptedIndices.length,
        createdCount: importReport.created,
      });
      const rejectedCount = generated.payload.questions.length - acceptedCount;
      const remaining = Math.max(batch.targetCount - (state.acceptedTotal + acceptedCount), 0);

      let nextState = batchStateSchema.parse({
        ...state,
        acceptedTotal: state.acceptedTotal + acceptedCount,
        rejectedTotal: state.rejectedTotal + rejectedCount,
        remaining,
        importedQuestionIds: uniqueStrings([
          ...state.importedQuestionIds,
          ...importReport.decisions
            .filter((decision) => !executionContext.noImport && decision.status === "created" && decision.questionId)
            .map((decision) => decision.questionId as string),
        ]),
        acceptedAngleFamilies: uniqueAngleFamilies([
          ...state.acceptedAngleFamilies,
          ...(executionContext.noImport
            ? acceptedOriginalIndices.map((index) => deriveAngleFamily(generated.payload.questions[index]))
            : createdAngleFamilies),
        ]),
        rejectedAngleFamilies: uniqueAngleFamilies([
          ...state.rejectedAngleFamilies,
          ...rejectedAngleFamilies,
        ]),
        overlapWarnings: Array.from(new Set([...state.overlapWarnings, ...merged.overlapWarnings])),
        evidenceSummary: {
          evidenceMode: manifest.evidenceMode,
          strictness: manifest.defaultStrictness,
          externalFindingCount: state.evidenceSummary.externalFindingCount + verificationSummary.externalFindingCount,
          unresolvedConflictCount: state.evidenceSummary.unresolvedConflictCount + verificationSummary.unresolvedConflictCount,
        },
        saturationReason: null,
        nextAction: remaining > 0 ? "evaluate_retry_or_saturation" : "no_action_completed",
        updatedAt: nowIso(),
      });

      const saturationDecision = getSaturationDecision({
        state: nextState,
        batch,
        manifest,
        latestAttempt: {
          attemptNumber,
          mode,
          acceptedCount,
          rejectedCount,
          remainingCount: remaining,
          recordedAt: nowIso(),
        },
      });
      const lastHeartbeatAt = state.activeJob?.heartbeatAt ?? state.updatedAt;
      nextState = completeBatchAttempt({
        state: nextState,
        jobId: workerJobId,
        phase: "finalizing",
        acceptedCount,
        rejectedCount,
        remainingCount: remaining,
        acceptedTotal: nextState.acceptedTotal,
        rejectedTotal: nextState.rejectedTotal,
        remaining: nextState.remaining,
        batchStatus: saturationDecision.status === "completed"
          ? "completed"
          : saturationDecision.status === "saturated"
            ? "saturated"
            : "pending",
        nextAction: saturationDecision.status === "retry"
          ? "build_replacement_prompt"
          : saturationDecision.status === "completed"
            ? "no_action_completed"
            : "no_action_saturated",
        saturationReason: saturationDecision.reason,
        usage: generated.usage,
      });
      const attemptCompletedAt = nowIso();
      nextState = batchStateSchema.parse({
        ...nextState,
        status: nextState.status,
        updatedAt: attemptCompletedAt,
      });
      state = nextState;
      await saveBatchStateIfEnabled(state, executionContext);
      await writeBatchSummaryIfEnabled({ state, topicCluster: batch.topicCluster, executionContext });
      const attemptTerminalMode = saturationDecision.status === "completed"
        ? "completed"
        : saturationDecision.status === "saturated"
          ? "saturated"
          : executionContext.dryRun
            ? "preview_completed"
            : "completed";
      await writeAttemptResultArtifacts({
        targetPaths: {
          attemptResultPath: artifactPaths.attemptResultPath,
          batchResultPath: artifactPaths.batchResultPath,
        },
        payload: buildAttemptResultPayload({
          state,
          workflowId: manifest.workflowId,
          batchId: batch.batchId,
          attemptNumber,
          mode,
          importMode: executionContext.dryRun ? "dry_run" : "live",
          startedAt: attemptStartedAt,
          lastHeartbeatAt,
          completedAt: attemptCompletedAt,
          acceptedCount,
          rejectedCount,
          remaining,
          acceptedTotal: nextState.acceptedTotal,
          rejectedTotal: nextState.rejectedTotal,
          saturationReason: saturationDecision.reason,
          artifactPaths,
          phase: "finalizing",
          isDryRun: executionContext.dryRun,
          terminalModeOverride: attemptTerminalMode,
        }),
      });

      if (executionContext.dryRun) {
        dryRunAttempts.push({
          attemptNumber,
          mode,
          generatedCount: generated.payload.questions.length,
          overlapAcceptedCount: merged.acceptedIndices.length,
          acceptedCount,
          rejectedCount,
          remaining,
          importSkipped: true,
          validationOk: validationReport.ok,
          importable: merged.importable,
          promptPath: artifactPaths.promptPath,
          rawOutputPath: artifactPaths.rawOutputPath,
          mergedDecisionReportPath: artifactPaths.mergedDecisionReportPath,
          importReportPath: artifactPaths.importReportPath,
        });
      }

      if (saturationDecision.status !== "retry") {
        break;
      }
    } catch (error) {
      if (state.activeJob && state.currentAttempt) {
        const attemptCompletedAt = nowIso();
        const failurePhase = state.activeJob.phase;
        const lastHeartbeatAt = state.activeJob.heartbeatAt ?? state.updatedAt;
        state = failBatchAttempt({
          state,
          jobId: workerJobId,
          phase: state.activeJob.phase,
          acceptedCount: 0,
          rejectedCount: 0,
          remainingCount: state.remaining,
          acceptedTotal: state.acceptedTotal,
          rejectedTotal: state.rejectedTotal,
          remaining: state.remaining,
          batchStatus: "failed",
          nextAction: "resume_with_fresh_attempt",
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        await writeAttemptResultArtifacts({
          targetPaths: {
            attemptResultPath: artifactPaths.attemptResultPath,
            batchResultPath: artifactPaths.batchResultPath,
          },
          payload: buildAttemptResultPayload({
            state,
            workflowId: manifest.workflowId,
            batchId: batch.batchId,
            attemptNumber,
            mode,
            importMode: executionContext.dryRun ? "dry_run" : "live",
            startedAt: attemptStartedAt,
            lastHeartbeatAt,
            completedAt: attemptCompletedAt,
            acceptedCount: 0,
            rejectedCount: 0,
            remaining: state.remaining,
            acceptedTotal: state.acceptedTotal,
            rejectedTotal: state.rejectedTotal,
            saturationReason: "Unhandled execution error.",
            artifactPaths,
            phase: failurePhase,
            isDryRun: executionContext.dryRun,
            terminalModeOverride: "failed",
            errorMessage: error instanceof Error ? error.message : String(error),
          }),
        });
        await saveBatchStateIfEnabled(state, executionContext);
        await writeBatchSummaryIfEnabled({ state, topicCluster: batch.topicCluster, executionContext });
      }
      throw error;
    }
  }

  if (executionContext.dryRun) {
    return buildDryRunResultPayload({
      state,
      initialState,
      executionContext,
      attempts: dryRunAttempts,
    });
  }

  return state;
}

async function loadStatesForBatchIds(workflowRef: string, batchIds: string[]) {
  const { repoRoot, manifest } = await loadWorkflowManifest(workflowRef);
  const states: BatchState[] = [];
  for (const batchId of batchIds) {
    const batch = getBatchFromManifest(manifest, batchId);
    const initialState = await loadOrInitBatchState({ repoRoot, manifest, batch });
    try {
      states.push(await loadBatchState(initialState.artifactPaths.statePath));
    } catch {
      states.push(initialState);
    }
  }
  return { repoRoot, manifest, states };
}

export function buildReviewPackArtifactFileName(batchIds: string[]) {
  const joined = batchIds.join("-");
  if (joined.length <= 120) {
    return `review-pack-${joined}.json`;
  }

  const digest = createHash("sha1").update(joined).digest("hex").slice(0, 10);
  const first = batchIds[0] ?? "scope";
  const last = batchIds.at(-1) ?? first;
  return `review-pack-${first}-to-${last}-${batchIds.length}-batches-${digest}.json`;
}

async function writeReviewPack({
  workflowRef,
  batchIds,
}: {
  workflowRef: string;
  batchIds: string[];
}) {
  const { repoRoot, manifest, states } = await loadStatesForBatchIds(workflowRef, batchIds);
  const baseReviewPack = buildReviewPack({ manifest, states, batchIds });
  const { reviewPack, synthesis } = await synthesizeReviewPack({
    repoRoot,
    manifest,
    reviewPack: baseReviewPack,
  });
  const reviewPackPath = path.join(
    repoRoot,
    manifest.artifactDirs.reviewPacks,
    manifest.workflowId,
    buildReviewPackArtifactFileName(batchIds),
  );
  await writeReviewPackArtifacts({ reviewPackPath, reviewPack, synthesis });
  return { reviewPack, reviewPackPath };
}

async function main() {
  const command = parseArgs(process.argv.slice(2));

  if (command.name === "run-batch") {
    const result = await launchOrPollBatch({
      workflowRef: command.workflow,
      batchId: command.batch,
      force: command.force,
      dryRun: command.dryRun,
      noImport: command.noImport,
      artifactRunId: command.artifactRunId,
    });
    console.log(JSON.stringify(
      isDryRunResult(result)
        ? result
        : buildBatchStatusPayload(result, createExecutionContext(command.dryRun, command.noImport, command.artifactRunId)),
      null,
      2,
    ));
    return;
  }

  if (command.name === "run-batch-worker") {
    const state = await runSingleBatchWorker({
      workflowRef: command.workflow,
      batchId: command.batch,
      force: command.force,
      noImport: command.noImport,
      jobId: command.jobId,
    });
    console.log(JSON.stringify(buildBatchStatusPayload(state as BatchState, createExecutionContext(false, command.noImport)), null, 2));
    return;
  }

  if (command.name === "resume") {
    const result = await launchOrPollBatch({
      workflowRef: command.workflow,
      batchId: command.batch,
      force: false,
    });
    if (isDryRunResult(result)) {
      throw new Error("resume unexpectedly returned a dry-run result.");
    }
    console.log(JSON.stringify(buildBatchStatusPayload(result), null, 2));
    return;
  }

  if (command.name === "run-range") {
    const { manifest } = await loadWorkflowManifest(command.workflow);
    const sorted = sortBatchIds(manifest.batches.map((batch) => batch.batchId));
    const startIndex = sorted.indexOf(command.from);
    const endIndex = sorted.indexOf(command.to);
    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
      throw new Error("Invalid --from/--to batch range.");
    }

    const selected = sorted.slice(startIndex, endIndex + 1);
    const results = [];
    for (const batchId of selected) {
      try {
        const result = await launchOrPollBatch({
          workflowRef: command.workflow,
          batchId,
          dryRun: command.dryRun,
          noImport: command.noImport,
          artifactRunId: command.artifactRunId ? `${command.artifactRunId}-${batchId.toLowerCase()}` : undefined,
        });
        results.push({
          batchId,
          status: result.status,
          dryRun: command.dryRun,
          noImport: command.noImport || command.dryRun,
          acceptedTotal: result.acceptedTotal,
          remaining: result.remaining,
          summaryPath: isDryRunResult(result) ? null : result.artifactPaths.summaryPath,
          artifactRunId: isDryRunResult(result) ? result.artifactPaths?.artifactRunId ?? null : null,
        });
        if (!isDryRunResult(result) && result.status === "running") {
          console.log(JSON.stringify({ ok: true, results }, null, 2));
          return;
        }
      } catch (error) {
        results.push({
          batchId,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
        if (!command.continueOnFailure) {
          console.log(JSON.stringify({ ok: false, results }, null, 2));
          process.exit(1);
        }
      }
    }

    console.log(JSON.stringify({ ok: true, results }, null, 2));
    return;
  }

  if (command.name === "review-pack") {
    const { manifest } = await loadWorkflowManifest(command.workflow);
    let batchIds: string[];
    if (command.batch) {
      batchIds = [command.batch];
    } else if (command.from && command.to) {
      const sorted = sortBatchIds(manifest.batches.map((batch) => batch.batchId));
      const startIndex = sorted.indexOf(command.from);
      const endIndex = sorted.indexOf(command.to);
      if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
        throw new Error("Invalid --from/--to batch range.");
      }
      batchIds = sorted.slice(startIndex, endIndex + 1);
    } else {
      batchIds = manifest.batches.map((batch) => batch.batchId);
    }

    const { reviewPack, reviewPackPath } = await writeReviewPack({
      workflowRef: command.workflow,
      batchIds,
    });
    console.log(JSON.stringify({
      ok: true,
      workflowId: reviewPack.workflowId,
      reviewPackPath,
      batchIds,
      acceptedTotals: reviewPack.acceptedTotals,
    }, null, 2));
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
