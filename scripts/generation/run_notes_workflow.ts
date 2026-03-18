import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { type GeneratedQuestionPayload, validateGeneratedPayload } from "@/lib/server/generation/validator";

import { buildInitialPrompt } from "./build_initial_prompt";
import { buildReplacementPrompt } from "./build_replacement_prompt";
import { buildReviewPack, synthesizeReviewPack, writeReviewPackArtifacts } from "./build_review_pack";
import { buildBatchArtifactContext, ensureBatchArtifactDirs, ensureWorkflowArtifactDirs, writeJsonArtifact, writeTextArtifact } from "./lib/artifacts";
import { deriveAngleFamily, uniqueAngleFamilies } from "./lib/angle-family";
import { batchStateSchema, mergedDecisionReportSchema, type BatchAttemptMode, type BatchState } from "./lib/contracts";
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
  normalizeGeneratedPayload,
  runImportWorker,
  runOverlapAuditor,
  runSemanticOriginalityAuditor,
  runSchemaCitationStyleAuditor,
} from "./lib/worker-runner";
import { runAustralianVerification, summarizeVerificationFindings } from "./lib/verification";

type Command =
  | { name: "run-batch"; workflow: string; batch: string; force: boolean }
  | { name: "run-batch-worker"; workflow: string; batch: string; force: boolean; jobId?: string }
  | { name: "run-range"; workflow: string; from: string; to: string; continueOnFailure: boolean }
  | { name: "resume"; workflow: string; batch: string }
  | { name: "review-pack"; workflow: string; batch?: string; from?: string; to?: string };

function usage() {
  console.log(
    [
      "Usage:",
      "  pnpm tsx scripts/generation/run_notes_workflow.ts run-batch --workflow <id> --batch <BXX> [--force]",
      "  pnpm tsx scripts/generation/run_notes_workflow.ts run-batch-worker --workflow <id> --batch <BXX> [--force] [--job-id <id>]",
      "  pnpm tsx scripts/generation/run_notes_workflow.ts run-range --workflow <id> --from <BXX> --to <BYY> [--continue-on-failure]",
      "  pnpm tsx scripts/generation/run_notes_workflow.ts resume --workflow <id> --batch <BXX>",
      "  pnpm tsx scripts/generation/run_notes_workflow.ts review-pack --workflow <id> [--batch <BXX> | --from <BXX> --to <BYY>]",
    ].join("\n"),
  );
}

function parseArgs(argv: string[]): Command {
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

  if (command === "run-batch") {
    const batch = args.get("--batch");
    if (!batch) throw new Error("Missing required --batch argument.");
    return { name: "run-batch", workflow, batch, force: flags.has("--force") };
  }

  if (command === "run-batch-worker") {
    const batch = args.get("--batch");
    if (!batch) throw new Error("Missing required --batch argument.");
    return {
      name: "run-batch-worker",
      workflow,
      batch,
      force: flags.has("--force"),
      jobId: args.get("--job-id"),
    };
  }

  if (command === "run-range") {
    const from = args.get("--from");
    const to = args.get("--to");
    if (!from || !to) throw new Error("Missing required --from/--to arguments.");
    return { name: "run-range", workflow, from, to, continueOnFailure: flags.has("--continue-on-failure") };
  }

  if (command === "resume") {
    const batch = args.get("--batch");
    if (!batch) throw new Error("Missing required --batch argument.");
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

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

const MAX_GENERATION_CHUNK_SIZE = Number(process.env.CODEX_WORKFLOW_MAX_GENERATION_CHUNK_SIZE ?? 3);
const DRAFT_GENERATION_WAIT_SLICE_MS = Number(
  process.env.CODEX_WORKFLOW_DRAFT_WAIT_SLICE_MS ?? process.env.CODEX_WORKFLOW_DRAFT_TIMEOUT_MS ?? 30_000,
);
const DRAFT_GENERATION_MAX_WALL_MS = Number(process.env.CODEX_WORKFLOW_DRAFT_MAX_WALL_MS ?? 20 * 60_000);
const STRUCTURED_GENERATION_TIMEOUT_MS = Number(process.env.CODEX_WORKFLOW_STRUCTURED_TIMEOUT_MS ?? DRAFT_GENERATION_MAX_WALL_MS);
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

function buildBatchStatusPayload(state: BatchState) {
  return {
    ok: state.status !== "failed",
    workflowId: state.workflowId,
    batchId: state.batchId,
    status: state.status,
    acceptedTotal: state.acceptedTotal,
    remaining: state.remaining,
    saturationReason: state.saturationReason,
    nextAction: state.nextAction,
    summaryPath: state.artifactPaths.summaryPath,
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
    const requestedCount = Math.min(MAX_GENERATION_CHUNK_SIZE, totalCount - questions.length);
    const prompt = await buildPrompt({
      requestedCount,
      additionalAvoidAngleFamilies: generatedAngleFamilies,
      chunkIndex,
    });
    await onPromptBuilt({ prompt, chunkIndex });

    const generated = await generateStructuredChunk({
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
}: {
  workflowRef: string;
  batchId: string;
  force?: boolean;
}) {
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
}: {
  workflowRef: string;
  batchId: string;
  force?: boolean;
  jobId?: string;
}) {
  const { repoRoot, manifest, batch } = await loadBatchControllerState({ workflowRef, batchId });
  let state = batchStateSchema.parse(await loadOrInitBatchState({ repoRoot, manifest, batch }));

  if (!force && (state.status === "completed" || state.status === "saturated")) {
    await writeBatchSummary({ state, topicCluster: batch.topicCluster });
    return state;
  }

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

  while (state.remaining > 0) {
    const mode = determineMode(state);
    const workerJobId = jobId ?? `${manifest.workflowId}-${batch.batchId}-${Date.now()}`;
    const previewPaths = buildBatchArtifactContext({
      repoRoot,
      manifest,
      batch,
      attemptNumber: state.nextAttemptNumber,
      mode,
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
      jobId: workerJobId,
      now: startedAt,
    });

    const attemptNumber = state.currentAttempt?.attemptNumber ?? state.attempts;
    const artifactPaths = buildBatchArtifactContext({
      repoRoot,
      manifest,
      batch,
      attemptNumber,
      mode,
    });
    await ensureBatchArtifactDirs(artifactPaths);
    await saveBatchState(state);

    try {
      const touchPhase = async (phase: string) => {
        state = touchBatchActiveJob({
          state,
          jobId: workerJobId,
          phase,
        });
        await saveBatchState(state);
      };

      await touchPhase("building_source_pack");
      const sourcePack = await buildSourcePack({ repoRoot, manifest, batch });
      await writeJsonArtifact(artifactPaths.sourcePackPath, sourcePack);

      const targetCount = mode === "initial" ? batch.targetCount : state.remaining;
      await touchPhase("draft_generation");
      const generated = await generateBatchPayload({
        repoRoot,
        batch,
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
      const importReport = merged.acceptedIndices.length > 0 && merged.importable
        ? await runImportWorker({
            repoRoot,
            payload: acceptedPayload,
            inputPath: importInputPath,
            reportPath: artifactPaths.importReportPath,
            batchId: `${batch.batchId}-attempt-${String(attemptNumber).padStart(2, "0")}`,
          })
        : {
            ok: true,
            batchId: `${batch.batchId}-attempt-${String(attemptNumber).padStart(2, "0")}`,
            runId: null,
            totalQuestions: acceptedPayload.questions.length,
            created: 0,
            rejected: 0,
            skippedExisting: 0,
            decisions: [],
          };
      await writeJsonArtifact(artifactPaths.importReportPath, importReport);

      const createdOriginalIndices = importReport.decisions
        .filter((decision) => decision.status === "created")
        .map((decision) => merged.acceptedIndices[decision.index])
        .filter((index): index is number => index !== undefined);
      const createdAngleFamilies = createdOriginalIndices.map((index) => deriveAngleFamily(generated.payload.questions[index]));
      const rejectedAngleFamilies = uniqueAngleFamilies([
        ...merged.rejectedIndices.map((index) => deriveAngleFamily(generated.payload.questions[index])),
        ...importReport.decisions
          .filter((decision) => decision.status !== "created")
          .map((decision) => {
            const originalIndex = merged.acceptedIndices[decision.index];
            return originalIndex === undefined ? null : deriveAngleFamily(generated.payload.questions[originalIndex]);
          })
          .filter((family): family is string => Boolean(family)),
      ]);

      const verificationSummary = summarizeVerificationFindings(verificationReport, manifest.evidenceMode);
      const acceptedCount = importReport.created;
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
            .filter((decision) => decision.status === "created" && decision.questionId)
            .map((decision) => decision.questionId as string),
        ]),
        acceptedAngleFamilies: uniqueAngleFamilies([
          ...state.acceptedAngleFamilies,
          ...createdAngleFamilies,
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

      const saturationDecision = getSaturationDecision({ state: nextState, batch, manifest });
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
      state = nextState;
      await saveBatchState(state);
      await writeBatchSummary({ state, topicCluster: batch.topicCluster });

      if (saturationDecision.status !== "retry") {
        break;
      }
    } catch (error) {
      if (state.activeJob && state.currentAttempt) {
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
        await saveBatchState(state);
        await writeBatchSummary({ state, topicCluster: batch.topicCluster });
      }
      throw error;
    }
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
  const reviewPackPath = path.join(repoRoot, manifest.artifactDirs.reviewPacks, manifest.workflowId, `review-pack-${batchIds.join("-")}.json`);
  await writeReviewPackArtifacts({ reviewPackPath, reviewPack, synthesis });
  return { reviewPack, reviewPackPath };
}

async function main() {
  const command = parseArgs(process.argv.slice(2));

  if (command.name === "run-batch") {
    const state = await launchOrPollBatch({
      workflowRef: command.workflow,
      batchId: command.batch,
      force: command.force,
    });
    console.log(JSON.stringify(buildBatchStatusPayload(state), null, 2));
    return;
  }

  if (command.name === "run-batch-worker") {
    const state = await runSingleBatchWorker({
      workflowRef: command.workflow,
      batchId: command.batch,
      force: command.force,
      jobId: command.jobId,
    });
    console.log(JSON.stringify(buildBatchStatusPayload(state), null, 2));
    return;
  }

  if (command.name === "resume") {
    const state = await launchOrPollBatch({
      workflowRef: command.workflow,
      batchId: command.batch,
      force: false,
    });
    console.log(JSON.stringify(buildBatchStatusPayload(state), null, 2));
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
        const state = await launchOrPollBatch({ workflowRef: command.workflow, batchId });
        results.push({
          batchId,
          status: state.status,
          acceptedTotal: state.acceptedTotal,
          remaining: state.remaining,
        });
        if (state.status === "running") {
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
