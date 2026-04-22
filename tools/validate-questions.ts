import fs from "node:fs/promises"
import path from "node:path"

import { createQuestionFileValidationState, isQuestionAnswerable, validateQuestionFileRecord } from "@cah/domain"

const repoRoot = process.cwd()
const targetDirs = [
  { dirPath: path.join(repoRoot, "questions"), expectedStatus: "published" as const },
  { dirPath: path.join(repoRoot, "drafts"), expectedStatus: "draft" as const },
]

async function listJsonFiles(dirPath: string) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(dirPath, entry.name))
      .sort((a, b) => a.localeCompare(b))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return []
    }
    throw error
  }
}

async function validateFile(filePath: string, expectedStatus: "draft" | "published") {
  const raw = JSON.parse(await fs.readFile(filePath, "utf8"))
  return { raw, filePath, expectedStatus }
}

async function main() {
  const summary = {
    questions: 0,
    drafts: 0,
    publishedAnswerable: 0,
    publishedBrowseOnly: 0,
  }
  const state = createQuestionFileValidationState()

  for (const { dirPath, expectedStatus } of targetDirs) {
    const files = await listJsonFiles(dirPath)
    for (const filePath of files) {
      const file = await validateFile(filePath, expectedStatus)
      const question = validateQuestionFileRecord({
        raw: file.raw,
        filePath: file.filePath,
        expectedStatus: file.expectedStatus,
        state,
      })
      if (question.status === "published") summary.questions += 1
      if (question.status === "draft") summary.drafts += 1
      if (question.status === "published" && isQuestionAnswerable(question)) {
        summary.publishedAnswerable += 1
      }
      if (question.status === "published" && !isQuestionAnswerable(question)) {
        summary.publishedBrowseOnly += 1
      }
    }
  }

  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
