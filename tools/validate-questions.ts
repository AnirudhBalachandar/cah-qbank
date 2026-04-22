import fs from "node:fs/promises"
import path from "node:path"

import { questionSchema } from "@cah/domain"

const repoRoot = process.cwd()
const targetDirs = [path.join(repoRoot, "questions"), path.join(repoRoot, "drafts")]

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

async function validateFile(filePath: string) {
  const raw = JSON.parse(await fs.readFile(filePath, "utf8"))
  const parsed = questionSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`${filePath}\n${JSON.stringify(parsed.error.flatten(), null, 2)}`)
  }
  return parsed.data
}

async function main() {
  const summary = {
    questions: 0,
    drafts: 0,
  }

  for (const dirPath of targetDirs) {
    const files = await listJsonFiles(dirPath)
    for (const filePath of files) {
      const question = await validateFile(filePath)
      if (question.status === "published") summary.questions += 1
      if (question.status === "draft") summary.drafts += 1
    }
  }

  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
