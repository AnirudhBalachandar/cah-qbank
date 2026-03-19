import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadWorkflowManifest } from "../scripts/generation/lib/manifest";
import { writeOrchestrationDashboard } from "../scripts/generation/lib/dashboard";
import { loadOrInitializeLedger } from "../scripts/generation/lib/multi-worktree-orchestration";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
});

describe("conductor dashboard", () => {
  it("writes machine-readable and human-readable dashboard outputs from ledger state", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-dashboard-"));
    tempDirs.push(tempDir);
    const { manifest, manifestPath } = await loadWorkflowManifest("cah-notes-mega-2026-03-16", process.cwd());

    const ledger = await loadOrInitializeLedger({
      repoRoot: tempDir,
      manifest,
      workflowRef: "cah-notes-mega-2026-03-16",
      manifestPath,
      frozenBaseRef: "codex/test-ref",
      frozenBaseCommit: "deadbeef",
      batchOrder: manifest.batches.slice(6, 10).map((batch) => batch.batchId),
      workers: [
        { workerId: "worker-live-01", role: "live", worktreePath: "/tmp/live", expectedCommit: "deadbeef" },
        { workerId: "worker-preview-01", role: "preview", worktreePath: "/tmp/p1", expectedCommit: "deadbeef" },
        { workerId: "worker-preview-02", role: "preview", worktreePath: "/tmp/p2", expectedCommit: "deadbeef" },
        { workerId: "worker-preview-03", role: "preview", worktreePath: "/tmp/p3", expectedCommit: "deadbeef" },
      ],
      forceFresh: true,
    });

    ledger.batches[ledger.batchOrder[0]!].status = "preview_ready";
    ledger.batches[ledger.batchOrder[0]!].previewProjection = {
      workerId: "worker-preview-01",
      artifactRunId: "spec-check",
      terminalMode: "preview_completed",
      projectedAcceptedTotal: 9,
      projectedRejectedTotal: 3,
      projectedRemaining: 3,
      completedAt: "2026-03-18T12:00:00.000Z",
      resultPath: "/tmp/spec-check/batch-result.json",
      summaryPath: "/tmp/spec-check/summary.md",
    };

    const dashboard = await writeOrchestrationDashboard({
      repoRoot: tempDir,
      manifest,
      ledger,
    });

    const json = JSON.parse(await fs.readFile(dashboard.jsonPath, "utf8"));
    const markdown = await fs.readFile(dashboard.mdPath, "utf8");

    expect(json.workflowId).toBe(manifest.workflowId);
    expect(json.previewReadyCandidates[0].batchId).toBe(ledger.batchOrder[0]);
    expect(json.workerOccupancy).toHaveLength(4);
    expect(markdown).toContain(`# Orchestration Dashboard — ${manifest.workflowId}`);
    expect(markdown).toContain("## Worker Occupancy");
    expect(markdown).toContain("## Batch Status");
  });
});
