import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { ReviewPack, ReviewPackSynthesis } from "../scripts/generation/lib/contracts";
import { constrainReviewPackSynthesis, writeReviewPackArtifacts } from "../scripts/generation/build_review_pack";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dirPath) => fs.rm(dirPath, { recursive: true, force: true })));
});

function sampleReviewPack(): ReviewPack {
  return {
    workflowId: "cah-notes-mega-2026-03-16",
    scope: { fromBatchId: "B01", toBatchId: "B06" },
    generatedAt: new Date().toISOString(),
    acceptedTotals: { accepted: 55, target: 72 },
    batchSummaries: [],
    coverageSummary: ["B06: 8/12 accepted in growth, puberty, and eating disorder foundations."],
    styleMixSummary: ["Style mix F: 1 batch(es) in scope."],
    overlapTrapSummary: ["Avoid cosmetic rewrites of Tanner staging discriminators."],
    verificationSummary: [],
    unresolvedExternalConflicts: [],
    recommendedImprovementPrompts: ["Same chat: critique remaining growth and puberty gaps."],
    nextRecommendedBatches: [],
    artifactPaths: [],
  };
}

describe("workflow review-pack artifact writing", () => {
  it("deletes a stale synthesis sidecar when synthesis is unavailable", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-review-pack-write-"));
    tempDirs.push(tempDir);

    const reviewPackPath = path.join(tempDir, "review-pack-B01-B06.json");
    const staleSynthesisPath = reviewPackPath.replace(/\.json$/, ".synthesis.json");
    await fs.writeFile(staleSynthesisPath, JSON.stringify({ stale: true }, null, 2), "utf8");

    await writeReviewPackArtifacts({
      reviewPackPath,
      reviewPack: sampleReviewPack(),
      synthesis: null,
    });

    expect(await fs.readFile(reviewPackPath, "utf8")).toContain("\"workflowId\"");
    await expect(fs.access(staleSynthesisPath)).rejects.toThrow();
  });

  it("filters synthesized next-batch recommendations to deterministic pending batches", () => {
    const constrained = constrainReviewPackSynthesis(
      {
        coverageSummary: ["B06 is saturated at 8/12 and should stay frozen."],
        overlapTrapSummary: [],
        verificationSummary: [],
        recommendedImprovementPrompts: ["New chat: critique saturation reasons only."],
        nextRecommendedBatches: ["B06", "B07"],
      } satisfies ReviewPackSynthesis,
      [],
    );

    expect(constrained.nextRecommendedBatches).toEqual([]);
  });

  it("writes a synthesis sidecar when synthesis is available", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-review-pack-write-"));
    tempDirs.push(tempDir);

    const reviewPackPath = path.join(tempDir, "review-pack-B01-B06.json");
    const synthesis: ReviewPackSynthesis = {
      coverageSummary: ["B07 should only be recommended if still pending."],
      overlapTrapSummary: [],
      verificationSummary: [],
      recommendedImprovementPrompts: ["Same chat: keep B06 frozen and review the next pending range."],
      nextRecommendedBatches: [],
    };

    await writeReviewPackArtifacts({
      reviewPackPath,
      reviewPack: sampleReviewPack(),
      synthesis,
    });

    const synthesisPath = reviewPackPath.replace(/\.json$/, ".synthesis.json");
    expect(await fs.readFile(synthesisPath, "utf8")).toContain("Same chat:");
  });
});
