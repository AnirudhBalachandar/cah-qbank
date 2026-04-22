import fs from "node:fs/promises"
import path from "node:path"

import { isQuestionAnswerable, questionSchema } from "@cah/domain"

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
  return parsed.data
}

async function main() {
  const summary = {
    questions: 0,
    drafts: 0,
    publishedAnswerable: 0,
    publishedBrowseOnly: 0,
  }
  const seenIds = new Set<string>()
  const seenFingerprints = new Set<string>()

  for (const { dirPath, expectedStatus } of targetDirs) {
    const files = await listJsonFiles(dirPath)
    for (const filePath of files) {
      const question = await validateFile(filePath, expectedStatus)
      if (seenIds.has(question.id)) {
        throw new Error(`Duplicate question id detected: ${question.id}`)
      }
      if (seenFingerprints.has(question.sourceFingerprint)) {
        throw new Error(`Duplicate sourceFingerprint detected: ${question.sourceFingerprint}`)
      }
      seenIds.add(question.id)
      seenFingerprints.add(question.sourceFingerprint)
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
