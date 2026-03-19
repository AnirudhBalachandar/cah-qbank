import { describe, expect, it } from "vitest";

import { buildReviewPack } from "../scripts/generation/build_review_pack";
import { loadWorkflowManifest } from "../scripts/generation/lib/manifest";
import { createInitialBatchState } from "../scripts/generation/lib/state";

describe("workflow review pack", () => {
  it("summarizes accepted counts and includes same-chat/new-chat improvement prompts", async () => {
    const { repoRoot, manifest } = await loadWorkflowManifest("cah-notes-mega-2026-03-16", process.cwd());
    const b05 = manifest.batches.find((entry) => entry.batchId === "B05")!;
    const b06 = manifest.batches.find((entry) => entry.batchId === "B06")!;

    const states = [
      {
        ...createInitialBatchState({ repoRoot, manifest, batch: b05 }),
        batchId: "B05",
        status: "saturated" as const,
        acceptedTotal: 7,
        remaining: 5,
        saturationReason: "manual_freeze_at_7_of_12_after_zero_yield_final_retry",
        rejectedAngleFamilies: ["adolescent-medicine | sleep | bidirectional | mental-health"],
      },
      {
        ...createInitialBatchState({ repoRoot, manifest, batch: b06 }),
        batchId: "B06",
        status: "pending" as const,
        acceptedTotal: 0,
        remaining: 12,
      },
    ];

    const reviewPack = buildReviewPack({
      manifest,
      states,
      batchIds: ["B05", "B06"],
    });

    expect(reviewPack.acceptedTotals).toEqual({ accepted: 7, target: 24 });
    expect(reviewPack.coverageSummary[0]).toContain("B05");
    expect(reviewPack.recommendedImprovementPrompts.some((entry) => entry.startsWith("Same chat:"))).toBe(true);
    expect(reviewPack.recommendedImprovementPrompts.some((entry) => entry.startsWith("New chat:"))).toBe(true);
    expect(reviewPack.nextRecommendedBatches).not.toContain("B06");
  });

  it("moves next-batch recommendations forward to the next pending batch once earlier batches are terminalized", async () => {
    const { repoRoot, manifest } = await loadWorkflowManifest("cah-notes-mega-2026-03-16", process.cwd());
    const extendedManifest = {
      ...manifest,
      batches: manifest.batches.map((batch) => {
        if (batch.batchId === "B05") return { ...batch, status: "completed" as const, acceptedCountHint: 12 };
        if (batch.batchId === "B06") return { ...batch, status: "saturated" as const, acceptedCountHint: 8 };
        return batch;
      }),
    };

    const states = [
      {
        ...createInitialBatchState({ repoRoot, manifest: extendedManifest, batch: extendedManifest.batches.find((entry) => entry.batchId === "B05")! }),
        batchId: "B05",
        status: "completed" as const,
        acceptedTotal: 12,
        remaining: 0,
      },
      {
        ...createInitialBatchState({ repoRoot, manifest: extendedManifest, batch: extendedManifest.batches.find((entry) => entry.batchId === "B06")! }),
        batchId: "B06",
        status: "saturated" as const,
        acceptedTotal: 8,
        remaining: 4,
        saturationReason: "manual_freeze_after_retry_stall",
      },
    ];

    const reviewPack = buildReviewPack({
      manifest: extendedManifest,
      states,
      batchIds: ["B05", "B06"],
    });

    expect(reviewPack.nextRecommendedBatches[0]).toBe("B11");
    expect(reviewPack.nextRecommendedBatches).not.toContain("B06");
  });
});
