import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { GeneratedQuestionPayload } from "../app/src/lib/server/generation/validator";
import { loadWorkflowManifest } from "../scripts/generation/lib/manifest";
import { generateStructuredChunk, resolveGenerationChunkSize } from "../scripts/generation/run_notes_workflow";

const tempDirs: string[] = [];

const samplePayload: GeneratedQuestionPayload = {
  questions: [
    {
      stem_markdown: "A 16-year-old wants a confidential adolescent review. Which principle is most relevant?",
      options: [
        { key: "A", text: "Confidentiality never applies before age 18." },
        { key: "B", text: "Mature minor capacity may be relevant to confidential care." },
        { key: "C", text: "Only parental attendance matters in adolescent clinics." },
        { key: "D", text: "Consent law is identical in every Australian jurisdiction." },
        { key: "E", text: "Confidentiality only matters if Medicare is unavailable." },
      ],
      correctKey: "B",
      explanation_markdown: "Confidential adolescent care may involve mature minor capacity assessment where clinically appropriate.",
      why_others_wrong: {
        A: "This is too absolute.",
        C: "Parent attendance does not replace capacity assessment.",
        D: "Jurisdiction-specific framing can matter.",
        E: "Confidentiality is broader than billing access.",
      },
      key_takeaways: [
        "Confidentiality and capacity are related but distinct issues.",
        "Adolescent care often requires jurisdiction-aware framing.",
        "Education-only questions should stay clinically grounded.",
      ],
      tags: ["Adolescent Medicine", "confidentiality", "consent"],
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

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dirPath) => fs.rm(dirPath, { recursive: true, force: true })));
});

describe("workflow generation", () => {
  it("uses larger adaptive chunk sizes for initial and replacement attempts", () => {
    expect(resolveGenerationChunkSize({ mode: "initial", remainingCount: 12, isFirstChunk: true })).toBe(12);
    expect(resolveGenerationChunkSize({ mode: "replacement", remainingCount: 7, isFirstChunk: true })).toBe(7);
    expect(resolveGenerationChunkSize({ mode: "initial", remainingCount: 12 })).toBe(6);
    expect(resolveGenerationChunkSize({ mode: "initial", remainingCount: 5 })).toBe(5);
    expect(resolveGenerationChunkSize({ mode: "replacement", remainingCount: 4 })).toBe(4);
    expect(resolveGenerationChunkSize({ mode: "replacement", remainingCount: 7 })).toBe(4);
  });

  it("uses structured Codex output first when it validates cleanly", async () => {
    const { manifest } = await loadWorkflowManifest("cah-notes-mega-2026-03-16", process.cwd());
    const batch = manifest.batches.find((entry) => entry.batchId === "B06")!;
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-generation-"));
    tempDirs.push(tempDir);

    const promptArtifactPath = path.join(tempDir, "attempt-01.prompt.md");
    const draftArtifactPath = path.join(tempDir, "attempt-01.draft.txt");
    const repairArtifactPath = path.join(tempDir, "attempt-01.repair.json");
    await fs.writeFile(promptArtifactPath, "Return one valid question.", "utf8");

    let structuredCalls = 0;
    let textCalls = 0;
    const result = await generateStructuredChunk({
      repoRoot: process.cwd(),
      batch,
      strictness: "strict_internal",
      requestedCount: 1,
      promptArtifactPath,
      draftArtifactPath,
      repairArtifactPath,
      repairRetries: 1,
      runStructuredOutputJobImpl: async <T,>() => {
        structuredCalls += 1;
        return {
          data: samplePayload as unknown as T,
          usage: { inputTokens: 11, outputTokens: 22 },
        };
      },
      runTextOutputJobImpl: async () => {
        textCalls += 1;
        throw new Error("text fallback should not run");
      },
    });

    expect(structuredCalls).toBe(1);
    expect(textCalls).toBe(0);
    expect(result.repaired).toBe(false);
    expect(result.payload.questions).toHaveLength(1);
  });

  it("falls back to the legacy text path when structured generation fails", async () => {
    const { manifest } = await loadWorkflowManifest("cah-notes-mega-2026-03-16", process.cwd());
    const batch = manifest.batches.find((entry) => entry.batchId === "B06")!;
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-generation-"));
    tempDirs.push(tempDir);

    const promptArtifactPath = path.join(tempDir, "attempt-01.prompt.md");
    const draftArtifactPath = path.join(tempDir, "attempt-01.draft.txt");
    const repairArtifactPath = path.join(tempDir, "attempt-01.repair.json");
    await fs.writeFile(promptArtifactPath, "Return one valid question.", "utf8");

    let structuredCalls = 0;
    let textCalls = 0;

    const result = await generateStructuredChunk({
      repoRoot: process.cwd(),
      batch,
      strictness: "strict_internal",
      requestedCount: 1,
      promptArtifactPath,
      draftArtifactPath,
      repairArtifactPath,
      repairRetries: 1,
      runStructuredOutputJobImpl: async () => {
        structuredCalls += 1;
        throw new Error("structured generation failed");
      },
      runTextOutputJobImpl: async () => {
        textCalls += 1;
        return {
          text: JSON.stringify(samplePayload),
          usage: { inputTokens: 7, outputTokens: 9 },
        };
      },
    });

    expect(structuredCalls).toBe(1);
    expect(textCalls).toBe(1);
    expect(result.repaired).toBe(false);
    expect(result.payload.questions[0]?.correctKey).toBe("B");
  });

  it("uses separate fallback artifact paths after a structured-job failure", async () => {
    const { manifest } = await loadWorkflowManifest("cah-notes-mega-2026-03-16", process.cwd());
    const batch = manifest.batches.find((entry) => entry.batchId === "B06")!;
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-generation-"));
    tempDirs.push(tempDir);

    const promptArtifactPath = path.join(tempDir, "attempt-01.prompt.md");
    const draftArtifactPath = path.join(tempDir, "attempt-01.draft.txt");
    const repairArtifactPath = path.join(tempDir, "attempt-01.repair.json");
    await fs.writeFile(promptArtifactPath, "Return one valid question.", "utf8");
    let fallbackOutputPath = "";

    await generateStructuredChunk({
      repoRoot: process.cwd(),
      batch,
      strictness: "strict_internal",
      requestedCount: 1,
      promptArtifactPath,
      draftArtifactPath,
      repairArtifactPath,
      repairRetries: 1,
      runStructuredOutputJobImpl: async () => {
        throw new Error("structured generation failed");
      },
      runTextOutputJobImpl: async (args) => {
        fallbackOutputPath = args.outputPath;
        return {
          text: JSON.stringify(samplePayload),
          usage: { inputTokens: 7, outputTokens: 9 },
        };
      },
    });

    expect(fallbackOutputPath.endsWith(".fallback.txt")).toBe(true);
  });
});
