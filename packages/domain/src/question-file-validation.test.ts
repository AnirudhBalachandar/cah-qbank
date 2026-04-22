import { describe, expect, it } from "vitest"

import { createQuestionFileValidationState, validateQuestionFileRecord } from "./question-file-validation.js"

function buildQuestion(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    stem: "Which answer is correct?",
    questionType: "SBA",
    options: [
      { key: "A", text: "A", isCorrect: false },
      { key: "B", text: "B", isCorrect: true },
    ],
    explanation: "Because B is correct.",
    citations: [{ type: "internal", source: "source.txt" }],
    tags: ["general-paediatrics"],
    curriculum: "General Paediatrics",
    status: "draft",
    createdBy: "manual",
    createdAt: "2026-04-22T00:00:00.000Z",
    sourceFingerprint: "fingerprint-1",
    source: {},
    ...overrides,
  }
}

describe("question file validation", () => {
  it("rejects filename and id mismatches", () => {
    const state = createQuestionFileValidationState()

    expect(() =>
      validateQuestionFileRecord({
        raw: buildQuestion(),
        filePath: "/tmp/00000000-0000-4000-8000-000000000099.json",
        expectedStatus: "draft",
        state,
      }),
    ).toThrow("Expected filename id")
  })

  it("rejects duplicate ids and duplicate source fingerprints", () => {
    const state = createQuestionFileValidationState()

    validateQuestionFileRecord({
      raw: buildQuestion(),
      filePath: "/tmp/00000000-0000-4000-8000-000000000001.json",
      expectedStatus: "draft",
      state,
    })

    expect(() =>
      validateQuestionFileRecord({
        raw: buildQuestion({
          sourceFingerprint: "fingerprint-2",
        }),
        filePath: "/tmp/00000000-0000-4000-8000-000000000001.json",
        expectedStatus: "draft",
        state,
      }),
    ).toThrow("Duplicate question id")

    const fingerprintState = createQuestionFileValidationState()
    validateQuestionFileRecord({
      raw: buildQuestion(),
      filePath: "/tmp/00000000-0000-4000-8000-000000000001.json",
      expectedStatus: "draft",
      state: fingerprintState,
    })

    expect(() =>
      validateQuestionFileRecord({
        raw: buildQuestion({
          id: "00000000-0000-4000-8000-000000000002",
        }),
        filePath: "/tmp/00000000-0000-4000-8000-000000000002.json",
        expectedStatus: "draft",
        state: fingerprintState,
      }),
    ).toThrow("Duplicate sourceFingerprint")
  })
})
