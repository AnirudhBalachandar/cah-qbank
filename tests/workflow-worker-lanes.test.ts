import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { GeneratedQuestionPayload } from "../app/src/lib/server/generation/validator";
import { mergeReviewPackSynthesis } from "../scripts/generation/build_review_pack";
import { mergeWorkerReports } from "../scripts/generation/lib/report-merge";
import { loadWorkflowManifest } from "../scripts/generation/lib/manifest";
import { runAustralianVerification, VERIFICATION_TIMEOUT_MS } from "../scripts/generation/lib/verification";
import {
  IMPORT_WORKER_MAX_BUFFER_BYTES,
  IMPORT_WORKER_TIMEOUT_MS,
  normalizeGeneratedPayload,
  runImportWorker,
} from "../scripts/generation/lib/worker-runner";

const tempDirs: string[] = [];

const samplePayload: GeneratedQuestionPayload = {
  questions: [
    {
      stem_markdown: "Which NSW consent principle most directly supports confidential review of a mature adolescent?",
      options: [
        { key: "A", text: "Only parental consent is valid before age 18." },
        { key: "B", text: "Confidentiality can never apply in adolescent care." },
        { key: "C", text: "Assessment of mature minor capacity can be relevant." },
        { key: "D", text: "Medicare access is the only legal issue that matters." },
        { key: "E", text: "Consent law is identical in every Australian jurisdiction." },
      ],
      correctKey: "C",
      explanation_markdown: "NSW adolescent care may involve assessment of mature minor capacity and confidential review where clinically appropriate.",
      why_others_wrong: {
        A: "This is too absolute.",
        B: "Confidentiality remains clinically relevant.",
        D: "Consent and confidentiality are broader than billing access.",
        E: "Jurisdiction-specific legal framing matters.",
      },
      key_takeaways: [
        "Adolescent consent questions can be jurisdiction-sensitive.",
        "Confidentiality and capacity should be assessed together.",
        "Australian verification should be traceable and conservative.",
      ],
      tags: ["Adolescent Medicine", "consent", "confidentiality"],
      moduleCode: null,
      difficulty: "Intermediate",
      ausScore: 4,
      citations: [{ type: "internal", source: "Louisa Notes", page: 12, title: "Adolescent Health" }],
    },
  ],
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dirPath) => fs.rm(dirPath, { recursive: true, force: true })));
  vi.restoreAllMocks();
});

describe("workflow worker lanes", () => {
  it("adds high-confidence semantic originality rejections to the merged decision report", () => {
    const merged = mergeWorkerReports({
      workflowId: "cah-notes-mega-2026-03-16",
      batchId: "B06",
      attempt: 1,
      generatedCount: 2,
      validationReport: {
        workflowId: "cah-notes-mega-2026-03-16",
        batchId: "B06",
        attempt: 1,
        ok: true,
        structuralOk: true,
        formatOk: true,
        scopeOk: true,
        sourcePolicyOk: true,
        evidenceModeOk: true,
        issues: [],
      },
      overlapReport: {
        workflowId: "cah-notes-mega-2026-03-16",
        batchId: "B06",
        attempt: 1,
        generatedCount: 2,
        acceptedIndices: [0, 1],
        rejectedIndices: [],
        findings: [],
        warnings: [],
      },
      semanticOriginalityReport: {
        workflowId: "cah-notes-mega-2026-03-16",
        batchId: "B06",
        attempt: 1,
        findings: [
          {
            questionIndex: 1,
            classification: "same_teaching_point",
            angleFamily: "paediatric-sub-specialties | dentistry | prevention | counselling",
            confidence: 0.91,
            shouldReject: true,
            reason: "Cosmetic rewrite of the same prevention discriminator.",
          },
        ],
        warnings: ["Semantic originality worker flagged one near-duplicate."],
      },
      verificationReport: {
        workflowId: "cah-notes-mega-2026-03-16",
        batchId: "B06",
        attempt: 1,
        evidenceMode: "strict_internal",
        findings: [],
      },
    });

    expect(merged.rejectedIndices).toEqual([1]);
    expect(merged.acceptedIndices).toEqual([0]);
    expect(merged.overlapWarnings.some((entry) => entry.includes("semantic_same_teaching_point"))).toBe(true);
  });

  it("merges synthesized review-pack guidance without dropping deterministic entries", () => {
    const merged = mergeReviewPackSynthesis(
      {
        workflowId: "cah-notes-mega-2026-03-16",
        scope: { fromBatchId: "B05", toBatchId: "B06" },
        generatedAt: new Date().toISOString(),
        acceptedTotals: { accepted: 7, target: 24 },
        batchSummaries: [],
        coverageSummary: ["B05: 7/12 accepted."],
        styleMixSummary: ["Style mix D: 1 batch(es) in scope."],
        overlapTrapSummary: ["Avoid cosmetic rewrites of delayed sleep phase counselling stems."],
        verificationSummary: [],
        unresolvedExternalConflicts: [],
        recommendedImprovementPrompts: ["Same chat: review B05, B06."],
        nextRecommendedBatches: ["B06"],
        artifactPaths: [],
      },
      {
        coverageSummary: ["B06 is still untouched and should be the next live run."],
        overlapTrapSummary: ["Avoid cosmetic rewrites of delayed sleep phase counselling stems."],
        verificationSummary: ["No Australian verification issues have accumulated yet in this range."],
        recommendedImprovementPrompts: ["New chat: critique B05 saturation and propose cleaner dentistry prompts."],
        nextRecommendedBatches: ["B06"],
      },
    );

    expect(merged.coverageSummary).toHaveLength(2);
    expect(merged.recommendedImprovementPrompts.some((entry) => entry.startsWith("Same chat:"))).toBe(true);
    expect(merged.recommendedImprovementPrompts.some((entry) => entry.startsWith("New chat:"))).toBe(true);
    expect(merged.nextRecommendedBatches).toEqual(["B06"]);
  });

  it("fails open when Australian verification times out", async () => {
    const { manifest, repoRoot } = await loadWorkflowManifest("cah-notes-mega-2026-03-16", process.cwd());
    const batch = manifest.batches.find((entry) => entry.batchId === "B06")!;

    const report = await runAustralianVerification({
      repoRoot,
      manifest,
      batch,
      payload: samplePayload,
      attempt: 1,
      runStructuredOutput: async () => {
        throw new Error("codex timed out after 20000ms");
      },
    });

    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.status).toBe("needs_human_decision");
    expect(report.findings[0]?.riskLevel).toBe("medium");
    expect(report.findings[0]?.changeAllowedInMode).toBe(false);
    expect(report.findings[0]?.suggestedChange).toContain("timed out");
  });

  it("passes search and timeout settings to the Australian verification runner", async () => {
    const { manifest, repoRoot } = await loadWorkflowManifest("cah-notes-mega-2026-03-16", process.cwd());
    const batch = manifest.batches.find((entry) => entry.batchId === "B06")!;
    const captured: Array<Record<string, unknown>> = [];

    const report = await runAustralianVerification({
      repoRoot,
      manifest,
      batch,
      payload: samplePayload,
      attempt: 1,
      runStructuredOutput: async <T,>(args: {
        cwd: string;
        prompt: string;
        schemaPath: string;
        search?: boolean;
        timeoutMs?: number;
      }) => {
        captured.push(args as unknown as Record<string, unknown>);
        return {
          data: {
            workflowId: manifest.workflowId,
            batchId: batch.batchId,
            attempt: 1,
            evidenceMode: manifest.evidenceMode,
            findings: [],
          } as unknown as T,
          usage: { inputTokens: null, outputTokens: null },
        };
      },
    });

    expect(report.findings).toEqual([]);
    expect(captured).toHaveLength(1);
    expect(captured[0]?.search).toBe(true);
    expect(captured[0]?.timeoutMs).toBe(VERIFICATION_TIMEOUT_MS);
    expect(String(captured[0]?.schemaPath ?? "")).toContain("verification-report.schema.json");
  });

  it("normalizes leading question-type tags into curriculum-first tags", async () => {
    const { manifest } = await loadWorkflowManifest("cah-notes-mega-2026-03-16", process.cwd());
    const batch = manifest.batches.find((entry) => entry.batchId === "B06")!;

    const normalized = normalizeGeneratedPayload({
      questions: [
        {
          ...samplePayload.questions[0],
          tags: ["SBA", "Paediatric Sub-specialties", "Dentistry foundations and prevention", "prevention"],
        },
      ],
    }, batch);

    expect(normalized.questions[0]?.tags).toEqual([
      "Paediatric Sub-specialties",
      "Dentistry foundations and prevention",
      "prevention",
    ]);
  });

  it("times out the import worker and writes a structured failure report", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-worker-lanes-"));
    tempDirs.push(tmpDir);

    const inputPath = path.join(tmpDir, "accepted-import.json");
    const reportPath = path.join(tmpDir, "import-report.json");
    const capturedOptions: Array<Record<string, unknown>> = [];

    await expect(runImportWorker({
      repoRoot: process.cwd(),
      payload: samplePayload,
      inputPath,
      reportPath,
      batchId: "B06-attempt-01",
      execFileImpl: async (_file, _args, options) => {
        capturedOptions.push(options as unknown as Record<string, unknown>);
        const error = new Error("timed out") as Error & { code?: string; killed?: boolean; signal?: string };
        error.code = "ETIMEDOUT";
        error.killed = true;
        error.signal = "SIGKILL";
        throw error;
      },
    })).rejects.toThrow(`Import worker timed out after ${IMPORT_WORKER_TIMEOUT_MS}ms`);

    expect(capturedOptions).toHaveLength(1);
    expect(capturedOptions[0]?.timeout).toBe(IMPORT_WORKER_TIMEOUT_MS);
    expect(capturedOptions[0]?.killSignal).toBe("SIGKILL");
    expect(capturedOptions[0]?.maxBuffer).toBe(IMPORT_WORKER_MAX_BUFFER_BYTES);

    const report = JSON.parse(await fs.readFile(reportPath, "utf8")) as {
      ok: boolean;
      created: number;
      rejected: number;
      decisions: unknown[];
      error?: string;
    };
    expect(report.ok).toBe(false);
    expect(report.created).toBe(0);
    expect(report.rejected).toBe(samplePayload.questions.length);
    expect(report.decisions).toEqual([]);
    expect(report.error).toContain(`Import worker timed out after ${IMPORT_WORKER_TIMEOUT_MS}ms`);
  });
});
