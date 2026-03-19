import { describe, expect, it } from "vitest";

import { loadWorkflowManifest } from "../scripts/generation/lib/manifest";
import { createInitialBatchState } from "../scripts/generation/lib/state";

describe("workflow manifest", () => {
  it("loads the notes workflow manifest with expected defaults", async () => {
    const { repoRoot, manifest } = await loadWorkflowManifest("cah-notes-mega-2026-03-16", process.cwd());

    expect(repoRoot).toBe(process.cwd());
    expect(manifest.workflowId).toBe("cah-notes-mega-2026-03-16");
    expect(manifest.evidenceMode).toBe("strict_internal");
    expect(manifest.defaultStrictness).toBe("strict_internal");
    expect(manifest.workerLanes.semanticOriginalityAudit).toBe(true);
    expect(manifest.workerLanes.reviewPackSynthesis).toBe(true);
    expect(manifest.batches).toHaveLength(87);
    expect(manifest.batches.slice(0, 6).map((batch) => batch.batchId)).toEqual(["B01", "B02", "B03", "B04", "B05", "B06"]);
  });

  it("supports the expanded workflow plan with B07 terminalized and later batches still pending", async () => {
    const { manifest } = await loadWorkflowManifest("cah-notes-mega-2026-03-16", process.cwd());
    const b07 = manifest.batches.find((batch) => batch.batchId === "B07");
    const b11 = manifest.batches.find((batch) => batch.batchId === "B11");
    const b87 = manifest.batches.find((batch) => batch.batchId === "B87");

    expect(b07?.status).toBe("saturated");
    expect(b07?.acceptedCountHint).toBeUndefined();
    expect(b07?.frozenReason).toBe("max_attempts_reached");
    expect(b11?.status).toBe("pending");
    expect(b11?.acceptedCountHint).toBeUndefined();
    expect(b11?.frozenReason).toBeUndefined();
    expect(b87?.status).toBe("pending");
    expect(b87?.acceptedCountHint).toBeUndefined();
    expect(b87?.frozenReason).toBeUndefined();
  });

  it("creates an initial batch state for B06 that matches the manifest status", async () => {
    const { repoRoot, manifest } = await loadWorkflowManifest("cah-notes-mega-2026-03-16", process.cwd());
    const batch = manifest.batches.find((entry) => entry.batchId === "B06");
    expect(batch).toBeTruthy();

    const state = createInitialBatchState({
      repoRoot,
      manifest,
      batch: batch!,
    });

    expect(state.status).toBe(batch!.status === "pending" ? "pending" : batch!.status);
    expect(state.acceptedTotal).toBe(batch!.acceptedCountHint ?? 0);
    expect(state.remaining).toBe(batch!.targetCount - (batch!.acceptedCountHint ?? 0));
    expect(state.nextAction).toBe(batch!.status === "saturated" ? "no_action_saturated" : "run_initial_generation");
  });
});
