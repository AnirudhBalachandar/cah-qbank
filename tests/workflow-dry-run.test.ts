import { describe, expect, it } from "vitest";

import type { GeneratedQuestionPayload } from "../app/src/lib/server/generation/validator";
import { buildBatchArtifactContext } from "../scripts/generation/lib/artifacts";
import { batchAttemptResultSchema } from "../scripts/generation/lib/contracts";
import { loadWorkflowManifest } from "../scripts/generation/lib/manifest";
import { buildDryRunImportReport } from "../scripts/generation/lib/worker-runner";
import { parseArgs, resolveAcceptedCountForAttempt } from "../scripts/generation/run_notes_workflow";

const samplePayload: GeneratedQuestionPayload = {
  questions: [
    {
      stem_markdown: "A 14-year-old asks whether confidentiality applies in adolescent care. Which principle is most relevant?",
      options: [
        { key: "A", text: "Confidentiality is never relevant before age 18." },
        { key: "B", text: "Confidentiality can still matter in adolescent care." },
        { key: "C", text: "Confidentiality depends only on school year." },
        { key: "D", text: "Confidentiality only applies after transfer to adult services." },
        { key: "E", text: "Confidentiality applies only if no parent attends." },
      ],
      correctKey: "B",
      explanation_markdown: "Adolescent care can require direct confidentiality discussion where appropriate.",
      why_others_wrong: {
        A: "This is too absolute.",
        C: "School year is not the determinant.",
        D: "This is not restricted to adult services.",
        E: "Parent attendance does not define confidentiality on its own.",
      },
      key_takeaways: [
        "Confidentiality is a core part of adolescent care.",
        "Confidentiality does not depend only on age thresholds.",
        "Questions should stay education-only and note-grounded.",
      ],
      tags: ["Adolescent Medicine", "confidentiality"],
      moduleCode: null,
      difficulty: "Intermediate",
      ausScore: 4,
      citations: [
        {
          type: "internal",
          source: "Louisa Leone MD3 2025 - Child and Adolescent Health - Study Notes.pdf",
          title: "Louisa Leone MD3 2025 - Child and Adolescent Health - Study Notes.pdf",
          page: 128,
        },
      ],
    },
  ],
};

describe("workflow dry-run mode", () => {
  it("treats --no-import as an alias for --dry-run and rejects resume dry-run", () => {
    const parsedDryRun = parseArgs([
      "run-batch",
      "--workflow",
      "cah-notes-mega-2026-03-16",
      "--batch",
      "B07",
      "--dry-run",
    ]);
    const parsedNoImport = parseArgs([
      "run-range",
      "--workflow",
      "cah-notes-mega-2026-03-16",
      "--from",
      "B07",
      "--to",
      "B09",
      "--no-import",
    ]);

    expect(parsedDryRun).toMatchObject({ name: "run-batch", dryRun: true });
    expect(parsedNoImport).toMatchObject({ name: "run-range", dryRun: true });
    expect(parsedNoImport).toMatchObject({ name: "run-range", noImport: true });
    expect(parsedDryRun).toMatchObject({ name: "run-batch", noImport: false });
    const parsedNoImportBatch = parseArgs([
      "run-batch",
      "--workflow",
      "cah-notes-mega-2026-03-16",
      "--batch",
      "B07",
      "--no-import",
    ]);
    expect(parsedNoImportBatch).toMatchObject({ name: "run-batch", dryRun: true, noImport: true });
    expect(() => parseArgs([
      "resume",
      "--workflow",
      "cah-notes-mega-2026-03-16",
      "--batch",
      "B07",
      "--dry-run",
    ])).toThrow(/resume does not support --dry-run or --no-import/i);
    expect(() => parseArgs([
      "resume",
      "--workflow",
      "cah-notes-mega-2026-03-16",
      "--batch",
      "B07",
      "--no-import",
    ])).toThrow(/resume does not support --dry-run or --no-import/i);
    expect(() => parseArgs([
      "run-batch-worker",
      "--workflow",
      "cah-notes-mega-2026-03-16",
      "--batch",
      "B07",
      "--no-import",
    ])).toThrow(/run-batch-worker does not support --dry-run or --no-import/i);
  });

  it("writes dry-run artifacts to a separate namespace", async () => {
    const { repoRoot, manifest } = await loadWorkflowManifest("cah-notes-mega-2026-03-16", process.cwd());
    const batch = manifest.batches.find((entry) => entry.batchId === "B07")!;

    const livePaths = buildBatchArtifactContext({
      repoRoot,
      manifest,
      batch,
      attemptNumber: 1,
      mode: "initial",
    });
    const dryRunPaths = buildBatchArtifactContext({
      repoRoot,
      manifest,
      batch,
      attemptNumber: 1,
      mode: "initial",
      artifactNamespace: "dry_run",
      artifactRunId: "spec-check",
    });

    expect(dryRunPaths.rawDir).toContain("/dry-run/spec-check");
    expect(dryRunPaths.reportsDir).toContain("/dry-run/spec-check");
    expect(dryRunPaths.statePath).toContain("/dry-run/spec-check/");
    expect(dryRunPaths.attemptResultPath).toContain("/attempt-01.attempt-result.json");
    expect(dryRunPaths.batchResultPath).toContain("/dry-run/spec-check/batch-result.json");
    expect(dryRunPaths.summaryPath).toContain("dry-run-summary.md");
    expect(dryRunPaths.rawDir).not.toBe(livePaths.rawDir);
  });

  it("defines a machine-readable attempt-result contract", () => {
    const now = "2026-03-18T12:00:00.000Z";
    const attemptResult = batchAttemptResultSchema.parse({
      workflowId: "cah-notes-mega-2026-03-16",
      batchId: "B07",
      attemptNumber: 1,
      terminalMode: "preview_completed",
      mode: "initial",
      importMode: "dry_run",
      startedAt: now,
      lastHeartbeatAt: now,
      completedAt: now,
      acceptedCount: 3,
      rejectedCount: 1,
      remaining: 3,
      acceptedTotal: 3,
      rejectedTotal: 1,
      saturationReason: null,
      projectedAcceptanceSummary: {
        acceptedTotalProjected: 3,
        rejectedTotalProjected: 1,
        remainingProjected: 3,
      },
      artifactPaths: {
        rawOutputPath: "/tmp/raw/attempt-01.generated.json",
        draftOutputPath: "/tmp/raw/attempt-01.draft.txt",
        repairOutputPath: "/tmp/raw/attempt-01.repair.json",
        sourcePackPath: "/tmp/raw/attempt-01.source-pack.json",
        promptPath: "/tmp/prompt/attempt-01.initial.md",
        overlapReportPath: "/tmp/reports/attempt-01.overlap.json",
        semanticOverlapReportPath: "/tmp/reports/attempt-01.semantic-overlap.json",
        validationReportPath: "/tmp/reports/attempt-01.validation.json",
        australianVerificationReportPath: "/tmp/reports/attempt-01.verification.json",
        mergedDecisionReportPath: "/tmp/reports/attempt-01.merged.json",
        importReportPath: "/tmp/reports/attempt-01.import.json",
        attemptResultPath: "/tmp/reports/attempt-01.attempt-result.json",
        batchResultPath: "/tmp/state/batch-result.json",
        summaryPath: "/tmp/reports/dry-run-summary.md",
      },
      phase: "finalizing",
    });

    expect(attemptResult.terminalMode).toBe("preview_completed");
    expect(attemptResult.projectedAcceptanceSummary?.acceptedTotalProjected).toBe(3);
  });

  it("builds an explicit no-import report for dry-run acceptance previews", () => {
    const report = buildDryRunImportReport({
      batchId: "B07-attempt-01-dry-run",
      payload: samplePayload,
      runId: "spec-check",
    });

    expect(report.mode).toBe("dry_run");
    expect(report.persisted).toBe(false);
    expect(report.created).toBe(0);
    expect(report.wouldImport).toBe(1);
    expect(report.decisions[0]).toMatchObject({
      index: 0,
      status: "skipped_no_import",
      questionId: null,
    });
  });

  it("uses overlap-accepted count instead of DB-created count during dry-run accounting", () => {
    expect(resolveAcceptedCountForAttempt({
      importSkipped: true,
      mergedAcceptedCount: 3,
      createdCount: 0,
    })).toBe(3);
    expect(resolveAcceptedCountForAttempt({
      importSkipped: false,
      mergedAcceptedCount: 3,
      createdCount: 2,
    })).toBe(2);
  });
});
