import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { reconcileLedgerForResume } from "../scripts/generation/run_multi_worktree_conductor";
import { loadWorkflowManifest } from "../scripts/generation/lib/manifest";
import {
  applyLiveResult,
  applyPreviewResult,
  claimLivePromotion,
  claimPreviewBatch,
  deriveNextPreviewWindow,
  finalizeLedgerStatus,
  isRetryableFailedBatch,
  loadLedger,
  loadOrInitializeLedger,
  rankPreviewCandidates,
  saveLedger,
} from "../scripts/generation/lib/multi-worktree-orchestration";
import { computeNextWorkerIds, loadWorktreeRegistry } from "../scripts/generation/lib/worker-worktree-utils";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
});

describe("workflow conductor", () => {
  it("initializes a 4-worker ledger with 1 live lane and 3 preview lanes", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-conductor-ledger-"));
    tempDirs.push(tempDir);
    const { manifest, manifestPath } = await loadWorkflowManifest("cah-notes-mega-2026-03-16", process.cwd());

    const batchOrder = manifest.batches.filter((batch) => batch.status === "pending").slice(0, 4).map((batch) => batch.batchId);
    const ledger = await loadOrInitializeLedger({
      repoRoot: tempDir,
      manifest,
      workflowRef: "cah-notes-mega-2026-03-16",
      manifestPath,
      frozenBaseRef: "codex/test-ref",
      frozenBaseCommit: "deadbeef",
      batchOrder,
      workers: [
        { workerId: "worker-live-01", role: "live", worktreePath: "/tmp/live", expectedCommit: "deadbeef" },
        { workerId: "worker-preview-01", role: "preview", worktreePath: "/tmp/p1", expectedCommit: "deadbeef" },
        { workerId: "worker-preview-02", role: "preview", worktreePath: "/tmp/p2", expectedCommit: "deadbeef" },
        { workerId: "worker-preview-03", role: "preview", worktreePath: "/tmp/p3", expectedCommit: "deadbeef" },
      ],
      forceFresh: true,
    });

    expect(ledger.workers).toHaveLength(4);
    expect(ledger.workers.filter((worker) => worker.role === "live")).toHaveLength(1);
    expect(ledger.workers.filter((worker) => worker.role === "preview")).toHaveLength(3);
    expect(ledger.batchOrder).toEqual(batchOrder);
    expect(ledger.currentPreviewWindow).toEqual(batchOrder);
  });

  it("fills preview lanes without duplicate assignment and keeps work inside the next-4 window", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-conductor-preview-"));
    tempDirs.push(tempDir);
    const { manifest, manifestPath } = await loadWorkflowManifest("cah-notes-mega-2026-03-16", process.cwd());
    const batchOrder = manifest.batches.filter((batch) => batch.status === "pending").slice(0, 6).map((batch) => batch.batchId);
    const ledger = await loadOrInitializeLedger({
      repoRoot: tempDir,
      manifest,
      workflowRef: "cah-notes-mega-2026-03-16",
      manifestPath,
      frozenBaseRef: "codex/test-ref",
      frozenBaseCommit: "deadbeef",
      batchOrder,
      workers: [
        { workerId: "worker-live-01", role: "live", worktreePath: "/tmp/live", expectedCommit: "deadbeef" },
        { workerId: "worker-preview-01", role: "preview", worktreePath: "/tmp/p1", expectedCommit: "deadbeef" },
        { workerId: "worker-preview-02", role: "preview", worktreePath: "/tmp/p2", expectedCommit: "deadbeef" },
        { workerId: "worker-preview-03", role: "preview", worktreePath: "/tmp/p3", expectedCommit: "deadbeef" },
      ],
      forceFresh: true,
    });

    const assigned = [
      claimPreviewBatch(ledger, "worker-preview-01"),
      claimPreviewBatch(ledger, "worker-preview-02"),
      claimPreviewBatch(ledger, "worker-preview-03"),
    ];

    expect(assigned.every((batchId) => typeof batchId === "string")).toBe(true);
    expect(new Set(assigned).size).toBe(3);
    expect(Object.values(ledger.batches).filter((batch) => batch.status === "preview_running")).toHaveLength(3);
  });

  it("prioritizes a retryable failed batch ahead of the normal preview window", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-conductor-failed-first-"));
    tempDirs.push(tempDir);
    const { manifest, manifestPath } = await loadWorkflowManifest("cah-notes-mega-2026-03-16", process.cwd());
    const batchOrder = manifest.batches.filter((batch) => batch.status === "pending").map((batch) => batch.batchId);
    const ledger = await loadOrInitializeLedger({
      repoRoot: tempDir,
      manifest,
      workflowRef: "cah-notes-mega-2026-03-16",
      manifestPath,
      frozenBaseRef: "codex/test-ref",
      frozenBaseCommit: "deadbeef",
      batchOrder,
      workers: [
        { workerId: "worker-live-01", role: "live", worktreePath: "/tmp/live", expectedCommit: "deadbeef" },
        { workerId: "worker-preview-01", role: "preview", worktreePath: "/tmp/p1", expectedCommit: "deadbeef" },
        { workerId: "worker-preview-02", role: "preview", worktreePath: "/tmp/p2", expectedCommit: "deadbeef" },
        { workerId: "worker-preview-03", role: "preview", worktreePath: "/tmp/p3", expectedCommit: "deadbeef" },
      ],
      forceFresh: true,
    });

    ledger.batches.B13.status = "failed";
    ledger.batches.B13.lastError = "Can't reach database server at `localhost:5432`";
    ledger.batches.B13.requeueCount = 0;
    ledger.currentPreviewWindow = ["B83", "B84", "B85", "B86"];

    expect(isRetryableFailedBatch(ledger.batches.B13)).toBe(true);
    expect(finalizeLedgerStatus(ledger)).toBe("running");

    const claimed = claimPreviewBatch(ledger, "worker-preview-01");

    expect(claimed).toBe("B13");
    expect(ledger.batches.B13.status).toBe("preview_running");
    expect(ledger.batches.B13.requeueCount).toBe(1);
    expect(ledger.workers[1]!.currentBatchId).toBe("B13");

    ledger.batches.B13.status = "failed";
    ledger.batches.B13.assignedWorkerId = null;
    ledger.workers[1]!.currentBatchId = null;

    expect(isRetryableFailedBatch(ledger.batches.B13)).toBe(false);

    const nextClaimed = claimPreviewBatch(ledger, "worker-preview-02");
    expect(nextClaimed).not.toBe("B13");
  });

  it("treats transient codex startup failures as retryable exactly once", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-conductor-retryable-errors-"));
    tempDirs.push(tempDir);
    const { manifest, manifestPath } = await loadWorkflowManifest("cah-notes-mega-2026-03-16", process.cwd());
    const batchOrder = manifest.batches.filter((batch) => batch.status === "pending").map((batch) => batch.batchId);
    const ledger = await loadOrInitializeLedger({
      repoRoot: tempDir,
      manifest,
      workflowRef: "cah-notes-mega-2026-03-16",
      manifestPath,
      frozenBaseRef: "codex/test-ref",
      frozenBaseCommit: "deadbeef",
      batchOrder,
      workers: [
        { workerId: "worker-live-01", role: "live", worktreePath: "/tmp/live", expectedCommit: "deadbeef" },
        { workerId: "worker-preview-01", role: "preview", worktreePath: "/tmp/p1", expectedCommit: "deadbeef" },
        { workerId: "worker-preview-02", role: "preview", worktreePath: "/tmp/p2", expectedCommit: "deadbeef" },
        { workerId: "worker-preview-03", role: "preview", worktreePath: "/tmp/p3", expectedCommit: "deadbeef" },
      ],
      forceFresh: true,
    });

    ledger.batches.B60.status = "failed";
    ledger.batches.B60.lastError = "codex exited with code 1: startup websocket prewarm setup failed: You've hit your usage limit.";
    ledger.batches.B60.requeueCount = 0;
    expect(isRetryableFailedBatch(ledger.batches.B60)).toBe(true);

    ledger.batches.B60.requeueCount = 1;
    expect(isRetryableFailedBatch(ledger.batches.B60)).toBe(false);
  });

  it("promotes the best previewed candidate from the next rolling window of 4", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-conductor-promotion-"));
    tempDirs.push(tempDir);
    const { manifest, manifestPath } = await loadWorkflowManifest("cah-notes-mega-2026-03-16", process.cwd());
    const batchOrder = manifest.batches.filter((batch) => batch.status === "pending").slice(0, 6).map((batch) => batch.batchId);
    const ledger = await loadOrInitializeLedger({
      repoRoot: tempDir,
      manifest,
      workflowRef: "cah-notes-mega-2026-03-16",
      manifestPath,
      frozenBaseRef: "codex/test-ref",
      frozenBaseCommit: "deadbeef",
      batchOrder,
      workers: [
        { workerId: "worker-live-01", role: "live", worktreePath: "/tmp/live", expectedCommit: "deadbeef" },
        { workerId: "worker-preview-01", role: "preview", worktreePath: "/tmp/p1", expectedCommit: "deadbeef" },
        { workerId: "worker-preview-02", role: "preview", worktreePath: "/tmp/p2", expectedCommit: "deadbeef" },
        { workerId: "worker-preview-03", role: "preview", worktreePath: "/tmp/p3", expectedCommit: "deadbeef" },
      ],
      forceFresh: true,
    });

    const [b07, b08, b09] = batchOrder;
    for (const [workerId, batchId] of [
      ["worker-preview-01", b07],
      ["worker-preview-02", b08],
      ["worker-preview-03", b09],
    ] as const) {
      claimPreviewBatch(ledger, workerId);
      applyPreviewResult({
        ledger,
        workerId,
        batchId,
        result: {
          workflowId: manifest.workflowId,
          batchId,
          attemptNumber: 1,
          terminalMode: "preview_completed",
          mode: "initial",
          importMode: "dry_run",
          startedAt: "2026-03-18T00:00:00.000Z",
          lastHeartbeatAt: "2026-03-18T00:01:00.000Z",
          completedAt: "2026-03-18T00:02:00.000Z",
          acceptedCount: batchId === b08 ? 8 : batchId === b07 ? 7 : 6,
          rejectedCount: 0,
          remaining: batchId === b08 ? 2 : batchId === b07 ? 3 : 4,
          acceptedTotal: batchId === b08 ? 8 : batchId === b07 ? 7 : 6,
          rejectedTotal: 0,
          saturationReason: null,
          projectedAcceptanceSummary: {
            acceptedTotalProjected: batchId === b08 ? 8 : batchId === b07 ? 7 : 6,
            rejectedTotalProjected: 0,
            remainingProjected: batchId === b08 ? 2 : batchId === b07 ? 3 : 4,
          },
          artifactPaths: {
            rawOutputPath: `/tmp/${batchId}.generated.json`,
            draftOutputPath: `/tmp/${batchId}.draft.txt`,
            repairOutputPath: `/tmp/${batchId}.repair.json`,
            sourcePackPath: `/tmp/${batchId}.source-pack.json`,
            promptPath: `/tmp/${batchId}.prompt.md`,
            overlapReportPath: `/tmp/${batchId}.overlap.json`,
            semanticOverlapReportPath: `/tmp/${batchId}.semantic.json`,
            validationReportPath: `/tmp/${batchId}.validation.json`,
            australianVerificationReportPath: `/tmp/${batchId}.verification.json`,
            mergedDecisionReportPath: `/tmp/${batchId}.merged.json`,
            importReportPath: `/tmp/${batchId}.import.json`,
            attemptResultPath: `/tmp/${batchId}.attempt-result.json`,
            batchResultPath: `/tmp/${batchId}.batch-result.json`,
            summaryPath: `/tmp/${batchId}.summary.md`,
          },
          phase: "finalizing",
        },
        resultPath: `/tmp/${batchId}.batch-result.json`,
      });
    }

    const ranked = rankPreviewCandidates(ledger, deriveNextPreviewWindow(ledger, 4));
    expect(ranked[0]?.batchId).toBe(b08);

    const promoted = claimLivePromotion(ledger, "worker-live-01");
    expect(promoted).toBe(b08);
    expect(ledger.liveLaneLock.batchId).toBe(b08);
    expect(ledger.batches[b08].status).toBe("live_running");
  });

  it("persists ledger state and can be reloaded for resume", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-conductor-resume-"));
    tempDirs.push(tempDir);
    const { manifest, manifestPath, repoRoot } = await loadWorkflowManifest("cah-notes-mega-2026-03-16", process.cwd());
    const batchOrder = manifest.batches.filter((batch) => batch.status === "pending").slice(0, 4).map((batch) => batch.batchId);
    const ledger = await loadOrInitializeLedger({
      repoRoot: tempDir,
      manifest,
      workflowRef: "cah-notes-mega-2026-03-16",
      manifestPath,
      frozenBaseRef: "codex/test-ref",
      frozenBaseCommit: "deadbeef",
      batchOrder,
      workers: [
        { workerId: "worker-live-01", role: "live", worktreePath: "/tmp/live", expectedCommit: "deadbeef" },
        { workerId: "worker-preview-01", role: "preview", worktreePath: "/tmp/p1", expectedCommit: "deadbeef" },
        { workerId: "worker-preview-02", role: "preview", worktreePath: "/tmp/p2", expectedCommit: "deadbeef" },
        { workerId: "worker-preview-03", role: "preview", worktreePath: "/tmp/p3", expectedCommit: "deadbeef" },
      ],
      forceFresh: true,
    });

    const batchId = batchOrder[0]!;
    ledger.batches[batchId].status = "completed";
    ledger.batches[batchId].acceptedTotal = 12;
    ledger.batches[batchId].remaining = 0;
    const ledgerPath = path.join(tempDir, "workflow", "orchestration", manifest.workflowId, "ledger.json");
    await saveLedger(ledgerPath, ledger);
    const reloaded = await loadLedger(ledgerPath);

    expect(reloaded.batches[batchId].status).toBe("completed");
    expect(reloaded.batches[batchId].acceptedTotal).toBe(12);
  });

  it("clears stale live locks and orphaned process metadata during resume reconciliation", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-conductor-reconcile-"));
    tempDirs.push(tempDir);
    const { manifest, manifestPath } = await loadWorkflowManifest("cah-notes-mega-2026-03-16", process.cwd());
    const batchOrder = manifest.batches.filter((batch) => batch.status === "pending").slice(0, 4).map((batch) => batch.batchId);
    const ledger = await loadOrInitializeLedger({
      repoRoot: tempDir,
      manifest,
      workflowRef: "cah-notes-mega-2026-03-16",
      manifestPath,
      frozenBaseRef: "codex/test-ref",
      frozenBaseCommit: "deadbeef",
      batchOrder,
      workers: [
        { workerId: "worker-live-01", role: "live", worktreePath: "/tmp/live", expectedCommit: "deadbeef" },
        { workerId: "worker-preview-01", role: "preview", worktreePath: "/tmp/p1", expectedCommit: "deadbeef" },
        { workerId: "worker-preview-02", role: "preview", worktreePath: "/tmp/p2", expectedCommit: "deadbeef" },
        { workerId: "worker-preview-03", role: "preview", worktreePath: "/tmp/p3", expectedCommit: "deadbeef" },
      ],
      forceFresh: true,
    });

    const [liveBatchId] = batchOrder;
    ledger.liveLaneLock = {
      workerId: "worker-live-01",
      batchId: liveBatchId!,
      acquiredAt: "2026-03-18T00:00:00.000Z",
    };
    ledger.batches[liveBatchId!].status = "live_running";
    ledger.workers[1]!.currentProcess = {
      pid: 12345,
      mode: "preview",
      command: ["pnpm", "tsx", "scripts/generation/run_notes_workflow.ts", "run-batch"],
      logPath: "/tmp/orphan.log",
      artifactRunId: null,
      startedAt: "2026-03-18T00:00:00.000Z",
      lastObservedAt: "2026-03-18T00:00:00.000Z",
      resumeCount: 0,
    };

    await reconcileLedgerForResume({
      repoRoot: tempDir,
      manifest,
      workflowRef: "cah-notes-mega-2026-03-16",
      ledger,
    });

    expect(ledger.liveLaneLock.batchId).toBeNull();
    expect(ledger.liveLaneLock.workerId).toBeNull();
    expect(ledger.workers[1]!.currentProcess).toBeNull();
  });

  it("supports worker registry parsing and worker ID allocation", async () => {
    const registry = {
      version: 1,
      frozenRef: "main",
      frozenCommit: "deadbeef",
      createdAt: "2026-03-18T00:00:00.000Z",
      workers: [
        {
          workerId: "worker-01",
          path: "/tmp/workers/worker-01",
          frozenRef: "main",
          frozenCommit: "deadbeef",
          baseCommit: "deadbeef",
          registryCreatedAt: "2026-03-18T00:00:00.000Z",
          host: "darwin",
        },
        {
          workerId: "worker-03",
          path: "/tmp/workers/worker-03",
          frozenRef: "main",
          frozenCommit: "deadbeef",
          baseCommit: "deadbeef",
          registryCreatedAt: "2026-03-18T00:00:00.000Z",
          host: "darwin",
        },
      ],
    };
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-registry-"));
    tempDirs.push(tempDir);
    const registryPath = path.join(tempDir, "worker-worktree-registry.json");
    await fs.writeFile(registryPath, JSON.stringify(registry, null, 2), "utf8");

    const loaded = await loadWorktreeRegistry(registryPath);
    expect(loaded).toEqual(registry);
    expect(computeNextWorkerIds("worker", loaded?.workers ?? [], 3)).toEqual(["worker-02", "worker-04", "worker-05"]);
  });
});
