import fs from "node:fs/promises";
import path from "node:path";

import { reviewPackSchema, reviewPackSynthesisSchema, type BatchState, type ReviewPack, type ReviewPackSynthesis, type WorkflowManifest } from "./lib/contracts";
import { runCodexStructuredOutput } from "./lib/codex-runner";
import { sortBatchIds } from "./lib/manifest";
import { writeJsonArtifact } from "./lib/artifacts";

function styleMixSummary(manifest: WorkflowManifest, batchIds: string[]) {
  const counts = new Map<string, number>();
  for (const batchId of batchIds) {
    const batch = manifest.batches.find((entry) => entry.batchId === batchId);
    if (!batch) continue;
    counts.set(batch.styleMix, (counts.get(batch.styleMix) ?? 0) + 1);
  }
  return [...counts.entries()].map(([styleMix, count]) => `Style mix ${styleMix}: ${count} batch(es) in scope.`);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function buildReviewPack({
  manifest,
  states,
  batchIds,
}: {
  manifest: WorkflowManifest;
  states: BatchState[];
  batchIds: string[];
}): ReviewPack {
  const sortedBatchIds = sortBatchIds(batchIds);
  const relevantStates = states.filter((state) => sortedBatchIds.includes(state.batchId));
  const accepted = relevantStates.reduce((sum, state) => sum + state.acceptedTotal, 0);
  const target = relevantStates.reduce((sum, state) => {
    const batch = manifest.batches.find((entry) => entry.batchId === state.batchId);
    return sum + (batch?.targetCount ?? 0);
  }, 0);

  const pendingAfterRange = manifest.batches
    .filter((batch) => batch.status === "pending" && !sortedBatchIds.includes(batch.batchId))
    .map((batch) => batch.batchId)
    .slice(0, 5);

  return reviewPackSchema.parse({
    workflowId: manifest.workflowId,
    scope: sortedBatchIds.length === 1
      ? { batchId: sortedBatchIds[0] }
      : { fromBatchId: sortedBatchIds[0], toBatchId: sortedBatchIds[sortedBatchIds.length - 1] },
    generatedAt: new Date().toISOString(),
    acceptedTotals: { accepted, target },
    batchSummaries: relevantStates.map((state) => {
      const batch = manifest.batches.find((entry) => entry.batchId === state.batchId);
      return {
        batchId: state.batchId,
        status: state.status,
        acceptedTotal: state.acceptedTotal,
        targetCount: batch?.targetCount ?? state.acceptedTotal,
        remaining: state.remaining,
        saturationReason: state.saturationReason,
        overlapTraps: state.rejectedAngleFamilies.slice(0, 10),
      };
    }),
    coverageSummary: relevantStates.map((state) => {
      const batch = manifest.batches.find((entry) => entry.batchId === state.batchId);
      return `${state.batchId}: ${state.acceptedTotal}/${batch?.targetCount ?? "?"} accepted in ${batch?.topicCluster ?? "unknown scope"}.`;
    }),
    styleMixSummary: styleMixSummary(manifest, sortedBatchIds),
    overlapTrapSummary: Array.from(
      new Set(relevantStates.flatMap((state) => [...state.overlapWarnings, ...state.rejectedAngleFamilies])),
    ).slice(0, 20),
    verificationSummary: relevantStates.flatMap((state) =>
      state.evidenceSummary.externalFindingCount > 0
        ? [`${state.batchId}: ${state.evidenceSummary.externalFindingCount} verification finding(s).`]
        : []
    ),
    unresolvedExternalConflicts: relevantStates.flatMap((state) =>
      state.evidenceSummary.unresolvedConflictCount > 0
        ? [`${state.batchId}: ${state.evidenceSummary.unresolvedConflictCount} unresolved external conflict(s).`]
        : []
    ),
    recommendedImprovementPrompts: [
      `Same chat: review ${sortedBatchIds.join(", ")} for under-covered subtopics, originality traps, and prompt improvements without regenerating accepted items.`,
      `New chat: upload the review pack plus SOURCE_PRIORITY.md, OUTPUT_SPEC.md, and REJECTED_PATTERNS_SUMMARY.md, then ask for a final critique of coverage, originality risk, and better next-batch prompts.`,
    ],
    nextRecommendedBatches: pendingAfterRange,
    artifactPaths: relevantStates.flatMap((state) => [
      state.artifactPaths.statePath,
      state.artifactPaths.summaryPath ?? "",
    ]).filter(Boolean),
  });
}

export function mergeReviewPackSynthesis(reviewPack: ReviewPack, synthesis: ReviewPackSynthesis): ReviewPack {
  return reviewPackSchema.parse({
    ...reviewPack,
    coverageSummary: uniqueStrings([...reviewPack.coverageSummary, ...synthesis.coverageSummary]),
    overlapTrapSummary: uniqueStrings([...reviewPack.overlapTrapSummary, ...synthesis.overlapTrapSummary]),
    verificationSummary: uniqueStrings([...reviewPack.verificationSummary, ...synthesis.verificationSummary]),
    recommendedImprovementPrompts: uniqueStrings([
      ...reviewPack.recommendedImprovementPrompts,
      ...synthesis.recommendedImprovementPrompts,
    ]),
    nextRecommendedBatches: uniqueStrings([
      ...reviewPack.nextRecommendedBatches,
      ...synthesis.nextRecommendedBatches,
    ]).slice(0, 5),
  });
}

export function constrainReviewPackSynthesis(
  synthesis: ReviewPackSynthesis,
  allowedBatchIds: string[],
): ReviewPackSynthesis {
  const allowedBatchIdSet = new Set(allowedBatchIds);
  return reviewPackSynthesisSchema.parse({
    ...synthesis,
    nextRecommendedBatches: synthesis.nextRecommendedBatches.filter((batchId) => allowedBatchIdSet.has(batchId)),
  });
}

export async function writeReviewPackArtifacts({
  reviewPackPath,
  reviewPack,
  synthesis,
}: {
  reviewPackPath: string;
  reviewPack: ReviewPack;
  synthesis: ReviewPackSynthesis | null;
}) {
  await writeJsonArtifact(reviewPackPath, reviewPack);
  const synthesisPath = reviewPackPath.replace(/\.json$/, ".synthesis.json");
  if (synthesis) {
    await writeJsonArtifact(synthesisPath, synthesis);
    return;
  }
  await fs.rm(synthesisPath, { force: true });
}

export async function synthesizeReviewPack({
  repoRoot,
  manifest,
  reviewPack,
}: {
  repoRoot: string;
  manifest: WorkflowManifest;
  reviewPack: ReviewPack;
}): Promise<{ reviewPack: ReviewPack; synthesis: ReviewPackSynthesis | null }> {
  if (!manifest.workerLanes.reviewPackSynthesis) {
    return { reviewPack, synthesis: null };
  }

  const schemaPath = path.join(repoRoot, "schemas", "review-pack-synthesis.schema.json");
  const synthesisContext = {
    workflowId: reviewPack.workflowId,
    scope: reviewPack.scope,
    acceptedTotals: reviewPack.acceptedTotals,
    batchSummaries: reviewPack.batchSummaries.map((batch) => ({
      batchId: batch.batchId,
      status: batch.status,
      acceptedTotal: batch.acceptedTotal,
      targetCount: batch.targetCount,
      remaining: batch.remaining,
      saturationReason: batch.saturationReason,
      overlapTraps: batch.overlapTraps,
    })),
    coverageSummary: reviewPack.coverageSummary,
    overlapTrapSummary: reviewPack.overlapTrapSummary,
    verificationSummary: reviewPack.verificationSummary,
    nextRecommendedBatches: reviewPack.nextRecommendedBatches,
  };
  const prompt = [
    "You are improving a deterministic review pack for a notes-first paediatrics question-generation workflow.",
    "Add only concise, actionable synthesis.",
    "Do not invent new accepted counts or batch statuses.",
    "Focus on coverage gaps, overlap traps, verification themes, stronger improvement prompts, and next-batch prioritization.",
    `Workflow: ${manifest.workflowId}`,
    "Compact review-pack context JSON:",
    JSON.stringify(synthesisContext, null, 2),
    "",
    "Return exactly this JSON object shape:",
    JSON.stringify({
      coverageSummary: ["string"],
      overlapTrapSummary: ["string"],
      verificationSummary: ["string"],
      recommendedImprovementPrompts: ["string"],
      nextRecommendedBatches: ["B06"],
    }, null, 2),
  ].join("\n\n");

  try {
    const result = await runCodexStructuredOutput<ReviewPackSynthesis>({
      cwd: repoRoot,
      prompt,
      schemaPath,
      timeoutMs: 20_000,
    });
    const synthesis = constrainReviewPackSynthesis(
      reviewPackSynthesisSchema.parse(result.data),
      manifest.batches
        .filter((batch) => batch.status === "pending")
        .map((batch) => batch.batchId),
    );
    return {
      reviewPack: mergeReviewPackSynthesis(reviewPack, synthesis),
      synthesis,
    };
  } catch {
    return { reviewPack, synthesis: null };
  }
}
