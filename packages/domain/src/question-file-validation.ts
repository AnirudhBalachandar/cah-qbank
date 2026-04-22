import path from "node:path"

import { questionSchema, type Question } from "./question.js"

export type QuestionFileValidationState = {
  seenIds: Set<string>
  seenFingerprints: Set<string>
}

export function createQuestionFileValidationState(): QuestionFileValidationState {
  return {
    seenIds: new Set<string>(),
    seenFingerprints: new Set<string>(),
  }
}

export function validateQuestionFileRecord({
  raw,
  filePath,
  expectedStatus,
  state,
}: {
  raw: unknown
  filePath: string
  expectedStatus: "draft" | "published"
  state: QuestionFileValidationState
}): Question {
  const parsed = questionSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`${filePath}\n${JSON.stringify(parsed.error.flatten(), null, 2)}`)
  }

  const expectedId = path.basename(filePath, ".json")
  if (parsed.data.id !== expectedId) {
    throw new Error(`${filePath}\nExpected filename id ${expectedId} but found ${parsed.data.id}`)
  }

  if (parsed.data.status !== expectedStatus) {
    throw new Error(`${filePath}\nExpected status ${expectedStatus} but found ${parsed.data.status}`)
  }

  if (state.seenIds.has(parsed.data.id)) {
    throw new Error(`Duplicate question id detected: ${parsed.data.id}`)
  }

  if (state.seenFingerprints.has(parsed.data.sourceFingerprint)) {
    throw new Error(`Duplicate sourceFingerprint detected: ${parsed.data.sourceFingerprint}`)
  }

  state.seenIds.add(parsed.data.id)
  state.seenFingerprints.add(parsed.data.sourceFingerprint)

  return parsed.data
}
