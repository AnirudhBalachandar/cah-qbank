import { describe, expect, it } from "vitest";

import { validateGeneratedPayload } from "../app/src/lib/server/generation/validator";

const sample = {
  questions: [
    {
      stem_markdown: "A 3-year-old with increased work of breathing, wheeze, and poor oral intake presents to ED. What is the best next step?",
      options: [
        { key: "A", text: "Immediate discharge without treatment" },
        { key: "B", text: "Start inhaled bronchodilator assessment and senior review" },
        { key: "C", text: "Routine outpatient review next week only" },
        { key: "D", text: "Give oral antibiotics for all wheeze" },
        { key: "E", text: "No treatment unless fever develops" },
      ],
      correctKey: "B",
      explanation_markdown: "An acutely wheezy child with respiratory distress needs prompt severity assessment and treatment escalation based on response.",
      why_others_wrong: {
        A: "Unsafe with current symptoms.",
        C: "Too delayed for acute respiratory distress.",
        D: "Antibiotics are not routine first-line treatment for wheeze.",
        E: "Management is based on respiratory severity, not fever alone.",
      },
      key_takeaways: [
        "Assess severity early.",
        "Treat acute wheeze promptly.",
        "Escalate based on clinical response.",
      ],
      tags: ["CAH 03 > Respiratory > Acute wheeze"],
      moduleCode: "CAH 03",
      difficulty: "Intermediate",
      ausScore: 3,
      citations: [{ type: "internal", source: "CAH respiratory notes.pdf", page: 20 }],
    },
  ],
};

describe("generation validator", () => {
  it("accepts valid strict_internal payload", () => {
    const result = validateGeneratedPayload(sample, "strict_internal");
    expect(result.valid).toBe(true);
  });

  it("rejects external citations in strict_internal mode", () => {
    const payload = {
      questions: [
        {
          ...sample.questions[0],
          citations: [{ type: "external", url: "https://example.com", title: "x" }],
        },
      ],
    };

    const result = validateGeneratedPayload(payload, "strict_internal");
    expect(result.valid).toBe(false);
  });
});
