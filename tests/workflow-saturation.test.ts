import { describe, expect, it } from "vitest";

import { getSaturationDecision } from "../scripts/generation/lib/saturation";
import { loadWorkflowManifest } from "../scripts/generation/lib/manifest";
import { createInitialBatchState } from "../scripts/generation/lib/state";

describe("workflow saturation policy", () => {
  it("marks a batch complete when accepted total reaches target", async () => {
    const { repoRoot, manifest } = await loadWorkflowManifest("cah-notes-mega-2026-03-16", process.cwd());
    const batch = manifest.batches.find((entry) => entry.batchId === "B06")!;
    const state = {
      ...createInitialBatchState({ repoRoot, manifest, batch }),
      acceptedTotal: 12,
      remaining: 0,
    };

    expect(getSaturationDecision({ state, batch, manifest })).toEqual({
      status: "completed",
      reason: null,
    });
  });

  it("saturates after a zero-acceptance retry with only a few items remaining", async () => {
    const { repoRoot, manifest } = await loadWorkflowManifest("cah-notes-mega-2026-03-16", process.cwd());
    const batch = manifest.batches.find((entry) => entry.batchId === "B06")!;
    const state = {
      ...createInitialBatchState({ repoRoot, manifest, batch }),
      attempts: 2,
      acceptedTotal: 8,
      remaining: 4,
      attemptHistory: [
        {
          attemptNumber: 1,
          mode: "initial" as const,
          acceptedCount: 8,
          rejectedCount: 4,
          remainingCount: 4,
          recordedAt: new Date().toISOString(),
        },
        {
          attemptNumber: 2,
          mode: "replacement" as const,
          acceptedCount: 0,
          rejectedCount: 4,
          remainingCount: 4,
          recordedAt: new Date().toISOString(),
        },
      ],
    };

    expect(getSaturationDecision({ state, batch, manifest })).toEqual({
      status: "saturated",
      reason: "zero_acceptance_with_small_remaining",
    });
  });

  it("saturates after consecutive low-yield replacement retries", async () => {
    const { repoRoot, manifest } = await loadWorkflowManifest("cah-notes-mega-2026-03-16", process.cwd());
    const batch = manifest.batches.find((entry) => entry.batchId === "B06")!;
    const state = {
      ...createInitialBatchState({ repoRoot, manifest, batch }),
      attempts: 3,
      acceptedTotal: 10,
      remaining: 2,
      attemptHistory: [
        {
          attemptNumber: 1,
          mode: "initial" as const,
          acceptedCount: 9,
          rejectedCount: 3,
          remainingCount: 3,
          recordedAt: new Date().toISOString(),
        },
        {
          attemptNumber: 2,
          mode: "replacement" as const,
          acceptedCount: 1,
          rejectedCount: 2,
          remainingCount: 2,
          recordedAt: new Date().toISOString(),
        },
        {
          attemptNumber: 3,
          mode: "replacement" as const,
          acceptedCount: 1,
          rejectedCount: 1,
          remainingCount: 1,
          recordedAt: new Date().toISOString(),
        },
      ],
    };

    expect(getSaturationDecision({ state, batch, manifest })).toEqual({
      status: "saturated",
      reason: "consecutive_low_yield_retries",
    });
  });

  it("considers the just-finished replacement attempt before another retry is launched", async () => {
    const { repoRoot, manifest } = await loadWorkflowManifest("cah-notes-mega-2026-03-16", process.cwd());
    const batch = manifest.batches.find((entry) => entry.batchId === "B06")!;
    const state = {
      ...createInitialBatchState({ repoRoot, manifest, batch }),
      attempts: 3,
      acceptedTotal: 10,
      remaining: 2,
      attemptHistory: [
        {
          attemptNumber: 1,
          mode: "initial" as const,
          acceptedCount: 8,
          rejectedCount: 4,
          remainingCount: 4,
          recordedAt: new Date().toISOString(),
        },
        {
          attemptNumber: 2,
          mode: "replacement" as const,
          acceptedCount: 2,
          rejectedCount: 2,
          remainingCount: 2,
          recordedAt: new Date().toISOString(),
        },
      ],
    };

    expect(getSaturationDecision({
      state,
      batch,
      manifest,
      latestAttempt: {
        attemptNumber: 3,
        mode: "replacement",
        acceptedCount: 0,
        rejectedCount: 2,
        remainingCount: 2,
        recordedAt: new Date().toISOString(),
      },
    })).toEqual({
      status: "saturated",
      reason: "zero_acceptance_with_small_remaining",
    });
  });
});
