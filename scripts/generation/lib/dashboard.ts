import fs from "node:fs/promises";
import path from "node:path";

import type { WorkflowManifest } from "./contracts";
import {
  buildDashboardView,
  loadLedger,
  resolveOrchestrationPaths,
  type ConductorDashboardPayload,
  type OrchestrationLedger,
} from "./multi-worktree-orchestration";

function formatEta(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
    return "unavailable";
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${String(remainder).padStart(2, "0")}s`;
  }
  return `${seconds}s`;
}

export function formatDashboardMarkdown(payload: ConductorDashboardPayload) {
  const lines = [
    `# Orchestration Dashboard — ${payload.workflowId}`,
    `Generated: ${payload.generatedAt}`,
    "",
    "## Overview",
    `- Status: ${payload.status}`,
    `- Frozen base ref: ${payload.frozenBaseRef}`,
    `- Frozen base commit: ${payload.frozenBaseCommit}`,
    `- Overall progress: ${payload.overall.overallProgressPercent}% (${payload.overall.acceptedTotal}/${payload.overall.totalTarget})`,
    `- Live execution: ${payload.overall.liveExecutionPercent}%`,
    `- Completed: ${payload.overall.completedCount}`,
    `- Saturated: ${payload.overall.saturatedCount}`,
    `- Failed: ${payload.overall.failedCount}`,
    `- Preview-ready: ${payload.overall.previewReadyCount}`,
    `- Pending: ${payload.overall.pendingCount}`,
    `- Running: ${payload.overall.runningCount}`,
    `- Current live batch: ${payload.currentLiveBatch ?? "none"}`,
    `- Next likely promotion target: ${payload.nextLikelyPromotionTarget ?? "none"}`,
    "",
    "## Worker Occupancy",
  ];

  for (const worker of payload.workerOccupancy) {
    lines.push(
      `- ${worker.workerId} (${worker.role}): health=${worker.health}, batch=${worker.currentBatchId ?? "idle"}, mode=${worker.currentMode ?? "idle"}, pid=${worker.pid ?? "n/a"}, resumes=${worker.resumeCount}`,
    );
  }

  lines.push("", "## Preview-ready Candidates");
  if (payload.previewReadyCandidates.length === 0) {
    lines.push("- none");
  } else {
    for (const candidate of payload.previewReadyCandidates) {
      lines.push(
        `- ${candidate.batchId}: projectedAccepted=${candidate.projectedAcceptedTotal}, projectedRemaining=${candidate.projectedRemaining}, mode=${candidate.terminalMode}`,
      );
    }
  }

  lines.push("", "## Failure / Retry State");
  if (payload.failureRetryState.length === 0) {
    lines.push("- none");
  } else {
    for (const failure of payload.failureRetryState) {
      lines.push(
        `- ${failure.batchId}: status=${failure.status}, requeues=${failure.requeueCount}, error=${failure.lastError ?? "none"}, saturation=${failure.saturationReason ?? "none"}`,
      );
    }
  }

  lines.push("", "## Batch Status");
  for (const batch of payload.batchStatus) {
    lines.push(
      `- ${batch.batchId}: ${batch.status} | accepted=${batch.acceptedTotal}/${batch.targetCount} | remaining=${batch.remaining} | worker=${batch.assignedWorkerId ?? "none"} | eta=${formatEta(batch.etaSeconds)}`,
    );
  }

  return lines.join("\n");
}

export function buildOrchestrationPayload({ ledger }: { ledger: OrchestrationLedger }) {
  return buildDashboardView({ ledger });
}

export async function writeOrchestrationDashboard({
  repoRoot,
  manifest,
  ledger,
}: {
  repoRoot: string;
  manifest: WorkflowManifest;
  ledger?: OrchestrationLedger;
}) {
  const { dashboardJsonPath, dashboardMdPath, orchestrationDir } = resolveOrchestrationPaths(repoRoot, manifest.workflowId);
  await fs.mkdir(orchestrationDir, { recursive: true });

  const effectiveLedger = ledger ?? await loadLedger(resolveOrchestrationPaths(repoRoot, manifest.workflowId).ledgerPath);
  const payload = buildOrchestrationPayload({ ledger: effectiveLedger });
  const markdown = formatDashboardMarkdown(payload);

  await fs.writeFile(dashboardJsonPath, JSON.stringify(payload, null, 2), "utf8");
  await fs.writeFile(dashboardMdPath, markdown, "utf8");

  return {
    jsonPath: dashboardJsonPath,
    mdPath: dashboardMdPath,
    payload,
  };
}
