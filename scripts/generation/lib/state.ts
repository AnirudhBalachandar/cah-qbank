import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  batchStateSchema,
  type BatchAttemptLifecycleStatus,
  type BatchAttemptMode,
  type BatchState,
  type WorkflowBatch,
  type WorkflowManifest,
} from "./contracts";
import { buildBatchArtifactContext } from "./artifacts";
import { getSaturationDecision } from "./saturation";

function nowIso() {
  return new Date().toISOString();
}

function normalizeAttemptNumberSeed(state: BatchState) {
  const attemptNumbers = [
    state.nextAttemptNumber - 1,
    state.attempts,
    state.lastAttempt?.attemptNumber,
    state.currentAttempt?.attemptNumber,
    state.activeJob?.attemptNumber,
    ...state.attemptHistory.map((entry) => entry.attemptNumber),
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  return Math.max(0, ...attemptNumbers);
}

function normalizeAttemptRecord(
  attempt: BatchState["lastAttempt"],
): BatchState["lastAttempt"] {
  if (!attempt) {
    return null;
  }

  return {
    ...attempt,
    status: attempt.status ?? "completed",
    jobId: attempt.jobId ?? null,
    phase: attempt.phase ?? null,
    errorMessage: attempt.errorMessage ?? null,
  };
}

export function normalizeBatchState(state: BatchState): BatchState {
  const highestAttemptNumber = normalizeAttemptNumberSeed(state);
  const currentAttempt = normalizeAttemptRecord(state.currentAttempt);
  const lastAttempt = normalizeAttemptRecord(state.lastAttempt);

  return {
    ...state,
    nextAttemptNumber: Math.max(state.nextAttemptNumber, highestAttemptNumber + 1),
    activeJob: state.activeJob ?? null,
    currentAttempt,
    lastAttempt,
    attemptHistory: state.attemptHistory.map((entry) => ({
      ...entry,
      status: entry.status ?? "completed",
      jobId: entry.jobId ?? null,
      phase: entry.phase ?? null,
      errorMessage: entry.errorMessage ?? null,
    })),
  };
}

export function createInitialBatchState({
  repoRoot,
  manifest,
  batch,
}: {
  repoRoot: string;
  manifest: WorkflowManifest;
  batch: WorkflowBatch;
}): BatchState {
  const hintedAcceptedCount = batch.acceptedCountHint ?? (batch.status === "completed" ? batch.targetCount : 0);
  const paths = buildBatchArtifactContext({
    repoRoot,
    manifest,
    batch,
    attemptNumber: 1,
    mode: "initial",
  });

  return {
    workflowId: manifest.workflowId,
    batchId: batch.batchId,
    status: batch.status === "completed" || batch.status === "saturated" ? batch.status : "pending",
    attempts: 0,
    nextAttemptNumber: 1,
    acceptedTotal: hintedAcceptedCount,
    rejectedTotal: 0,
    remaining: Math.max(batch.targetCount - hintedAcceptedCount, 0),
    importedQuestionIds: [],
    acceptedAngleFamilies: [],
    rejectedAngleFamilies: [],
    overlapWarnings: [],
    evidenceSummary: {
      evidenceMode: manifest.evidenceMode,
      strictness: manifest.defaultStrictness,
      externalFindingCount: 0,
      unresolvedConflictCount: 0,
    },
    activeJob: null,
    currentAttempt: null,
    lastAttempt: null,
    attemptHistory: [],
    artifactPaths: {
      statePath: paths.statePath,
      batchDir: paths.batchDir,
      rawDir: paths.rawDir,
      reportsDir: paths.reportsDir,
      promptsDir: paths.promptsDir,
      reviewPackDir: paths.reviewPackDir,
      summaryPath: paths.summaryPath,
      reviewPackPath: null,
    },
    saturationReason: batch.frozenReason ?? null,
    nextAction: batch.status === "completed"
      ? "no_action_completed"
      : batch.status === "saturated"
        ? "no_action_saturated"
        : "run_initial_generation",
    updatedAt: new Date().toISOString(),
  };
}

export async function loadBatchState(statePath: string) {
  const raw = await fs.readFile(statePath, "utf8");
  return normalizeBatchState(batchStateSchema.parse(JSON.parse(raw)));
}

export async function loadOrInitBatchState({
  repoRoot,
  manifest,
  batch,
}: {
  repoRoot: string;
  manifest: WorkflowManifest;
  batch: WorkflowBatch;
}) {
  const initialState = createInitialBatchState({ repoRoot, manifest, batch });
  try {
    return await loadBatchState(initialState.artifactPaths.statePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return initialState;
    }

    throw error;
  }
}

export async function saveBatchState(state: BatchState) {
  const normalizedState = normalizeBatchState(state);
  const statePath = normalizedState.artifactPaths.statePath;
  const stateDir = path.dirname(statePath);
  const tempPath = `${statePath}.tmp`;

  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(tempPath, JSON.stringify(normalizedState, null, 2), "utf8");
  await fs.rename(tempPath, statePath);
}

export function applyPrelaunchBatchTerminalState({
  state,
  manifest,
  batch,
  now = nowIso(),
}: {
  state: BatchState;
  manifest: WorkflowManifest;
  batch: WorkflowBatch;
  now?: string;
}) {
  if (state.activeJob) {
    return state;
  }

  const decision = getSaturationDecision({ state, batch, manifest });
  if (decision.status === "retry") {
    return state;
  }

  return normalizeBatchState({
    ...state,
    status: decision.status,
    saturationReason: decision.reason,
    nextAction: decision.status === "completed" ? "no_action_completed" : "no_action_saturated",
    updatedAt: now,
  });
}

export function isBatchActiveJobStale({
  state,
  staleAfterMs = 5 * 60 * 1000,
  now = Date.now(),
}: {
  state: BatchState;
  staleAfterMs?: number;
  now?: number;
}) {
  if (!state.activeJob) {
    return false;
  }

  const heartbeatAt = Date.parse(state.activeJob.heartbeatAt);
  if (Number.isNaN(heartbeatAt)) {
    return true;
  }

  return now - heartbeatAt > staleAfterMs;
}

export function beginBatchAttempt({
  state,
  repoRoot,
  manifest,
  batch,
  mode,
  phase,
  logPath,
  jobId = randomUUID(),
  pid = process.pid,
  now = nowIso(),
}: {
  state: BatchState;
  repoRoot: string;
  manifest: WorkflowManifest;
  batch: WorkflowBatch;
  mode: BatchAttemptMode;
  phase: string;
  logPath: string;
  jobId?: string;
  pid?: number | null;
  now?: string;
}) {
  if (state.activeJob || state.currentAttempt?.status === "running") {
    throw new Error(`Batch ${state.batchId} already has an active job.`);
  }

  const attemptNumber = normalizeBatchState(state).nextAttemptNumber;
  const paths = buildBatchArtifactContext({
    repoRoot,
    manifest,
    batch,
    attemptNumber,
    mode,
  });

  return normalizeBatchState({
    ...state,
    status: "running",
    attempts: Math.max(state.attempts, attemptNumber),
    nextAttemptNumber: attemptNumber + 1,
    activeJob: {
      jobId,
      pid,
      phase,
      attemptNumber,
      mode,
      logPath,
      startedAt: now,
      heartbeatAt: now,
    },
    currentAttempt: {
      attemptNumber,
      mode,
      status: "running",
      jobId,
      phase,
      errorMessage: null,
      rawOutputPath: paths.rawOutputPath,
      draftOutputPath: paths.draftOutputPath,
      repairOutputPath: paths.repairOutputPath,
      sourcePackPath: paths.sourcePackPath,
      promptPath: paths.promptPath,
      overlapReportPath: paths.overlapReportPath,
      semanticOverlapReportPath: paths.semanticOverlapReportPath,
      validationReportPath: paths.validationReportPath,
      australianVerificationReportPath: paths.australianVerificationReportPath,
      mergedDecisionReportPath: paths.mergedDecisionReportPath,
      importReportPath: paths.importReportPath,
      acceptedCount: 0,
      rejectedCount: 0,
      remainingCount: state.remaining,
      startedAt: now,
      completedAt: undefined,
    },
    nextAction: "poll_active_job",
    updatedAt: now,
  });
}

export function touchBatchActiveJob({
  state,
  jobId,
  phase,
  now = nowIso(),
}: {
  state: BatchState;
  jobId: string;
  phase?: string;
  now?: string;
}) {
  if (!state.activeJob || !state.currentAttempt) {
    throw new Error(`Batch ${state.batchId} does not have an active job to update.`);
  }

  if (state.activeJob.jobId !== jobId) {
    throw new Error(`Active job mismatch for batch ${state.batchId}.`);
  }

  return normalizeBatchState({
    ...state,
    activeJob: {
      ...state.activeJob,
      phase: phase ?? state.activeJob.phase,
      heartbeatAt: now,
    },
    currentAttempt: {
      ...state.currentAttempt,
      phase: phase ?? state.currentAttempt.phase ?? state.activeJob.phase,
    },
    updatedAt: now,
  });
}

function finalizeBatchAttempt({
  state,
  lifecycleStatus,
  jobId,
  phase,
  acceptedCount,
  rejectedCount,
  remainingCount,
  acceptedTotal = state.acceptedTotal,
  rejectedTotal = state.rejectedTotal,
  remaining = state.remaining,
  batchStatus = state.status,
  nextAction = state.nextAction,
  saturationReason = state.saturationReason,
  usage,
  errorMessage = null,
  now = nowIso(),
}: {
  state: BatchState;
  lifecycleStatus: BatchAttemptLifecycleStatus;
  jobId?: string;
  phase?: string;
  acceptedCount: number;
  rejectedCount: number;
  remainingCount: number;
  acceptedTotal?: number;
  rejectedTotal?: number;
  remaining?: number;
  batchStatus?: BatchState["status"];
  nextAction?: string | null;
  saturationReason?: string | null;
  usage?: BatchState["lastAttempt"] extends infer Attempt
    ? Attempt extends { usage?: infer Usage }
      ? Usage
      : never
    : never;
  errorMessage?: string | null;
  now?: string;
}) {
  const currentAttempt = state.currentAttempt;
  if (!currentAttempt) {
    throw new Error(`Batch ${state.batchId} does not have an active attempt to finalize.`);
  }

  if (jobId && state.activeJob && state.activeJob.jobId !== jobId) {
    throw new Error(`Active job mismatch for batch ${state.batchId}.`);
  }

  const resolvedPhase = phase ?? state.activeJob?.phase ?? currentAttempt.phase ?? null;
  const resolvedJobId = jobId ?? state.activeJob?.jobId ?? currentAttempt.jobId ?? null;
  const finalizedAttempt = {
    ...currentAttempt,
    status: lifecycleStatus,
    jobId: resolvedJobId,
    phase: resolvedPhase,
    acceptedCount,
    rejectedCount,
    remainingCount,
    usage,
    errorMessage,
    completedAt: now,
  };

  return normalizeBatchState({
    ...state,
    status: batchStatus,
    acceptedTotal,
    rejectedTotal,
    remaining,
    activeJob: null,
    currentAttempt: null,
    lastAttempt: finalizedAttempt,
    attemptHistory: [
      ...state.attemptHistory,
      {
        attemptNumber: finalizedAttempt.attemptNumber,
        mode: finalizedAttempt.mode,
        status: lifecycleStatus,
        jobId: resolvedJobId,
        phase: resolvedPhase,
        errorMessage,
        acceptedCount,
        rejectedCount,
        remainingCount,
        startedAt: finalizedAttempt.startedAt,
        completedAt: now,
        recordedAt: now,
      },
    ],
    saturationReason,
    nextAction,
    updatedAt: now,
  });
}

export function completeBatchAttempt({
  state,
  jobId,
  phase,
  acceptedCount,
  rejectedCount,
  remainingCount,
  acceptedTotal,
  rejectedTotal,
  remaining,
  batchStatus,
  nextAction,
  saturationReason,
  usage,
  now,
}: {
  state: BatchState;
  jobId?: string;
  phase?: string;
  acceptedCount: number;
  rejectedCount: number;
  remainingCount: number;
  acceptedTotal?: number;
  rejectedTotal?: number;
  remaining?: number;
  batchStatus?: BatchState["status"];
  nextAction?: string | null;
  saturationReason?: string | null;
  usage?: BatchState["lastAttempt"] extends infer Attempt
    ? Attempt extends { usage?: infer Usage }
      ? Usage
      : never
    : never;
  now?: string;
}) {
  return finalizeBatchAttempt({
    state,
    lifecycleStatus: "completed",
    jobId,
    phase,
    acceptedCount,
    rejectedCount,
    remainingCount,
    acceptedTotal,
    rejectedTotal,
    remaining,
    batchStatus,
    nextAction,
    saturationReason,
    usage,
    errorMessage: null,
    now,
  });
}

export function failBatchAttempt({
  state,
  jobId,
  phase,
  acceptedCount = 0,
  rejectedCount = 0,
  remainingCount = state.remaining,
  acceptedTotal,
  rejectedTotal,
  remaining,
  batchStatus = "failed",
  nextAction = "inspect_failed_attempt",
  saturationReason,
  usage,
  errorMessage,
  now,
}: {
  state: BatchState;
  jobId?: string;
  phase?: string;
  acceptedCount?: number;
  rejectedCount?: number;
  remainingCount?: number;
  acceptedTotal?: number;
  rejectedTotal?: number;
  remaining?: number;
  batchStatus?: BatchState["status"];
  nextAction?: string | null;
  saturationReason?: string | null;
  usage?: BatchState["lastAttempt"] extends infer Attempt
    ? Attempt extends { usage?: infer Usage }
      ? Usage
      : never
    : never;
  errorMessage?: string | null;
  now?: string;
}) {
  return finalizeBatchAttempt({
    state,
    lifecycleStatus: "failed",
    jobId,
    phase,
    acceptedCount,
    rejectedCount,
    remainingCount,
    acceptedTotal,
    rejectedTotal,
    remaining,
    batchStatus,
    nextAction,
    saturationReason,
    usage,
    errorMessage,
    now,
  });
}

export function abandonBatchAttempt({
  state,
  jobId,
  phase,
  acceptedCount = 0,
  rejectedCount = 0,
  remainingCount = state.remaining,
  acceptedTotal,
  rejectedTotal,
  remaining,
  batchStatus = "failed",
  nextAction = "resume_with_fresh_attempt",
  saturationReason,
  errorMessage = "Attempt abandoned before completion.",
  now,
}: {
  state: BatchState;
  jobId?: string;
  phase?: string;
  acceptedCount?: number;
  rejectedCount?: number;
  remainingCount?: number;
  acceptedTotal?: number;
  rejectedTotal?: number;
  remaining?: number;
  batchStatus?: BatchState["status"];
  nextAction?: string | null;
  saturationReason?: string | null;
  errorMessage?: string | null;
  now?: string;
}) {
  return finalizeBatchAttempt({
    state,
    lifecycleStatus: "aborted",
    jobId,
    phase,
    acceptedCount,
    rejectedCount,
    remainingCount,
    acceptedTotal,
    rejectedTotal,
    remaining,
    batchStatus,
    nextAction,
    saturationReason,
    errorMessage,
    now,
  });
}

export function clearBatchActiveJob({
  state,
  nextAction = "resume_batch",
  now = nowIso(),
}: {
  state: BatchState;
  nextAction?: string | null;
  now?: string;
}) {
  return normalizeBatchState({
    ...state,
    activeJob: null,
    updatedAt: now,
    nextAction,
  });
}
