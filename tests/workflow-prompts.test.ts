import { describe, expect, it } from "vitest";

import { buildInitialPrompt } from "../scripts/generation/build_initial_prompt";
import { buildReplacementPrompt } from "../scripts/generation/build_replacement_prompt";
import { loadWorkflowManifest } from "../scripts/generation/lib/manifest";
import { createInitialBatchState } from "../scripts/generation/lib/state";

const sourcePack = {
  workflowId: "cah-notes-mega-2026-03-16",
  batchId: "B06",
  query: "Dentistry foundations and prevention",
  sourcePriorityNotes: "Louisa - Dentistry pp.132-133",
  subtopics: ["dental anatomy", "ankyloglossia"],
  retrievedAt: new Date().toISOString(),
  items: [
    {
      sourceRef: "Louisa Leone MD3 2025 - Child and Adolescent Health - Study Notes.pdf",
      title: "Louisa Leone MD3 2025 - Child and Adolescent Health - Study Notes.pdf",
      heading: "Dentistry",
      pageStart: 132,
      pageEnd: 133,
      similarity: 0.92,
      excerpt: "Dental anatomy and prevention principles are discussed in the dentistry block.",
    },
  ],
};

describe("workflow prompt builders", () => {
  it("builds an initial prompt with batch metadata and source pack excerpts", async () => {
    const { manifest } = await loadWorkflowManifest("cah-notes-mega-2026-03-16", process.cwd());
    const batch = manifest.batches.find((entry) => entry.batchId === "B06")!;
    const prompt = await buildInitialPrompt({
      manifest,
      batch,
      sourcePack,
    });

    expect(prompt).toContain("You are generating one notes-first batch only.");
    expect(prompt).toContain("Do not inspect repository files, tests, docs, schemas");
    expect(prompt).toContain("run shell commands before answering.");
    expect(prompt).toContain("batch id: `B06`");
    expect(prompt).toContain("Dental anatomy and prevention principles");
    expect(prompt).toContain("Use only the SOURCE PACK EXCERPTS embedded in this prompt for factual and examinable content.");
    expect(prompt).toContain("Do not browse. Do not use external sources. Do not add unsupported examinable facts.");
    expect(prompt).toContain("Retrieved internal source pack:");
    expect(prompt).toContain("Louisa Leone MD3 2025 - Child and Adolescent Health - Study Notes.pdf p.132-133 | Dentistry");
    expect(prompt).toContain("the response must satisfy the provided JSON schema exactly");
    expect(prompt).toContain("tags must not include the question type");
    expect(prompt).toContain("tags[0] to the exact curriculum area `Paediatric Sub-specialties`");
    expect(prompt).toContain("Return JSON only.");
  });

  it("keeps single-question initial prompts self-contained and bans reused angle families", async () => {
    const { manifest } = await loadWorkflowManifest("cah-notes-mega-2026-03-16", process.cwd());
    const batch = manifest.batches.find((entry) => entry.batchId === "B06")!;
    const prompt = await buildInitialPrompt({
      manifest,
      batch,
      sourcePack,
      requestedCount: 1,
      additionalAvoidAngleFamilies: ["paediatric-sub-specialties | dentistry | counselling | caries | prevention"],
    });

    expect(prompt).toContain("For this single-question call, produce one style-`A` item");
    expect(prompt).toContain("also avoid these angle families already used in this same batch generation:");
    expect(prompt).toContain("paediatric-sub-specialties | dentistry | counselling | caries | prevention");
    expect(prompt).not.toContain("Style mix `A` target:");
  });

  it("builds a replacement prompt with accepted and rejected angle family memory", async () => {
    const { repoRoot, manifest } = await loadWorkflowManifest("cah-notes-mega-2026-03-16", process.cwd());
    const batch = manifest.batches.find((entry) => entry.batchId === "B06")!;
    const state = {
      ...createInitialBatchState({ repoRoot, manifest, batch }),
      attempts: 1,
      acceptedTotal: 9,
      remaining: 3,
      acceptedAngleFamilies: ["paediatric-sub-specialties | dentistry | counselling | caries | prevention"],
      rejectedAngleFamilies: ["paediatric-sub-specialties | dentistry | recall | tooth eruption | timing"],
      overlapWarnings: ["Too many anatomy-recall variants were rejected in the previous attempt."],
    };

    const prompt = await buildReplacementPrompt({
      repoRoot,
      manifest,
      batch,
      state,
      sourcePack,
    });

    expect(prompt).toContain("replacement questions only");
    expect(prompt).toContain("`9` questions are already accepted");
    expect(prompt).toContain("Do not inspect repository files, tests, docs, schemas");
    expect(prompt).toContain("run shell commands before answering.");
    expect(prompt).toContain("Follow source priority strictly:");
    expect(prompt).toContain("Do **not** copy or paraphrase stems from the question zip.");
    expect(prompt).toContain("Accepted angle families to avoid:");
    expect(prompt).toContain("Too many anatomy-recall variants were rejected");
    expect(prompt).toContain("Rejected pattern families to avoid:");
    expect(prompt).toContain("stable gastroenteritis tolerating oral fluids -> discharge on oral rehydration");
    expect(prompt).toContain("generate exactly `3` questions");
    expect(prompt).toContain("tags must not include the question type");
    expect(prompt).toContain("tags[1] to the exact topic cluster `Dentistry foundations and prevention`");
  });
});
