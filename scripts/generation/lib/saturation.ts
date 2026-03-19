import type { BatchState, WorkflowBatch, WorkflowManifest } from "./contracts";

export type SaturationDecision = {
  status: "completed" | "saturated" | "retry";
  reason: string | null;
};

type AttemptHistoryLike = BatchState["attemptHistory"][number];

export function getSaturationDecision({
  state,
  batch,
  manifest,
  latestAttempt,
}: {
  state: BatchState;
  batch: WorkflowBatch;
  manifest: WorkflowManifest;
  latestAttempt?: AttemptHistoryLike;
}): SaturationDecision {
  if (state.acceptedTotal >= batch.targetCount || state.remaining === 0) {
    return { status: "completed", reason: null };
  }

  if (state.attempts >= (batch.maxAttempts ?? manifest.retryPolicy.maxAttempts)) {
    return { status: "saturated", reason: "max_attempts_reached" };
  }

  const attemptHistory = latestAttempt ? [...state.attemptHistory, latestAttempt] : state.attemptHistory;
  const replacementHistory = attemptHistory.filter((entry) => entry.mode !== "initial");
  const lastReplacement = replacementHistory[replacementHistory.length - 1];

  if (
    lastReplacement &&
    lastReplacement.acceptedCount === 0 &&
    state.remaining <= manifest.saturationPolicy.freezeOnZeroAcceptedWhenRemainingAtMost
  ) {
    return { status: "saturated", reason: "zero_acceptance_with_small_remaining" };
  }

  const lowYieldThreshold = manifest.saturationPolicy.lowYieldAcceptedThreshold;
  const requiredConsecutive = manifest.saturationPolicy.freezeOnConsecutiveLowYieldRetries;
  const trailingReplacementHistory = replacementHistory.slice(-requiredConsecutive);
  if (
    trailingReplacementHistory.length === requiredConsecutive &&
    trailingReplacementHistory.every((entry) => entry.acceptedCount <= lowYieldThreshold)
  ) {
    return { status: "saturated", reason: "consecutive_low_yield_retries" };
  }

  return { status: "retry", reason: null };
}
