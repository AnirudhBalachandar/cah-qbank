import { describe, expect, it } from "vitest";

import type { GeneratedQuestionPayload } from "../app/src/lib/server/generation/validator";
import {
  buildAllowedCitationSet,
  computeSourceQuotas,
  hasNearDuplicateStem,
  isAllowedCitationSource,
  renderDocumentText,
  validateQuestionForSourcedRun,
} from "../scripts/generation/generate_sourced_sba_docx";

function sampleQuestion(overrides: Partial<GeneratedQuestionPayload["questions"][number]> = {}): GeneratedQuestionPayload["questions"][number] {
  return {
    stem_markdown: "A 6-year-old has an asthma exacerbation with increased work of breathing and reduced speaking ability. What is the next best step?",
    options: [
      { key: "A", text: "Send home without treatment" },
      { key: "B", text: "Start acute asthma treatment and urgent reassessment" },
      { key: "C", text: "Wait until tomorrow to review severity" },
      { key: "D", text: "Only prescribe oral antibiotics" },
      { key: "E", text: "No treatment unless oxygen saturation falls below 70%" },
    ],
    correctKey: "B",
    explanation_markdown: "A child with moderate-to-severe asthma symptoms needs prompt acute management and reassessment.",
    why_others_wrong: {
      A: "Unsafe with current symptoms.",
      C: "Delays appropriate treatment.",
      D: "Antibiotics are not first-line for asthma exacerbation.",
      E: "This threshold is inappropriate and unsafe.",
    },
    key_takeaways: [
      "Escalate acute asthma treatment promptly.",
      "Use reassessment to guide next steps.",
      "Management should fit Australian paediatric practice.",
    ],
    tags: ["CAH 03 > Respiratory > Asthma"],
    moduleCode: "CAH 03",
    difficulty: "Hard",
    ausScore: 5,
    citations: [
      {
        type: "internal",
        source: "CAH respiratory lecture 03.docx",
        page: 3,
      },
    ],
    ...overrides,
  };
}

describe("generate_sourced_sba_docx helpers", () => {
  it("computes proportional quotas", () => {
    const quotas = computeSourceQuotas(100, 300, 700, "content-proportional");
    expect(quotas.docQuota).toBe(30);
    expect(quotas.pdfQuota).toBe(70);
  });

  it("computes equal split quotas", () => {
    const quotas = computeSourceQuotas(9, 1, 999, "equal");
    expect(quotas.docQuota).toBe(4);
    expect(quotas.pdfQuota).toBe(5);
  });

  it("validates citation sources with basename matching", () => {
    const allowed = buildAllowedCitationSet([
      "CAH respiratory lecture 03.docx",
      "CAH final exam review.pdf",
    ]);
    expect(isAllowedCitationSource("/tmp/path/CAH respiratory lecture 03.docx", allowed)).toBe(true);
    expect(isAllowedCitationSource("C:\\docs\\CAH final exam review.pdf", allowed)).toBe(true);
    expect(isAllowedCitationSource("Unknown.pdf", allowed)).toBe(false);
  });

  it("rejects basic difficulty", () => {
    const gate = validateQuestionForSourcedRun(
      sampleQuestion({ difficulty: "Basic" }),
      {
        allowedSourceNames: buildAllowedCitationSet(["CAH respiratory lecture 03.docx"]),
        targetSourceName: "CAH respiratory lecture 03.docx",
      },
    );
    expect(gate.accepted).toBe(false);
    expect(gate.reasons).toContain("difficulty_not_medium_or_hard");
  });

  it("detects near-duplicate stems", () => {
    const incoming = "A 5-year-old with fever, tachypnoea, and focal crackles is suspected to have pneumonia. What is the next best management step?";
    const existing = [
      "A 5 year old with fever tachypnoea and focal crackles is suspected to have pneumonia. What is the next best management step?",
    ];
    const result = hasNearDuplicateStem(incoming, existing);
    expect(result.duplicate).toBe(true);
    expect(result.maxOverlap).toBeGreaterThanOrEqual(0.35);
  });

  it("renders document with disclaimer and source summary", () => {
    const rendered = renderDocumentText({
      generatedAt: new Date("2026-03-16T12:00:00.000Z"),
      acceptedQuestions: [
        {
          sourceKey: "doc",
          sourceName: "CAH respiratory lecture 03.docx",
          question: sampleQuestion(),
          similarity: {
            maxOverlap: 0.1,
            overlapQuestionId: null,
            maxCosine: 0.4,
            cosineQuestionId: null,
          },
        },
      ],
      sourceStates: {
        doc: {
          key: "doc",
          sourceName: "CAH respiratory lecture 03.docx",
          sourcePath: "/tmp/cah-respiratory.docx",
          chunks: [],
          cursor: 0,
          tokenCount: 100,
          quota: 1,
          accepted: 1,
        },
        pdf: {
          key: "pdf",
          sourceName: "CAH final exam review.pdf",
          sourcePath: "/tmp/cah-review.pdf",
          chunks: [],
          cursor: 0,
          tokenCount: 100,
          quota: 0,
          accepted: 0,
        },
      },
    });

    expect(rendered).toContain("Education-only, not medical advice.");
    expect(rendered).toContain("Source Summary");
    expect(rendered).toContain("CAH respiratory lecture 03.docx");
    expect(rendered).toContain("CAH final exam review.pdf");
    expect(rendered).toContain("Correct Answer: B");
    expect(rendered).toContain("CAH SBA Question Set");
  });
});
