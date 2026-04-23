import fs from "node:fs/promises"
import path from "node:path"

import { isQuestionAnswerable } from "../packages/domain/src/question.ts"

type QuestionFile = {
  curriculum?: string | null
  options?: Array<{ isCorrect?: boolean | null }> | null
  status?: string | null
  tags?: string[] | null
}

const repoRoot = process.cwd()
const questionsDir = path.join(repoRoot, "questions")
const cahKatTag = "cah-exam-blueprint/cah-kat"

async function listQuestionPaths() {
  const entries = await fs.readdir(questionsDir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(questionsDir, entry.name))
    .sort((a, b) => a.localeCompare(b))
}

async function main() {
  const questionPaths = await listQuestionPaths()

  let publishedTotal = 0
  let publishedAnswerableTotal = 0
  let publishedNotAnswerableTotal = 0

  let publishedCahKatTotal = 0
  let publishedCahKatAnswerableTotal = 0
  let publishedCahKatNotAnswerableTotal = 0

  for (const questionPath of questionPaths) {
    const raw = await fs.readFile(questionPath, "utf8")
    const question = JSON.parse(raw) as QuestionFile

    if (question.status !== "published") {
      continue
    }

    publishedTotal += 1

    const isCahKat = (question.tags ?? []).includes(cahKatTag)
    if (isCahKat) {
      publishedCahKatTotal += 1
    }

    const answerable = isQuestionAnswerable({
      options: (question.options ?? []).map((option, index) => ({
        key: String(index),
        text: "",
        isCorrect: option?.isCorrect ?? null,
      })),
    })

    if (answerable) {
      publishedAnswerableTotal += 1
      if (isCahKat) {
        publishedCahKatAnswerableTotal += 1
      }
      continue
    }

    publishedNotAnswerableTotal += 1
    if (isCahKat) {
      publishedCahKatNotAnswerableTotal += 1
    }
  }

  const publishedNonCahKatTotal = publishedTotal - publishedCahKatTotal
  const publishedNonCahKatAnswerableTotal =
    publishedAnswerableTotal - publishedCahKatAnswerableTotal

  const summary = {
    totals: {
      publishedTotal,
      publishedAnswerableTotal,
      publishedNotAnswerableTotal,
      publishedCahKatTotal,
      publishedCahKatAnswerableTotal,
      publishedCahKatNotAnswerableTotal,
      publishedNonCahKatTotal,
      publishedNonCahKatAnswerableTotal,
    },
    reconciliation: {
      "publishedTotal = publishedAnswerableTotal + publishedNotAnswerableTotal": `${publishedTotal} = ${publishedAnswerableTotal} + ${publishedNotAnswerableTotal}`,
      "publishedCahKatTotal = publishedCahKatAnswerableTotal + publishedCahKatNotAnswerableTotal": `${publishedCahKatTotal} = ${publishedCahKatAnswerableTotal} + ${publishedCahKatNotAnswerableTotal}`,
      "publishedTotal = publishedCahKatTotal + publishedNonCahKatTotal": `${publishedTotal} = ${publishedCahKatTotal} + ${publishedNonCahKatTotal}`,
      "publishedAnswerableTotal = publishedCahKatAnswerableTotal + publishedNonCahKatAnswerableTotal": `${publishedAnswerableTotal} = ${publishedCahKatAnswerableTotal} + ${publishedNonCahKatAnswerableTotal}`,
    },
  }

  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
