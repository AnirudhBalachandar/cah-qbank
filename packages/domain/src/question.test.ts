import { describe, expect, it } from "vitest"

import { findCurriculumByLabel, isQuestionAnswerable } from "./question.js"

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
})
