import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadWorkflowManifest } from "../scripts/generation/lib/manifest";
import {
  applyPrelaunchBatchTerminalState,
  abandonBatchAttempt,
  beginBatchAttempt,
  createInitialBatchState,
  failBatchAttempt,
  isBatchActiveJobStale,
  loadBatchState,
  loadOrInitBatchState,
  touchBatchActiveJob,
} from "../scripts/generation/lib/state";

const tempDirs: string[] = [];

async function createTempRepoRoot() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cah-workflow-state-"));
  tempDirs.push(tempDir);
  return tempDir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
});

describe("workflow state helpers", () => {
  it("normalizes legacy state files with derived nextAttemptNumber", async () => {
    const tempRepoRoot = await createTempRepoRoot();
    const { manifest } = await loadWorkflowManifest("cah-notes-mega-2026-03-16", process.cwd());
    const batch = manifest.batches.find((entry) => entry.batchId === "B06");
    expect(batch).toBeTruthy();

    const initialState = createInitialBatchState({
      repoRoot: tempRepoRoot,
      manifest,
      batch: batch!,
    });

    await fs.mkdir(path.dirname(initialState.artifactPaths.statePath), { recursive: true });
    await fs.writeFile(
      initialState.artifactPaths.statePath,
      JSON.stringify({
        workflowId: manifest.workflowId,
        batchId: batch!.batchId,
        status: "failed",
        attempts: 1,
        acceptedTotal: 0,
        rejectedTotal: 2,
        remaining: batch!.targetCount,
        importedQuestionIds: [],
        acceptedAngleFamilies: [],
        rejectedAngleFamilies: ["sleep | dspd | counselling"],
        overlapWarnings: [],
        evidenceSummary: {
          evidenceMode: manifest.evidenceMode,
          strictness: manifest.defaultStrictness,
          externalFindingCount: 0,
          unresolvedConflictCount: 0,
        },
        lastAttempt: {
          attemptNumber: 2,
          mode: "replacement",
          rawOutputPath: "/tmp/attempt-02.generated.json",
          draftOutputPath: "/tmp/attempt-02.draft.txt",
          repairOutputPath: "/tmp/attempt-02.repair.json",
          sourcePackPath: "/tmp/attempt-02.source-pack.json",
          promptPath: "/tmp/attempt-02.prompt.md",
          overlapReportPath: "/tmp/attempt-02.overlap.json",
          validationReportPath: "/tmp/attempt-02.validation.json",
          australianVerificationReportPath: "/tmp/attempt-02.verification.json",
          mergedDecisionReportPath: "/tmp/attempt-02.merged.json",
          importReportPath: null,
          acceptedCount: 0,
          rejectedCount: 2,
          remainingCount: batch!.targetCount,
        },
        attemptHistory: [
          {
            attemptNumber: 1,
            mode: "initial",
            acceptedCount: 0,
            rejectedCount: 2,
            remainingCount: batch!.targetCount,
            recordedAt: "2026-03-18T00:00:00.000Z",
          },
          {
            attemptNumber: 2,
            mode: "replacement",
            acceptedCount: 0,
            rejectedCount: 2,
            remainingCount: batch!.targetCount,
            recordedAt: "2026-03-18T00:10:00.000Z",
          },
        ],
        artifactPaths: initialState.artifactPaths,
        saturationReason: null,
        nextAction: "retry_generation",
        updatedAt: "2026-03-18T00:10:00.000Z",
      }, null, 2),
      "utf8",
    );

    const loadedState = await loadBatchState(initialState.artifactPaths.statePath);

    expect(loadedState.nextAttemptNumber).toBe(3);
    expect(loadedState.currentAttempt).toBeNull();
    expect(loadedState.lastAttempt?.status).toBe("completed");
  });

  it("reserves unique attempt numbers and finalizes failed attempts cleanly", async () => {
    const tempRepoRoot = await createTempRepoRoot();
    const { manifest } = await loadWorkflowManifest("cah-notes-mega-2026-03-16", process.cwd());
    const batch = manifest.batches.find((entry) => entry.batchId === "B06");
    expect(batch).toBeTruthy();

    const initialState = createInitialBatchState({
      repoRoot: tempRepoRoot,
      manifest,
      batch: batch!,
    });

    const started = beginBatchAttempt({
      state: initialState,
      repoRoot: tempRepoRoot,
      manifest,
      batch: batch!,
      mode: "initial",
      phase: "draft_generation",
      logPath: path.join(tempRepoRoot, "logs", "B06-attempt-01.log"),
      jobId: "job-1",
      pid: 12345,
      now: "2026-03-18T01:00:00.000Z",
    });

    expect(started.attempts).toBe(1);
    expect(started.nextAttemptNumber).toBe(2);
    expect(started.activeJob?.attemptNumber).toBe(1);
    expect(started.currentAttempt?.status).toBe("running");

    const heartbeated = touchBatchActiveJob({
      state: started,
      jobId: "job-1",
      phase: "auditing",
      now: "2026-03-18T01:05:00.000Z",
    });

    expect(heartbeated.activeJob?.phase).toBe("auditing");
    expect(isBatchActiveJobStale({
      state: heartbeated,
      staleAfterMs: 60_000,
      now: Date.parse("2026-03-18T01:06:30.000Z"),
    })).toBe(true);

    const failed = failBatchAttempt({
      state: heartbeated,
      jobId: "job-1",
      phase: "auditing",
      rejectedCount: 3,
      remainingCount: batch!.targetCount,
      batchStatus: "failed",
      errorMessage: "Worker timeout",
      now: "2026-03-18T01:07:00.000Z",
    });

    expect(failed.activeJob).toBeNull();
    expect(failed.currentAttempt).toBeNull();
    expect(failed.lastAttempt?.attemptNumber).toBe(1);
    expect(failed.lastAttempt?.status).toBe("failed");
    expect(failed.attemptHistory).toHaveLength(1);
    expect(failed.attemptHistory[0]?.status).toBe("failed");

    const restarted = beginBatchAttempt({
      state: failed,
      repoRoot: tempRepoRoot,
      manifest,
      batch: batch!,
      mode: "replacement",
      phase: "draft_generation",
      logPath: path.join(tempRepoRoot, "logs", "B06-attempt-02.log"),
      jobId: "job-2",
      pid: 12345,
      now: "2026-03-18T01:10:00.000Z",
    });

    expect(restarted.activeJob?.attemptNumber).toBe(2);
    expect(restarted.currentAttempt?.attemptNumber).toBe(2);
    expect(restarted.nextAttemptNumber).toBe(3);
  });

  it("does not allow a second attempt to start while a batch is already running", async () => {
    const tempRepoRoot = await createTempRepoRoot();
    const { manifest } = await loadWorkflowManifest("cah-notes-mega-2026-03-16", process.cwd());
    const batch = manifest.batches.find((entry) => entry.batchId === "B06");
    expect(batch).toBeTruthy();

    const initialState = createInitialBatchState({
      repoRoot: tempRepoRoot,
      manifest,
      batch: batch!,
    });

    const started = beginBatchAttempt({
      state: initialState,
      repoRoot: tempRepoRoot,
      manifest,
      batch: batch!,
      mode: "initial",
      phase: "draft_generation",
      logPath: path.join(tempRepoRoot, "logs", "B06-attempt-01.log"),
      jobId: "job-1",
      pid: 12345,
      now: "2026-03-18T01:00:00.000Z",
    });

    expect(() => beginBatchAttempt({
      state: started,
      repoRoot: tempRepoRoot,
      manifest,
      batch: batch!,
      mode: "replacement",
      phase: "draft_generation",
      logPath: path.join(tempRepoRoot, "logs", "B06-attempt-02.log"),
      jobId: "job-2",
      pid: 67890,
      now: "2026-03-18T01:01:00.000Z",
    })).toThrow(/already has an active job/i);
  });

  it("records abandoned attempts cleanly and lets the next attempt restart", async () => {
    const tempRepoRoot = await createTempRepoRoot();
    const { manifest } = await loadWorkflowManifest("cah-notes-mega-2026-03-16", process.cwd());
    const batch = manifest.batches.find((entry) => entry.batchId === "B06");
    expect(batch).toBeTruthy();

    const initialState = createInitialBatchState({
      repoRoot: tempRepoRoot,
      manifest,
      batch: batch!,
    });

    const started = beginBatchAttempt({
      state: initialState,
      repoRoot: tempRepoRoot,
      manifest,
      batch: batch!,
      mode: "initial",
      phase: "draft_generation",
      logPath: path.join(tempRepoRoot, "logs", "B06-attempt-01.log"),
      jobId: "job-1",
      pid: 12345,
      now: "2026-03-18T01:00:00.000Z",
    });

    const abandoned = abandonBatchAttempt({
      state: started,
      jobId: "job-1",
      phase: "draft_generation_chunk_02",
      errorMessage: "Background worker pid 12345 is no longer running.",
      now: "2026-03-18T01:04:00.000Z",
    });

    expect(abandoned.activeJob).toBeNull();
    expect(abandoned.currentAttempt).toBeNull();
    expect(abandoned.lastAttempt?.status).toBe("aborted");
    expect(abandoned.lastAttempt?.phase).toBe("draft_generation_chunk_02");
    expect(abandoned.attemptHistory[0]?.status).toBe("aborted");
    expect(abandoned.nextAction).toBe("resume_with_fresh_attempt");

    const restarted = beginBatchAttempt({
      state: abandoned,
      repoRoot: tempRepoRoot,
      manifest,
      batch: batch!,
      mode: "replacement",
      phase: "draft_generation",
      logPath: path.join(tempRepoRoot, "logs", "B06-attempt-02.log"),
      jobId: "job-2",
      pid: 67890,
      now: "2026-03-18T01:06:00.000Z",
    });

    expect(restarted.activeJob?.attemptNumber).toBe(2);
    expect(restarted.currentAttempt?.attemptNumber).toBe(2);
    expect(restarted.nextAttemptNumber).toBe(3);
  });

  it("only falls back to initial state when the state file is missing", async () => {
    const tempRepoRoot = await createTempRepoRoot();
    const { manifest } = await loadWorkflowManifest("cah-notes-mega-2026-03-16", process.cwd());
    const batch = manifest.batches.find((entry) => entry.batchId === "B06");
    expect(batch).toBeTruthy();

    const initialState = await loadOrInitBatchState({
      repoRoot: tempRepoRoot,
      manifest,
      batch: batch!,
    });

    expect(initialState.status).toBe(batch!.status === "pending" ? "pending" : batch!.status);

    await fs.mkdir(path.dirname(initialState.artifactPaths.statePath), { recursive: true });
    await fs.writeFile(initialState.artifactPaths.statePath, "{not valid json", "utf8");

    await expect(loadOrInitBatchState({
      repoRoot: tempRepoRoot,
      manifest,
      batch: batch!,
    })).rejects.toThrow();
  });

  it("marks a batch as saturated before a new launch when maxAttempts is already reached", async () => {
    const tempRepoRoot = await createTempRepoRoot();
    const { manifest } = await loadWorkflowManifest("cah-notes-mega-2026-03-16", process.cwd());
    const batch = manifest.batches.find((entry) => entry.batchId === "B06");
    expect(batch).toBeTruthy();

    const initialState = createInitialBatchState({
      repoRoot: tempRepoRoot,
      manifest,
      batch: batch!,
    });

    const saturated = applyPrelaunchBatchTerminalState({
      state: {
        ...initialState,
        status: "failed",
        attempts: batch!.maxAttempts ?? manifest.retryPolicy.maxAttempts,
        nextAttemptNumber: (batch!.maxAttempts ?? manifest.retryPolicy.maxAttempts) + 1,
        remaining: batch!.targetCount,
        nextAction: "resume_with_fresh_attempt",
      },
      manifest,
      batch: batch!,
      now: "2026-03-18T02:00:00.000Z",
    });

    expect(saturated.status).toBe("saturated");
    expect(saturated.saturationReason).toBe("max_attempts_reached");
    expect(saturated.nextAction).toBe("no_action_saturated");
  });
});
