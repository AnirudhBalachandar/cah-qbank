import fs from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import {
  batchAttemptResultSchema,
  type BatchAttemptResult,
  type WorkflowManifest,
} from "./contracts";

export const conductorWorkerRoleSchema = z.enum(["live", "preview"]);
export const conductorWorkerHealthSchema = z.enum(["unknown", "healthy", "unhealthy", "rebuilding"]);
export const conductorAssignmentModeSchema = z.enum(["live", "preview", "resume"]);
export const conductorBatchStatusSchema = z.enum([
  "blocked",
  "pending",
  "preview_running",
  "preview_ready",
  "live_running",
  "completed",
  "saturated",
  "failed",
]);

export const previewProjectionSchema = z.object({
  workerId: z.string().min(1),
  artifactRunId: z.string().min(1),
  terminalMode: z.enum(["preview_completed", "preview_saturated"]),
  projectedAcceptedTotal: z.number().int().min(0),
  projectedRejectedTotal: z.number().int().min(0),
  projectedRemaining: z.number().int().min(0),
  completedAt: z.string().datetime(),
  resultPath: z.string().min(1),
  summaryPath: z.string().nullable().default(null),
});

export const conductorWorkerProcessSchema = z.object({
  pid: z.number().int().positive().nullable(),
  mode: conductorAssignmentModeSchema,
  command: z.array(z.string()).min(1),
  logPath: z.string().min(1),
  artifactRunId: z.string().nullable().default(null),
  startedAt: z.string().datetime(),
  lastObservedAt: z.string().datetime(),
  resumeCount: z.number().int().min(0).default(0),
});

export const conductorWorkerSchema = z.object({
  workerId: z.string().min(1),
  role: conductorWorkerRoleSchema,
  worktreePath: z.string().min(1),
  expectedCommit: z.string().min(1),
  health: conductorWorkerHealthSchema,
  currentBatchId: z.string().regex(/^B\d{2}$/).nullable().default(null),
  currentProcess: conductorWorkerProcessSchema.nullable().default(null),
  processedCount: z.number().int().min(0).default(0),
  failureCount: z.number().int().min(0).default(0),
  lastHeartbeatAt: z.string().datetime().nullable().default(null),
  lastError: z.string().nullable().default(null),
});

export const conductorBatchRecordSchema = z.object({
  batchId: z.string().regex(/^B\d{2}$/),
  manifestIndex: z.number().int().min(0),
  targetCount: z.number().int().min(1),
  status: conductorBatchStatusSchema,
  assignedWorkerId: z.string().nullable().default(null),
  liveAttempts: z.number().int().min(0).default(0),
  previewAttempts: z.number().int().min(0).default(0),
  requeueCount: z.number().int().min(0).default(0),
  acceptedTotal: z.number().int().min(0).default(0),
  rejectedTotal: z.number().int().min(0).default(0),
  remaining: z.number().int().min(0),
  saturationReason: z.string().nullable().default(null),
  lastError: z.string().nullable().default(null),
  previewProjection: previewProjectionSchema.nullable().default(null),
  latestResultPath: z.string().nullable().default(null),
  lastUpdatedAt: z.string().datetime(),
});

export const liveLaneLockSchema = z.object({
  workerId: z.string().nullable().default(null),
  batchId: z.string().regex(/^B\d{2}$/).nullable().default(null),
  acquiredAt: z.string().datetime().nullable().default(null),
});

export const conductorProgressSchema = z.object({
  totalBatches: z.number().int().min(0),
  totalTarget: z.number().int().min(0),
  acceptedTotal: z.number().int().min(0),
  liveExecutionPercent: z.number().min(0).max(100),
  overallProgressPercent: z.number().min(0).max(100),
  completedCount: z.number().int().min(0),
  saturatedCount: z.number().int().min(0),
  failedCount: z.number().int().min(0),
  previewReadyCount: z.number().int().min(0),
  pendingCount: z.number().int().min(0),
  runningCount: z.number().int().min(0),
});

export const orchestrationLedgerSchema = z.object({
  workflowId: z.string().min(1),
  workflowRef: z.string().min(1),
  manifestPath: z.string().min(1),
  frozenBaseRef: z.string().min(1),
  frozenBaseCommit: z.string().min(1),
  worktreeRegistryPath: z.string().nullable().default(null),
  status: z.enum(["running", "completed", "failed"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  conductorHeartbeatAt: z.string().datetime(),
  batchOrder: z.array(z.string().regex(/^B\d{2}$/)).min(1),
  currentPreviewWindow: z.array(z.string().regex(/^B\d{2}$/)).default([]),
  liveLaneLock: liveLaneLockSchema,
  workers: z.array(conductorWorkerSchema).length(4),
  batches: z.record(z.string().regex(/^B\d{2}$/), conductorBatchRecordSchema),
  progress: conductorProgressSchema,
});

export type ConductorWorkerRole = z.infer<typeof conductorWorkerRoleSchema>;
export type ConductorWorkerHealth = z.infer<typeof conductorWorkerHealthSchema>;
export type ConductorAssignmentMode = z.infer<typeof conductorAssignmentModeSchema>;
export type ConductorBatchStatus = z.infer<typeof conductorBatchStatusSchema>;
export type PreviewProjection = z.infer<typeof previewProjectionSchema>;
export type ConductorWorker = z.infer<typeof conductorWorkerSchema>;
export type ConductorBatchRecord = z.infer<typeof conductorBatchRecordSchema>;
export type OrchestrationLedger = z.infer<typeof orchestrationLedgerSchema>;
export type ConductorProgress = z.infer<typeof conductorProgressSchema>;

export type ConductorDashboardPayload = {
  workflowId: string;
  generatedAt: string;
  status: OrchestrationLedger["status"];
  frozenBaseRef: string;
  frozenBaseCommit: string;
  overall: ConductorProgress;
  workerOccupancy: Array<{
    workerId: string;
    role: ConductorWorkerRole;
    health: ConductorWorkerHealth;
    currentBatchId: string | null;
    currentMode: ConductorAssignmentMode | null;
    pid: number | null;
    logPath: string | null;
    resumeCount: number;
  }>;
  currentLiveBatch: string | null;
  previewReadyCandidates: Array<{
    batchId: string;
    projectedAcceptedTotal: number;
    projectedRemaining: number;
    terminalMode: PreviewProjection["terminalMode"];
  }>;
  nextLikelyPromotionTarget: string | null;
  failureRetryState: Array<{
    batchId: string;
    status: ConductorBatchStatus;
    requeueCount: number;
    lastError: string | null;
    saturationReason: string | null;
  }>;
  batchStatus: Array<{
    batchId: string;
    status: ConductorBatchStatus;
    acceptedTotal: number;
    remaining: number;
    targetCount: number;
    assignedWorkerId: string | null;
    etaSeconds: number | null;
    previewProjection: PreviewProjection | null;
  }>;
};

type WorkerSpec = {
  workerId: string;
  role: ConductorWorkerRole;
  worktreePath: string;
  expectedCommit: string;
};

function nowIso() {
  return new Date().toISOString();
}

function clampPercent(value: number) {
  return Number(Math.max(0, Math.min(100, value)).toFixed(2));
}

export function resolveWorkflowOrchestrationDir(repoRoot: string, workflowId: string) {
  return path.join(repoRoot, "workflow", "orchestration", workflowId);
}

export function resolveOrchestrationPaths(repoRoot: string, workflowId: string) {
  const orchestrationDir = resolveWorkflowOrchestrationDir(repoRoot, workflowId);
  return {
    orchestrationDir,
    ledgerPath: path.join(orchestrationDir, "ledger.json"),
    dashboardJsonPath: path.join(orchestrationDir, "dashboard.json"),
    dashboardMdPath: path.join(orchestrationDir, "dashboard.md"),
    logsDir: path.join(orchestrationDir, "logs"),
  };
}

export async function writeJsonArtifact(targetPath: string, payload: unknown) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, JSON.stringify(payload, null, 2), "utf8");
}

async function readJsonIfPresent<T>(targetPath: string, schema: z.ZodSchema<T>) {
  try {
    const raw = await fs.readFile(targetPath, "utf8");
    return schema.parse(JSON.parse(raw));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export function parseRange(manifest: WorkflowManifest, fromBatchId: string, toBatchId: string) {
  const all = manifest.batches.map((batch) => batch.batchId);
  const start = all.indexOf(fromBatchId);
  const end = all.indexOf(toBatchId);
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Invalid --from/--to range for this workflow.");
  }
  return all.slice(start, end + 1);
}

function buildInitialBatchRecord(manifest: WorkflowManifest, batchId: string): ConductorBatchRecord {
  const batch = manifest.batches.find((entry) => entry.batchId === batchId);
  if (!batch) {
    throw new Error(`Batch ${batchId} not found in manifest ${manifest.workflowId}.`);
  }

  const acceptedHint = batch.acceptedCountHint ?? (batch.status === "completed" ? batch.targetCount : 0);
  const blocked = batch.status === "completed" || batch.status === "saturated";
  return conductorBatchRecordSchema.parse({
    batchId,
    manifestIndex: manifest.batches.findIndex((entry) => entry.batchId === batchId),
    targetCount: batch.targetCount,
    status: blocked ? batch.status : "pending",
    assignedWorkerId: null,
    liveAttempts: 0,
    previewAttempts: 0,
    requeueCount: 0,
    acceptedTotal: acceptedHint,
    rejectedTotal: 0,
    remaining: Math.max(batch.targetCount - acceptedHint, 0),
    saturationReason: batch.frozenReason ?? null,
    lastError: null,
    previewProjection: null,
    latestResultPath: null,
    lastUpdatedAt: nowIso(),
  });
}

function buildInitialProgress(ledger: Pick<OrchestrationLedger, "batchOrder" | "batches">): ConductorProgress {
  const batchRecords = ledger.batchOrder.map((batchId) => ledger.batches[batchId]).filter(Boolean);
  const totalTarget = batchRecords.reduce((sum, batch) => sum + batch.targetCount, 0);
  const acceptedTotal = batchRecords.reduce((sum, batch) => sum + batch.acceptedTotal, 0);
  const completedCount = batchRecords.filter((batch) => batch.status === "completed").length;
  const saturatedCount = batchRecords.filter((batch) => batch.status === "saturated").length;
  const failedCount = batchRecords.filter((batch) => batch.status === "failed").length;
  const previewReadyCount = batchRecords.filter((batch) => batch.status === "preview_ready").length;
  const pendingCount = batchRecords.filter((batch) => batch.status === "pending").length;
  const runningCount = batchRecords.filter((batch) => batch.status === "preview_running" || batch.status === "live_running").length;
  const liveExecutionWeight = batchRecords.reduce((sum, batch) => {
    if (batch.status === "completed" || batch.status === "saturated") {
      return sum + batch.targetCount;
    }
    if (batch.status === "live_running") {
      return sum + Math.max(batch.acceptedTotal, batch.targetCount * 0.5);
    }
    return sum;
  }, 0);

  return conductorProgressSchema.parse({
    totalBatches: batchRecords.length,
    totalTarget,
    acceptedTotal,
    liveExecutionPercent: totalTarget > 0 ? clampPercent((liveExecutionWeight / totalTarget) * 100) : 0,
    overallProgressPercent: totalTarget > 0 ? clampPercent((acceptedTotal / totalTarget) * 100) : 0,
    completedCount,
    saturatedCount,
    failedCount,
    previewReadyCount,
    pendingCount,
    runningCount,
  });
}

function buildInitialWorkers(workers: WorkerSpec[]) {
  return workers.map((worker) => conductorWorkerSchema.parse({
    workerId: worker.workerId,
    role: worker.role,
    worktreePath: path.resolve(worker.worktreePath),
    expectedCommit: worker.expectedCommit,
    health: "healthy",
    currentBatchId: null,
    currentProcess: null,
    processedCount: 0,
    failureCount: 0,
    lastHeartbeatAt: null,
    lastError: null,
  }));
}

export function deriveNextPreviewWindow(ledger: OrchestrationLedger, maxWindow = 4) {
  return ledger.batchOrder.filter((batchId) => {
    const batch = ledger.batches[batchId];
    return batch
      && batch.status !== "blocked"
      && batch.status !== "completed"
      && batch.status !== "saturated"
      && batch.status !== "failed"
      && batch.status !== "live_running";
  }).slice(0, maxWindow);
}

const RETRYABLE_FAILED_ERROR_PATTERNS = [
  "timed out",
  "timeout",
  "can't reach database server",
  "p1001",
  "startup websocket prewarm setup failed",
  "you've hit your usage limit",
  "unexpected disconnect",
  "websocket",
  "codex exited with code 1",
  "failed to delete shell snapshot",
];

export function isRetryableFailedBatch(batch: ConductorBatchRecord | null | undefined) {
  if (!batch || batch.status !== "failed" || batch.requeueCount > 0) {
    return false;
  }

  const lastError = batch.lastError?.toLowerCase() ?? "";
  return RETRYABLE_FAILED_ERROR_PATTERNS.some((pattern) => lastError.includes(pattern));
}

function deriveRetryableFailedPreviewBatches(ledger: OrchestrationLedger, maxCount = 1) {
  return ledger.batchOrder
    .map((batchId) => ledger.batches[batchId])
    .filter((batch): batch is ConductorBatchRecord => Boolean(batch && isRetryableFailedBatch(batch)))
    .sort((left, right) => getManifestOrderIndex(ledger, left.batchId) - getManifestOrderIndex(ledger, right.batchId))
    .slice(0, maxCount)
    .map((batch) => batch.batchId);
}

function getManifestOrderIndex(ledger: OrchestrationLedger, batchId: string) {
  return ledger.batches[batchId]?.manifestIndex ?? Number.MAX_SAFE_INTEGER;
}

export function rankPreviewCandidates(ledger: OrchestrationLedger, batchIds: string[]) {
  return batchIds
    .map((batchId) => ledger.batches[batchId])
    .filter((batch): batch is ConductorBatchRecord => Boolean(batch?.previewProjection))
    .sort((left, right) => {
      const leftProjection = left.previewProjection!;
      const rightProjection = right.previewProjection!;
      if (rightProjection.projectedAcceptedTotal !== leftProjection.projectedAcceptedTotal) {
        return rightProjection.projectedAcceptedTotal - leftProjection.projectedAcceptedTotal;
      }
      if (leftProjection.projectedRemaining !== rightProjection.projectedRemaining) {
        return leftProjection.projectedRemaining - rightProjection.projectedRemaining;
      }
      return getManifestOrderIndex(ledger, left.batchId) - getManifestOrderIndex(ledger, right.batchId);
    });
}

export function chooseNextLivePromotion(ledger: OrchestrationLedger) {
  const window = deriveNextPreviewWindow(ledger, 4);
  return rankPreviewCandidates(ledger, window)[0] ?? null;
}

export function getWorker(ledger: OrchestrationLedger, workerId: string) {
  return ledger.workers.find((worker) => worker.workerId === workerId) ?? null;
}

export async function loadOrInitializeLedger({
  repoRoot,
  manifest,
  workflowRef,
  manifestPath,
  frozenBaseRef,
  frozenBaseCommit,
  worktreeRegistryPath,
  batchOrder,
  workers,
  forceFresh = false,
}: {
  repoRoot: string;
  manifest: WorkflowManifest;
  workflowRef: string;
  manifestPath: string;
  frozenBaseRef: string;
  frozenBaseCommit: string;
  worktreeRegistryPath?: string | null;
  batchOrder: string[];
  workers: WorkerSpec[];
  forceFresh?: boolean;
}): Promise<OrchestrationLedger> {
  const { orchestrationDir, ledgerPath } = resolveOrchestrationPaths(repoRoot, manifest.workflowId);
  await fs.mkdir(orchestrationDir, { recursive: true });

  if (!forceFresh) {
    try {
      const raw = await fs.readFile(ledgerPath, "utf8");
      return orchestrationLedgerSchema.parse(JSON.parse(raw));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        throw error;
      }
    }
  }

  const batches: OrchestrationLedger["batches"] = Object.fromEntries(
    batchOrder.map((batchId) => [batchId, buildInitialBatchRecord(manifest, batchId)]),
  );
  const createdAt = nowIso();
  const ledger = orchestrationLedgerSchema.parse({
    workflowId: manifest.workflowId,
    workflowRef,
    manifestPath,
    frozenBaseRef,
    frozenBaseCommit,
    worktreeRegistryPath: worktreeRegistryPath ?? null,
    status: "running",
    createdAt,
    updatedAt: createdAt,
    conductorHeartbeatAt: createdAt,
    batchOrder,
    currentPreviewWindow: batchOrder.slice(0, 4),
    liveLaneLock: {
      workerId: null,
      batchId: null,
      acquiredAt: null,
    },
    workers: buildInitialWorkers(workers),
    batches,
    progress: buildInitialProgress({ batchOrder, batches }),
  });

  await writeJsonArtifact(ledgerPath, ledger);
  return ledger;
}

export async function loadLedger(ledgerPath: string) {
  const raw = await fs.readFile(ledgerPath, "utf8");
  return orchestrationLedgerSchema.parse(JSON.parse(raw));
}

export async function saveLedger(ledgerPath: string, ledger: OrchestrationLedger) {
  const nextLedger = orchestrationLedgerSchema.parse({
    ...ledger,
    currentPreviewWindow: deriveNextPreviewWindow(ledger, 4),
    progress: buildInitialProgress(ledger),
    conductorHeartbeatAt: nowIso(),
    updatedAt: nowIso(),
    status: finalizeLedgerStatus(ledger),
  });

  await writeJsonArtifact(ledgerPath, nextLedger);
  return nextLedger;
}

export function finalizeLedgerStatus(ledger: OrchestrationLedger): OrchestrationLedger["status"] {
  const unresolved = ledger.batchOrder.some((batchId) => {
    const batch = ledger.batches[batchId];
    return Boolean(batch) && (
      isRetryableFailedBatch(batch)
      || (
        batch.status !== "blocked"
        && batch.status !== "completed"
        && batch.status !== "saturated"
        && batch.status !== "failed"
      )
    );
  });

  if (unresolved) {
    return "running";
  }

  return ledger.batchOrder.some((batchId) => ledger.batches[batchId]?.status === "failed") ? "failed" : "completed";
}

export function claimPreviewBatch(ledger: OrchestrationLedger, workerId: string) {
  const worker = getWorker(ledger, workerId);
  if (!worker || worker.role !== "preview" || worker.currentBatchId || worker.health !== "healthy") {
    return null;
  }

  const candidate =
    deriveRetryableFailedPreviewBatches(ledger, 1)[0] ??
    deriveNextPreviewWindow(ledger, 4).find((batchId) => {
      const batch = ledger.batches[batchId];
      return batch && batch.status === "pending" && !batch.assignedWorkerId && !batch.previewProjection;
    });

  if (!candidate) {
    return null;
  }

  const batch = ledger.batches[candidate];
  if (batch.status === "failed") {
    batch.requeueCount += 1;
    batch.lastError = batch.lastError ?? "Requeued failed preview batch.";
  }
  batch.status = "preview_running";
  batch.assignedWorkerId = workerId;
  batch.previewAttempts += 1;
  batch.lastUpdatedAt = nowIso();
  worker.currentBatchId = candidate;
  worker.lastHeartbeatAt = nowIso();
  return candidate;
}

export function claimLivePromotion(ledger: OrchestrationLedger, workerId: string) {
  const worker = getWorker(ledger, workerId);
  if (!worker || worker.role !== "live" || worker.currentBatchId || worker.health !== "healthy" || ledger.liveLaneLock.batchId) {
    return null;
  }

  const candidate = chooseNextLivePromotion(ledger);
  if (!candidate) {
    return null;
  }

  const batch = ledger.batches[candidate.batchId];
  batch.status = "live_running";
  batch.assignedWorkerId = workerId;
  batch.liveAttempts += 1;
  batch.lastUpdatedAt = nowIso();
  worker.currentBatchId = candidate.batchId;
  worker.lastHeartbeatAt = nowIso();
  ledger.liveLaneLock = {
    workerId,
    batchId: candidate.batchId,
    acquiredAt: nowIso(),
  };
  return candidate.batchId;
}

export function attachWorkerProcess({
  ledger,
  workerId,
  pid,
  mode,
  command,
  logPath,
  artifactRunId = null,
  resumeCount = 0,
  now = nowIso(),
}: {
  ledger: OrchestrationLedger;
  workerId: string;
  pid: number | null;
  mode: ConductorAssignmentMode;
  command: string[];
  logPath: string;
  artifactRunId?: string | null;
  resumeCount?: number;
  now?: string;
}) {
  const worker = getWorker(ledger, workerId);
  if (!worker) {
    throw new Error(`Unknown worker ${workerId}`);
  }

  worker.currentProcess = conductorWorkerProcessSchema.parse({
    pid,
    mode,
    command,
    logPath,
    artifactRunId,
    startedAt: now,
    lastObservedAt: now,
    resumeCount,
  });
  worker.lastHeartbeatAt = now;
  worker.lastError = null;
}

export function touchWorkerProcess(ledger: OrchestrationLedger, workerId: string, now = nowIso()) {
  const worker = getWorker(ledger, workerId);
  if (!worker) {
    return;
  }
  worker.lastHeartbeatAt = now;
  if (worker.currentProcess) {
    worker.currentProcess.lastObservedAt = now;
  }
}

function clearWorkerAssignment(ledger: OrchestrationLedger, workerId: string) {
  const worker = getWorker(ledger, workerId);
  if (!worker) {
    return;
  }
  worker.currentBatchId = null;
  worker.currentProcess = null;
  worker.lastHeartbeatAt = nowIso();
  worker.processedCount += 1;
}

export function applyPreviewResult({
  ledger,
  workerId,
  batchId,
  result,
  resultPath,
}: {
  ledger: OrchestrationLedger;
  workerId: string;
  batchId: string;
  result: BatchAttemptResult;
  resultPath: string;
}) {
  const batch = ledger.batches[batchId];
  if (!batch) {
    return;
  }

  batch.status = "preview_ready";
  batch.assignedWorkerId = null;
  batch.previewProjection = {
    workerId,
    artifactRunId: result.importMode === "dry_run"
      ? path.basename(path.dirname(resultPath))
      : batchId.toLowerCase(),
    terminalMode: result.terminalMode === "preview_saturated" ? "preview_saturated" : "preview_completed",
    projectedAcceptedTotal: result.projectedAcceptanceSummary?.acceptedTotalProjected ?? result.acceptedTotal,
    projectedRejectedTotal: result.projectedAcceptanceSummary?.rejectedTotalProjected ?? result.rejectedTotal,
    projectedRemaining: result.projectedAcceptanceSummary?.remainingProjected ?? result.remaining,
    completedAt: result.completedAt,
    resultPath,
    summaryPath: result.artifactPaths.summaryPath ?? null,
  };
  batch.lastError = null;
  batch.latestResultPath = resultPath;
  batch.lastUpdatedAt = nowIso();
  clearWorkerAssignment(ledger, workerId);
}

export function applyLiveResult({
  ledger,
  workerId,
  batchId,
  result,
  resultPath,
}: {
  ledger: OrchestrationLedger;
  workerId: string;
  batchId: string;
  result: BatchAttemptResult;
  resultPath: string;
}) {
  const batch = ledger.batches[batchId];
  if (!batch) {
    return;
  }

  batch.acceptedTotal = result.acceptedTotal;
  batch.rejectedTotal = result.rejectedTotal;
  batch.remaining = result.remaining;
  batch.saturationReason = result.saturationReason;
  batch.lastError = result.errorMessage ?? null;
  batch.previewProjection = null;
  batch.latestResultPath = resultPath;
  batch.lastUpdatedAt = nowIso();
  batch.assignedWorkerId = null;
  batch.status = result.terminalMode === "completed"
    ? "completed"
    : result.terminalMode === "saturated"
      ? "saturated"
      : "failed";

  if (ledger.liveLaneLock.batchId === batchId) {
    ledger.liveLaneLock = {
      workerId: null,
      batchId: null,
      acquiredAt: null,
    };
  }

  clearWorkerAssignment(ledger, workerId);
}

export function requeuePreviewBatch({
  ledger,
  workerId,
  batchId,
  error,
}: {
  ledger: OrchestrationLedger;
  workerId: string;
  batchId: string;
  error: string;
}) {
  const batch = ledger.batches[batchId];
  const worker = getWorker(ledger, workerId);
  if (!batch || !worker) {
    return;
  }

  batch.status = "pending";
  batch.assignedWorkerId = null;
  batch.requeueCount += 1;
  batch.lastError = error;
  batch.lastUpdatedAt = nowIso();
  worker.failureCount += 1;
  worker.lastError = error;
  clearWorkerAssignment(ledger, workerId);
}

export function failLiveBatch({
  ledger,
  workerId,
  batchId,
  error,
}: {
  ledger: OrchestrationLedger;
  workerId: string;
  batchId: string;
  error: string;
}) {
  const batch = ledger.batches[batchId];
  const worker = getWorker(ledger, workerId);
  if (!batch || !worker) {
    return;
  }

  batch.status = "failed";
  batch.assignedWorkerId = null;
  batch.lastError = error;
  batch.lastUpdatedAt = nowIso();
  worker.failureCount += 1;
  worker.lastError = error;
  if (ledger.liveLaneLock.batchId === batchId) {
    ledger.liveLaneLock = {
      workerId: null,
      batchId: null,
      acquiredAt: null,
    };
  }
  clearWorkerAssignment(ledger, workerId);
}

export function markWorkerHealth({
  ledger,
  workerId,
  health,
  error = null,
}: {
  ledger: OrchestrationLedger;
  workerId: string;
  health: ConductorWorkerHealth;
  error?: string | null;
}) {
  const worker = getWorker(ledger, workerId);
  if (!worker) {
    return;
  }
  worker.health = health;
  worker.lastError = error;
}

export function buildDashboardView({
  ledger,
}: {
  ledger: OrchestrationLedger;
}): ConductorDashboardPayload {
  const now = Date.now();
  const defaultRunningEtaSeconds = 15 * 60;
  const runningEtaByBatchId = new Map(
    ledger.workers
      .filter((worker) => worker.currentBatchId && worker.currentProcess)
      .map((worker) => {
        const startedAt = Date.parse(worker.currentProcess?.startedAt ?? "");
        const elapsedSeconds = Number.isNaN(startedAt) ? 0 : Math.max(0, Math.round((now - startedAt) / 1000));
        return [
          worker.currentBatchId as string,
          Math.max(60, defaultRunningEtaSeconds - elapsedSeconds),
        ] as const;
      }),
  );

  const previewReadyCandidates = rankPreviewCandidates(ledger, deriveNextPreviewWindow(ledger, 4)).map((batch) => ({
    batchId: batch.batchId,
    projectedAcceptedTotal: batch.previewProjection?.projectedAcceptedTotal ?? batch.acceptedTotal,
    projectedRemaining: batch.previewProjection?.projectedRemaining ?? batch.remaining,
    terminalMode: batch.previewProjection?.terminalMode ?? "preview_saturated",
  }));

  return {
    workflowId: ledger.workflowId,
    generatedAt: nowIso(),
    status: finalizeLedgerStatus(ledger),
    frozenBaseRef: ledger.frozenBaseRef,
    frozenBaseCommit: ledger.frozenBaseCommit,
    overall: buildInitialProgress(ledger),
    workerOccupancy: ledger.workers.map((worker) => ({
      workerId: worker.workerId,
      role: worker.role,
      health: worker.health,
      currentBatchId: worker.currentBatchId,
      currentMode: worker.currentProcess?.mode ?? null,
      pid: worker.currentProcess?.pid ?? null,
      logPath: worker.currentProcess?.logPath ?? null,
      resumeCount: worker.currentProcess?.resumeCount ?? 0,
    })),
    currentLiveBatch: ledger.liveLaneLock.batchId,
    previewReadyCandidates,
    nextLikelyPromotionTarget: previewReadyCandidates[0]?.batchId ?? null,
    failureRetryState: ledger.batchOrder
      .map((batchId) => ledger.batches[batchId])
      .filter((batch) => batch.status === "failed" || batch.requeueCount > 0)
      .map((batch) => ({
        batchId: batch.batchId,
        status: batch.status,
        requeueCount: batch.requeueCount,
        lastError: batch.lastError,
        saturationReason: batch.saturationReason,
      })),
    batchStatus: ledger.batchOrder.map((batchId) => {
      const batch = ledger.batches[batchId];
      return {
        batchId,
        status: batch.status,
        acceptedTotal: batch.acceptedTotal,
        remaining: batch.remaining,
        targetCount: batch.targetCount,
        assignedWorkerId: batch.assignedWorkerId,
        etaSeconds: runningEtaByBatchId.get(batchId) ?? (batch.status === "preview_ready" ? 60 : null),
        previewProjection: batch.previewProjection,
      };
    }),
  };
}

export async function loadBatchAttemptResult(resultPath: string) {
  return readJsonIfPresent(resultPath, batchAttemptResultSchema);
}
