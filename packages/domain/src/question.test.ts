import { describe, expect, it } from "vitest"

import { findCurriculumByLabel, generatedQuestionContentSchema, isQuestionAnswerable } from "./question.js"

describe("question helpers", () => {
  it("matches hyphenated curriculum labels from slug-humanized text", () => {
    expect(findCurriculumByLabel("Paediatric Sub Specialties")).toBe("Paediatric Sub-specialties")
    expect(findCurriculumByLabel("Community Based Paediatrics")).toBe("Community-based Paediatrics")
  })

  it("requires exactly one correct option for a question to be answerable", () => {
    expect(
      isQuestionAnswerable({
        options: [
          { key: "A", text: "A", isCorrect: false },
          { key: "B", text: "B", isCorrect: true },
          { key: "C", text: "C", isCorrect: null },
        ],
      }),
    ).toBe(true)

    expect(
      isQuestionAnswerable({
        options: [
          { key: "A", text: "A", isCorrect: null },
          { key: "B", text: "B", isCorrect: null },
        ],
      }),
    ).toBe(false)

    expect(
      isQuestionAnswerable({
        options: [
          { key: "A", text: "A", isCorrect: true },
          { key: "B", text: "B", isCorrect: true },
        ],
      }),
    ).toBe(false)
  })

  it("enforces the stricter generator payload contract", () => {
    const valid = generatedQuestionContentSchema.parse({
      stem: "A 2-year-old presents with bronchiolitis. What is the most appropriate first-line management?",
      questionType: "SBA",
      options: [
        { key: "A", text: "Routine antibiotics", isCorrect: false },
        { key: "B", text: "Supportive care with hydration and oxygen if needed", isCorrect: true },
        { key: "C", text: "Immediate chest CT", isCorrect: false },
        { key: "D", text: "High-dose oral steroids for all patients", isCorrect: false },
        { key: "E", text: "Discharge every child without observation", isCorrect: false },
      ],
      explanation: "Supportive care is first-line management for bronchiolitis.",
      citations: [{ type: "internal", source: "source.txt", page: 2, url: null, title: "Bronchiolitis notes" }],
      tags: ["general-paediatrics/respiratory"],
      curriculum: "General Paediatrics",
      why_others_wrong: {
        A: "Routine antibiotics are not indicated for uncomplicated bronchiolitis.",
        B: null,
        C: "Chest CT is not a first-line investigation in routine bronchiolitis.",
        D: "Steroids are not routinely recommended for bronchiolitis.",
        E: "Observation depends on clinical severity and hydration status.",
      },
      key_takeaways: [
        "Bronchiolitis management is mainly supportive.",
        "Hydration and oxygenation guide management decisions.",
        "Escalation depends on respiratory distress and feeding tolerance.",
      ],
      moduleCode: null,
      difficulty: "Intermediate",
      ausScore: 2,
    })

    expect(valid.options).toHaveLength(5)
    expect(valid.options[1]?.isCorrect).toBe(true)
  })

  it("rejects generator payloads without all incorrect-option explanations", () => {
    const parsed = generatedQuestionContentSchema.safeParse({
      stem: "Which management step is most appropriate?",
      questionType: "SBA",
      options: [
        { key: "A", text: "Option A", isCorrect: true },
        { key: "B", text: "Option B", isCorrect: false },
        { key: "C", text: "Option C", isCorrect: false },
        { key: "D", text: "Option D", isCorrect: false },
        { key: "E", text: "Option E", isCorrect: false },
      ],
      explanation: "Explanation",
      citations: [{ type: "internal", source: "source.txt", page: null, url: null, title: null }],
      tags: ["general-paediatrics"],
      curriculum: "General Paediatrics",
      why_others_wrong: {
        A: null,
        B: "B is wrong",
        C: "C is wrong",
        D: "D is wrong",
        E: null,
      },
      key_takeaways: ["One", "Two", "Three"],
      moduleCode: null,
      difficulty: "Intermediate",
      ausScore: 1,
    })

    expect(parsed.success).toBe(false)
  })
})
