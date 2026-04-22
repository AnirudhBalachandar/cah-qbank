import { describe, expect, it } from "vitest"
import type { Question } from "@cah/domain"

import { collectTagDescriptors } from "@/lib/question-files"

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "3f6eb70d-69d6-4d78-9dca-d98e3ca3e1e0",
    stem: "Question stem",
    questionType: "SBA",
    options: [
      { key: "A", text: "Option A", isCorrect: false },
      { key: "B", text: "Option B", isCorrect: true },
      { key: "C", text: "Option C", isCorrect: false },
    ],
    explanation: "Explanation",
    citations: [],
    tags: ["paediatric-sub-specialties/respiratory"],
    curriculum: "Paediatric Sub-specialties",
    status: "published",
    createdBy: "manual",
    createdAt: "2026-04-22T00:00:00.000Z",
    sourceFingerprint: "fingerprint",
    ...overrides,
  }
}

describe("question file tag descriptors", () => {
  it("classifies curriculum slugs with hyphenated labels correctly", () => {
    const descriptors = collectTagDescriptors([makeQuestion()])

    expect(descriptors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: "paediatric-sub-specialties",
          kind: "curriculum",
        }),
      ]),
    )
  })
})
