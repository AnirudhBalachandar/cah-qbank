import { spawn } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { loadWorkflowManifest } from "./lib/manifest";
import { resolveBatchResultArtifactPath } from "./lib/artifacts";
import { batchAttemptResultSchema } from "./lib/contracts";
import {
  applyLiveResult,
  applyPreviewResult,
  attachWorkerProcess,
  claimLivePromotion,
  claimPreviewBatch,
  failLiveBatch,
  finalizeLedgerStatus,
  getWorker,
  isRetryableFailedBatch,
  loadLedger,
  loadOrInitializeLedger,
  markWorkerHealth,
  requeuePreviewBatch,
  resolveOrchestrationPaths,
  saveLedger,
  touchWorkerProcess,
  type ConductorAssignmentMode,
  type OrchestrationLedger,
} from "./lib/multi-worktree-orchestration";
import { writeOrchestrationDashboard } from "./lib/dashboard";
import {
  checkWorkerWorktrees,
  loadWorktreeRegistry,
  registerDetachedWorkerWorktrees,
  repairUnhealthyWorkerWorktrees,
  resolveFrozenCommit,
  type WorkerWorktreeSpec,
  type WorktreeRegistry,
} from "./lib/worker-worktree-utils";

const execFileAsync = promisify(execFile);
const DEFAULT_POLL_MS = Number(process.env.CODEX_CONDUCTOR_POLL_MS ?? 5_000);
const DEFAULT_PREVIEW_LANES = 3;
const DEFAULT_REQUEUE_LIMIT = 1;

type BootstrapCommand = {
  name: "bootstrap";
  workflow: string;
  baseRef: string;
  worker1Path?: string;
  workerRoot?: string;
  registryPath?: string;
  count: number;
  from?: string;
  to?: string;
  forceFresh: boolean;
};

type RunCommand = {
  name: "run";
  workflow: string;
  from?: string;
  to?: string;
  pollMs: number;
  continueOnFailure: boolean;
  forceFresh: boolean;
  maxPreviewLanes: number;
  requeueLimit: number;
};

type ResumeCommand = {
  name: "resume";
  workflow: string;
  pollMs: number;
  continueOnFailure: boolean;
  maxPreviewLanes: number;
  requeueLimit: number;
};

type StatusCommand = {
  name: "status";
  workflow: string;
};

type Command = BootstrapCommand | RunCommand | ResumeCommand | StatusCommand;

type GitWorktreeEntry = {
  path: string;
  branch: string | null;
  detached: boolean;
  head: string | null;
};

function usage() {
  console.log([
    "Usage:",
    "  pnpm tsx scripts/generation/run_multi_worktree_conductor.ts bootstrap --workflow <id> --base-ref <git-ref> [--worker-1 <path>] [--worker-root <path>] [--registry <path>] [--count 3] [--from <BXX>] [--to <BYY>] [--force-fresh]",
    "  pnpm tsx scripts/generation/run_multi_worktree_conductor.ts run --workflow <id> [--from <BXX>] [--to <BYY>] [--poll-ms <ms>] [--continue-on-failure] [--force-fresh] [--max-preview-lanes <1-3>] [--requeue-limit <n>]",
    "  pnpm tsx scripts/generation/run_multi_worktree_conductor.ts resume --workflow <id> [--poll-ms <ms>] [--continue-on-failure] [--max-preview-lanes <1-3>] [--requeue-limit <n>]",
    "  pnpm tsx scripts/generation/run_multi_worktree_conductor.ts status --workflow <id>",
  ].join("\n"));
}

function parseArgs(argv: string[]): Command {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h") {
    usage();
    process.exit(0);
  }

  const options = new Map<string, string>();
  const flags = new Set<string>();

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${token}`);
    }
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) {
      flags.add(token);
      continue;
    }
    options.set(token, next);
    index += 1;
  }

  const workflow = options.get("--workflow");
  if (!workflow) {
    throw new Error("Missing required --workflow argument.");
  }

  if (command === "bootstrap") {
    const baseRef = options.get("--base-ref");
    if (!baseRef) {
      throw new Error("Missing required --base-ref argument.");
    }
    return {
      name: "bootstrap",
      workflow,
      baseRef,
      worker1Path: options.get("--worker-1"),
      workerRoot: options.get("--worker-root"),
      registryPath: options.get("--registry"),
      count: Math.max(1, Number(options.get("--count") ?? "3")),
      from: options.get("--from"),
      to: options.get("--to"),
      forceFresh: flags.has("--force-fresh"),
    };
  }

  if (command === "run") {
    return {
      name: "run",
      workflow,
      from: options.get("--from"),
      to: options.get("--to"),
      pollMs: Math.max(500, Number(options.get("--poll-ms") ?? DEFAULT_POLL_MS)),
      continueOnFailure: flags.has("--continue-on-failure"),
      forceFresh: flags.has("--force-fresh"),
      maxPreviewLanes: Math.max(1, Math.min(DEFAULT_PREVIEW_LANES, Number(options.get("--max-preview-lanes") ?? DEFAULT_PREVIEW_LANES))),
      requeueLimit: Math.max(0, Number(options.get("--requeue-limit") ?? DEFAULT_REQUEUE_LIMIT)),
    };
  }

  if (command === "resume") {
    return {
      name: "resume",
      workflow,
      pollMs: Math.max(500, Number(options.get("--poll-ms") ?? DEFAULT_POLL_MS)),
      continueOnFailure: flags.has("--continue-on-failure"),
      maxPreviewLanes: Math.max(1, Math.min(DEFAULT_PREVIEW_LANES, Number(options.get("--max-preview-lanes") ?? DEFAULT_PREVIEW_LANES))),
      requeueLimit: Math.max(0, Number(options.get("--requeue-limit") ?? DEFAULT_REQUEUE_LIMIT)),
    };
  }

  if (command === "status") {
    return { name: "status", workflow };
  }

  throw new Error(`Unknown command: ${command}`);
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

async function getProcessCommandLine(pid: number | null | undefined) {
  if (!pid || pid <= 0) {
    return null;
  }

  try {
    const { stdout } = await execFileAsync("ps", ["-o", "command=", "-p", String(pid)], {
      maxBuffer: 1024 * 1024,
    });
    const line = stdout.trim();
    return line.length > 0 ? line : null;
  } catch {
    return null;
  }
}

async function isTrackedWorkerProcessAlive({
  pid,
  command,
  batchId,
}: {
  pid: number | null | undefined;
  command: string[];
  batchId: string;
}) {
  if (!isPidAlive(pid)) {
    return false;
  }

  const processCommandLine = await getProcessCommandLine(pid);
  if (!processCommandLine) {
    return false;
  }

  const requiredSubstrings = [
    "run_notes_workflow.ts",
    batchId,
  ];

  return requiredSubstrings.every((token) => processCommandLine.includes(token));
}

async function listGitWorktrees(repoRoot: string): Promise<GitWorktreeEntry[]> {
  const { stdout } = await execFileAsync("git", ["worktree", "list", "--porcelain"], {
    cwd: repoRoot,
    maxBuffer: 10 * 1024 * 1024,
  });

  const entries: GitWorktreeEntry[] = [];
  let current: Partial<GitWorktreeEntry> = {};
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) {
      if (current.path) {
        entries.push({
          path: current.path,
          branch: current.branch ?? null,
          detached: current.detached ?? false,
          head: current.head ?? null,
        });
      }
      current = {};
      continue;
    }

    if (line.startsWith("worktree ")) {
      current.path = line.slice("worktree ".length).trim();
    } else if (line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length).trim();
    } else if (line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length).trim();
    } else if (line.trim() === "detached") {
      current.detached = true;
    }
  }

  if (current.path) {
    entries.push({
      path: current.path,
      branch: current.branch ?? null,
      detached: current.detached ?? false,
      head: current.head ?? null,
    });
  }

  return entries;
}

function defaultWorkerRoot(repoRoot: string) {
  return path.resolve(repoRoot, "..", `${path.basename(repoRoot)}-workers`);
}

function defaultRegistryPath(repoRoot: string, workflowId: string) {
  return path.join(resolveOrchestrationPaths(repoRoot, workflowId).orchestrationDir, "worker-worktrees.json");
}

async function upsertWorkerRegistryEntry({
  registryPath,
  frozenRef,
  frozenCommit,
  worker,
}: {
  registryPath: string;
  frozenRef: string;
  frozenCommit: string;
  worker: WorkerWorktreeSpec;
}) {
  const existing = (await loadWorktreeRegistry(registryPath)) ?? {
    version: 1 as const,
    frozenRef,
    frozenCommit,
    createdAt: new Date().toISOString(),
    workers: [],
  };

  existing.frozenRef = frozenRef;
  existing.frozenCommit = frozenCommit;
  const withoutCurrent = existing.workers.filter((entry) => entry.workerId !== worker.workerId && entry.path !== worker.path);
  const next: WorktreeRegistry = {
    ...existing,
    workers: [worker, ...withoutCurrent],
  };
  await fs.mkdir(path.dirname(registryPath), { recursive: true });
  await fs.writeFile(registryPath, JSON.stringify(next, null, 2), "utf8");
}

async function discoverWorker1Path(repoRoot: string, expectedCommit: string) {
  const worktrees = await listGitWorktrees(repoRoot);
  const candidates = worktrees.filter((entry) => path.resolve(entry.path) !== path.resolve(repoRoot));
  const exactCommit = candidates.find((entry) => entry.head === expectedCommit);
  return exactCommit?.path ?? candidates[0]?.path ?? null;
}

async function bootstrapConductor(command: BootstrapCommand) {
  const { repoRoot, manifest, manifestPath } = await loadWorkflowManifest(command.workflow);
  const batchOrder = manifest.batches.map((batch) => batch.batchId);
  const from = command.from ?? batchOrder[0];
  const to = command.to ?? batchOrder[batchOrder.length - 1];
  const frozenCommit = await resolveFrozenCommit(repoRoot, command.baseRef);
  const worker1Path = command.worker1Path
    ? path.resolve(command.worker1Path)
    : await discoverWorker1Path(repoRoot, frozenCommit);

  if (!worker1Path) {
    throw new Error("Unable to discover the existing automation-capable worker worktree. Pass --worker-1 explicitly.");
  }

  const registryPath = command.registryPath ?? defaultRegistryPath(repoRoot, manifest.workflowId);
  const workerRoot = command.workerRoot ? path.resolve(command.workerRoot) : defaultWorkerRoot(repoRoot);
  const created = await registerDetachedWorkerWorktrees({
    repoRoot,
    baseRef: command.baseRef,
    count: command.count,
    prefix: `${manifest.workflowId}-worker`,
    workerRoot,
    registryPath,
    forceRecreateExisting: false,
  });

  const liveWorkerId = "worker-live-01";
  const worker1: WorkerWorktreeSpec = {
    workerId: liveWorkerId,
    path: worker1Path,
    frozenRef: command.baseRef,
    frozenCommit,
    baseCommit: frozenCommit,
    registryCreatedAt: new Date().toISOString(),
    host: os.hostname(),
  };
  await upsertWorkerRegistryEntry({
    registryPath,
    frozenRef: command.baseRef,
    frozenCommit,
    worker: worker1,
  });

  const registry = await loadWorktreeRegistry(registryPath);
  const previewWorkers = (registry?.workers ?? [])
    .filter((entry) => entry.workerId !== liveWorkerId)
    .slice(0, 3);

  if (previewWorkers.length < 3) {
    throw new Error(`Expected 3 preview workers after bootstrap, found ${previewWorkers.length}.`);
  }

  const fromIndex = manifest.batches.findIndex((batch) => batch.batchId === from);
  const toIndex = manifest.batches.findIndex((batch) => batch.batchId === to);
  if (fromIndex === -1 || toIndex === -1 || toIndex < fromIndex) {
    throw new Error(`Invalid bootstrap range ${from}-${to} for workflow ${manifest.workflowId}.`);
  }

  const workers = [
    { workerId: liveWorkerId, role: "live" as const, worktreePath: worker1Path, expectedCommit: frozenCommit },
    ...previewWorkers.map((entry) => ({
      workerId: entry.workerId,
      role: "preview" as const,
      worktreePath: entry.path,
      expectedCommit: frozenCommit,
    })),
  ];

  const selectedBatchOrder = manifest.batches
    .map((batch) => batch.batchId)
    .slice(fromIndex, toIndex + 1);

  const ledger = await loadOrInitializeLedger({
    repoRoot,
    manifest,
    workflowRef: command.workflow,
    manifestPath,
    frozenBaseRef: command.baseRef,
    frozenBaseCommit: frozenCommit,
    worktreeRegistryPath: registryPath,
    batchOrder: selectedBatchOrder,
    workers,
    forceFresh: command.forceFresh,
  });
  await saveLedger(resolveOrchestrationPaths(repoRoot, manifest.workflowId).ledgerPath, ledger);
  const dashboard = await writeOrchestrationDashboard({ repoRoot, manifest, ledger });

  return {
    ok: created.errors.length === 0,
    workflowId: manifest.workflowId,
    worker1Path,
    createdWorkers: created.created.map((entry) => ({ workerId: entry.workerId, path: entry.path })),
    registryPath,
    ledgerPath: resolveOrchestrationPaths(repoRoot, manifest.workflowId).ledgerPath,
    dashboardPath: dashboard.jsonPath,
  };
}

function buildWorkerCommand({
  workflow,
  batchId,
  mode,
  artifactRunId,
}: {
  workflow: string;
  batchId: string;
  mode: ConductorAssignmentMode;
  artifactRunId?: string | null;
}) {
  if (mode === "resume") {
    return ["pnpm", "tsx", "scripts/generation/run_notes_workflow.ts", "resume", "--workflow", workflow, "--batch", batchId];
  }

  const command = ["pnpm", "tsx", "scripts/generation/run_notes_workflow.ts", "run-batch", "--workflow", workflow, "--batch", batchId];
  if (mode === "preview") {
    command.push("--dry-run", "--no-import");
    if (artifactRunId) {
      command.push("--artifact-run-id", artifactRunId);
    }
  }
  return command;
}

function launchDetachedWorkerProcess({
  workerRoot,
  logsDir,
  workerId,
  batchId,
  mode,
  command,
}: {
  workerRoot: string;
  logsDir: string;
  workerId: string;
  batchId: string;
  mode: ConductorAssignmentMode;
  command: string[];
}) {
  fsSync.mkdirSync(logsDir, { recursive: true });
  const logPath = path.join(logsDir, `${workerId}-${batchId}-${mode}.log`);
  const fd = fsSync.openSync(logPath, "a");
  try {
    const child = spawn(command[0], command.slice(1), {
      cwd: workerRoot,
      detached: true,
      stdio: ["ignore", fd, fd],
    });
    child.unref();
    return {
      pid: child.pid ?? null,
      logPath,
    };
  } finally {
    fsSync.closeSync(fd);
  }
}

async function maybeLoadWorkerResult({
  workerRoot,
  workflowManifest,
  batchId,
  mode,
  artifactRunId,
  launchedAt,
}: {
  workerRoot: string;
  workflowManifest: Awaited<ReturnType<typeof loadWorkflowManifest>>["manifest"];
  batchId: string;
  mode: ConductorAssignmentMode;
  artifactRunId?: string | null;
  launchedAt: string;
}) {
  const resultPath = resolveBatchResultArtifactPath({
    repoRoot: workerRoot,
    manifest: workflowManifest,
    batchId,
    artifactNamespace: mode === "preview" ? "dry_run" : "live",
    artifactRunId: mode === "preview" ? artifactRunId ?? null : null,
  });

  try {
    const raw = await fs.readFile(resultPath, "utf8");
    const parsed = batchAttemptResultSchema.parse(JSON.parse(raw));
    if (Date.parse(parsed.completedAt) < Date.parse(launchedAt)) {
      return null;
    }
    return { resultPath, result: parsed };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function maybeRepairWorker({
  repoRoot,
  registryPath,
  workerId,
}: {
  repoRoot: string;
  registryPath: string | null;
  workerId: string;
}) {
  if (!registryPath) {
    return false;
  }
  const repaired = await repairUnhealthyWorkerWorktrees({
    repoRoot,
    registryPath,
    workerIds: [workerId],
    executeRemediation: true,
  });
  return repaired.repaired.some((entry) => entry.startsWith(`${workerId}:`));
}

export async function reconcileLedgerForResume({
  repoRoot,
  manifest,
  workflowRef,
  ledger,
}: {
  repoRoot: string;
  manifest: Awaited<ReturnType<typeof loadWorkflowManifest>>["manifest"];
  workflowRef: string;
  ledger: OrchestrationLedger;
}) {
  const paths = resolveOrchestrationPaths(repoRoot, manifest.workflowId);

  for (const worker of ledger.workers) {
    if (worker.currentProcess && !worker.currentBatchId) {
      worker.lastError = "Cleared orphaned process metadata during resume reconciliation.";
      worker.currentProcess = null;
      continue;
    }

    if (!worker.currentBatchId || worker.currentProcess) {
      continue;
    }

    const batchId = worker.currentBatchId;
    const batch = ledger.batches[batchId];
    if (!batch) {
      worker.currentBatchId = null;
      worker.lastError = `Cleared missing batch assignment ${batchId} during resume reconciliation.`;
      continue;
    }

    if (worker.role === "preview") {
      requeuePreviewBatch({
        ledger,
        workerId: worker.workerId,
        batchId,
        error: "Recovered preview batch with missing process metadata during resume.",
      });
      continue;
    }

    const command = buildWorkerCommand({
      workflow: workflowRef,
      batchId,
      mode: "resume",
    });
    const launch = launchDetachedWorkerProcess({
      workerRoot: worker.worktreePath,
      logsDir: paths.logsDir,
      workerId: worker.workerId,
      batchId,
      mode: "resume",
      command,
    });
    attachWorkerProcess({
      ledger,
      workerId: worker.workerId,
      pid: launch.pid,
      mode: "resume",
      command,
      logPath: launch.logPath,
      resumeCount: 1,
    });
  }

  const liveLockBatchId = ledger.liveLaneLock.batchId;
  if (!liveLockBatchId) {
    return;
  }

  const liveWorker = ledger.workers.find((worker) => worker.role === "live");
  const liveBatch = ledger.batches[liveLockBatchId];
  const lockIsConsistent = Boolean(
    liveWorker
      && liveWorker.workerId === ledger.liveLaneLock.workerId
      && liveWorker.currentBatchId === liveLockBatchId
      && liveBatch
      && liveBatch.status === "live_running",
  );

  if (!lockIsConsistent) {
    ledger.liveLaneLock = {
      workerId: null,
      batchId: null,
      acquiredAt: null,
    };
  }
}

async function processRunningAssignments({
  repoRoot,
  manifest,
  workflowRef,
  ledger,
  requeueLimit,
  continueOnFailure,
}: {
  repoRoot: string;
  manifest: Awaited<ReturnType<typeof loadWorkflowManifest>>["manifest"];
  workflowRef: string;
  ledger: OrchestrationLedger;
  requeueLimit: number;
  continueOnFailure: boolean;
}) {
  for (const worker of ledger.workers) {
    if (!worker.currentBatchId || !worker.currentProcess) {
      continue;
    }

    const batchId = worker.currentBatchId;
    const result = await maybeLoadWorkerResult({
      workerRoot: worker.worktreePath,
      workflowManifest: manifest,
      batchId,
      mode: worker.currentProcess.mode,
      artifactRunId: worker.currentProcess.artifactRunId,
      launchedAt: worker.currentProcess.startedAt,
    });

    if (result) {
      if (worker.role === "preview") {
        applyPreviewResult({
          ledger,
          workerId: worker.workerId,
          batchId,
          result: result.result,
          resultPath: result.resultPath,
        });
      } else {
        applyLiveResult({
          ledger,
          workerId: worker.workerId,
          batchId,
          result: result.result,
          resultPath: result.resultPath,
        });
      }
      continue;
    }

    if (await isTrackedWorkerProcessAlive({
      pid: worker.currentProcess.pid,
      command: worker.currentProcess.command,
      batchId,
    })) {
      touchWorkerProcess(ledger, worker.workerId);
      continue;
    }

    if (worker.role === "preview") {
      const batch = ledger.batches[batchId];
      if (batch.requeueCount < requeueLimit) {
        requeuePreviewBatch({
          ledger,
          workerId: worker.workerId,
          batchId,
          error: "Preview worker exited before writing a terminal result.",
        });
        continue;
      }

      batch.status = "failed";
      batch.lastError = "Preview worker exhausted requeue limit.";
      worker.currentBatchId = null;
      worker.currentProcess = null;
      worker.failureCount += 1;
      worker.lastError = batch.lastError;
      if (!continueOnFailure) {
        throw new Error(`${worker.workerId} failed preview batch ${batchId}`);
      }
      continue;
    }

    const resumeCount = worker.currentProcess.resumeCount ?? 0;
    if (resumeCount < 1) {
      const command = buildWorkerCommand({
        workflow: workflowRef,
        batchId,
        mode: "resume",
      });
      const launch = launchDetachedWorkerProcess({
        workerRoot: worker.worktreePath,
        logsDir: resolveOrchestrationPaths(repoRoot, manifest.workflowId).logsDir,
        workerId: worker.workerId,
        batchId,
        mode: "resume",
        command,
      });
      attachWorkerProcess({
        ledger,
        workerId: worker.workerId,
        pid: launch.pid,
        mode: "resume",
        command,
        logPath: launch.logPath,
        resumeCount: resumeCount + 1,
      });
      continue;
    }

    const repaired = await maybeRepairWorker({
      repoRoot,
      registryPath: ledger.worktreeRegistryPath,
      workerId: worker.workerId,
    });
    if (repaired) {
      markWorkerHealth({ ledger, workerId: worker.workerId, health: "healthy", error: null });
      const command = buildWorkerCommand({
        workflow: workflowRef,
        batchId,
        mode: "resume",
      });
      const launch = launchDetachedWorkerProcess({
        workerRoot: worker.worktreePath,
        logsDir: resolveOrchestrationPaths(repoRoot, manifest.workflowId).logsDir,
        workerId: worker.workerId,
        batchId,
        mode: "resume",
        command,
      });
      attachWorkerProcess({
        ledger,
        workerId: worker.workerId,
        pid: launch.pid,
        mode: "resume",
        command,
        logPath: launch.logPath,
        resumeCount: resumeCount + 1,
      });
      continue;
    }

    markWorkerHealth({
      ledger,
      workerId: worker.workerId,
      health: "unhealthy",
      error: "Live worker exited and resume/rebuild recovery failed.",
    });
    failLiveBatch({
      ledger,
      workerId: worker.workerId,
      batchId,
      error: "Live worker exited and resume/rebuild recovery failed.",
    });
    if (!continueOnFailure) {
      throw new Error(`${worker.workerId} failed live batch ${batchId}`);
    }
  }
}

async function launchAvailableAssignments({
  repoRoot,
  manifest,
  workflowRef,
  ledger,
  maxPreviewLanes,
}: {
  repoRoot: string;
  manifest: Awaited<ReturnType<typeof loadWorkflowManifest>>["manifest"];
  workflowRef: string;
  ledger: OrchestrationLedger;
  maxPreviewLanes: number;
}) {
  const paths = resolveOrchestrationPaths(repoRoot, manifest.workflowId);

  const liveWorker = ledger.workers.find((worker) => worker.role === "live");
  if (liveWorker && !liveWorker.currentBatchId && !ledger.liveLaneLock.batchId) {
    const batchId = claimLivePromotion(ledger, liveWorker.workerId);
    if (batchId) {
      const command = buildWorkerCommand({
        workflow: workflowRef,
        batchId,
        mode: "live",
      });
      const launch = launchDetachedWorkerProcess({
        workerRoot: liveWorker.worktreePath,
        logsDir: paths.logsDir,
        workerId: liveWorker.workerId,
        batchId,
        mode: "live",
        command,
      });
      attachWorkerProcess({
        ledger,
        workerId: liveWorker.workerId,
        pid: launch.pid,
        mode: "live",
        command,
        logPath: launch.logPath,
      });
    }
  }

  const previewWorkers = ledger.workers.filter((worker) => worker.role === "preview").slice(0, maxPreviewLanes);
  for (const worker of previewWorkers) {
    if (worker.currentBatchId || worker.health !== "healthy") {
      continue;
    }

    const batchId = claimPreviewBatch(ledger, worker.workerId);
    if (!batchId) {
      continue;
    }

    const artifactRunId = `${worker.workerId}-${batchId}-${Date.now()}`;
    const command = buildWorkerCommand({
      workflow: workflowRef,
      batchId,
      mode: "preview",
      artifactRunId,
    });
    const launch = launchDetachedWorkerProcess({
      workerRoot: worker.worktreePath,
      logsDir: paths.logsDir,
      workerId: worker.workerId,
      batchId,
      mode: "preview",
      command,
    });
    attachWorkerProcess({
      ledger,
      workerId: worker.workerId,
      pid: launch.pid,
      mode: "preview",
      command,
      logPath: launch.logPath,
      artifactRunId,
    });
  }
}

function hasOutstandingWork(ledger: OrchestrationLedger) {
  return ledger.batchOrder.some((batchId) => {
    const batch = ledger.batches[batchId];
    return isRetryableFailedBatch(batch)
      || (
        batch.status !== "blocked"
        && batch.status !== "completed"
        && batch.status !== "saturated"
        && batch.status !== "failed"
      );
  });
}

async function runConductorLoop({
  command,
  resumeOnly = false,
}: {
  command: RunCommand | ResumeCommand;
  resumeOnly?: boolean;
}) {
  const { repoRoot, manifest, manifestPath } = await loadWorkflowManifest(command.workflow);
  const paths = resolveOrchestrationPaths(repoRoot, manifest.workflowId);
  let ledger = await loadLedger(paths.ledgerPath);

  if (!resumeOnly && command.name === "run" && command.forceFresh) {
    const batchOrder = command.from && command.to
      ? manifest.batches
        .map((batch) => batch.batchId)
        .slice(manifest.batches.findIndex((batch) => batch.batchId === command.from), manifest.batches.findIndex((batch) => batch.batchId === command.to) + 1)
      : ledger.batchOrder;
    ledger = await loadOrInitializeLedger({
      repoRoot,
      manifest,
      workflowRef: command.workflow,
      manifestPath,
      frozenBaseRef: ledger.frozenBaseRef,
      frozenBaseCommit: ledger.frozenBaseCommit,
      worktreeRegistryPath: ledger.worktreeRegistryPath,
      batchOrder,
      workers: ledger.workers.map((worker) => ({
        workerId: worker.workerId,
        role: worker.role,
        worktreePath: worker.worktreePath,
        expectedCommit: worker.expectedCommit,
      })),
      forceFresh: true,
    });
  }

  if (resumeOnly) {
    await reconcileLedgerForResume({
      repoRoot,
      manifest,
      workflowRef: command.workflow,
      ledger,
    });
    ledger = await saveLedger(paths.ledgerPath, ledger);
    await writeOrchestrationDashboard({ repoRoot, manifest, ledger });
  }

  while (hasOutstandingWork(ledger)) {
    await processRunningAssignments({
      repoRoot,
      manifest,
      workflowRef: command.workflow,
      ledger,
      requeueLimit: command.requeueLimit,
      continueOnFailure: command.continueOnFailure,
    });
    await launchAvailableAssignments({
      repoRoot,
      manifest,
      workflowRef: command.workflow,
      ledger,
      maxPreviewLanes: command.maxPreviewLanes,
    });
    ledger = await saveLedger(paths.ledgerPath, ledger);
    await writeOrchestrationDashboard({ repoRoot, manifest, ledger });
    await sleep(command.pollMs);
  }

  ledger = await saveLedger(paths.ledgerPath, ledger);
  await writeOrchestrationDashboard({ repoRoot, manifest, ledger });
  return {
    ok: finalizeLedgerStatus(ledger) !== "failed",
    workflowId: manifest.workflowId,
    ledgerPath: paths.ledgerPath,
    dashboardJsonPath: paths.dashboardJsonPath,
    dashboardMdPath: paths.dashboardMdPath,
    status: finalizeLedgerStatus(ledger),
    progress: ledger.progress,
  };
}

async function statusCommand(workflow: string) {
  const { repoRoot, manifest } = await loadWorkflowManifest(workflow);
  const paths = resolveOrchestrationPaths(repoRoot, manifest.workflowId);
  const ledger = await loadLedger(paths.ledgerPath);
  const dashboard = await writeOrchestrationDashboard({ repoRoot, manifest, ledger });
  return {
    ok: true,
    workflowId: manifest.workflowId,
    ledgerPath: paths.ledgerPath,
    dashboardJsonPath: dashboard.jsonPath,
    dashboardMdPath: dashboard.mdPath,
    status: ledger.status,
    progress: ledger.progress,
  };
}

async function main() {
  const command = parseArgs(process.argv.slice(2));

  if (command.name === "bootstrap") {
    console.log(JSON.stringify(await bootstrapConductor(command), null, 2));
    return;
  }

  if (command.name === "run") {
    console.log(JSON.stringify(await runConductorLoop({ command }), null, 2));
    return;
  }

  if (command.name === "resume") {
    console.log(JSON.stringify(await runConductorLoop({ command, resumeOnly: true }), null, 2));
    return;
  }

  console.log(JSON.stringify(await statusCommand(command.workflow), null, 2));
}

const isDirectExecution = Boolean(process.argv[1]) && /run_multi_worktree_conductor\.(ts|js)$/.test(process.argv[1]!);

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
