import fs from "node:fs/promises"
import path from "node:path"

import { isQuestionAnswerable } from "../packages/domain/src/question.ts"

type QuestionFile = {
  id?: string
  status?: string | null
  curriculum?: string | null
  tags?: string[] | null
  options?: Array<{ key?: string; isCorrect?: boolean | null }> | null
}

type Row = {
  file: string
  id: string
  status: string
  isCahKat: boolean
  answerable: boolean
  correctOptionCount: number
  reason: string
  curriculum: string
}

const repoRoot = process.cwd()
const questionsDir = path.join(repoRoot, "questions")
const outDir = path.join(repoRoot, "reports", "answerability-reconciliation")

const cahKatTag = "cah-exam-blueprint/cah-kat"

function csvEscape(value: string | number | boolean) {
  const text = String(value)
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

function deriveReason(options: QuestionFile["options"], correctCount: number) {
  if (!options || options.length === 0) {
    return "No options present"
  }
  if (correctCount === 0) {
    return "No option has isCorrect=true"
  }
  return `Multiple options have isCorrect=true (${correctCount})`
}

async function main() {
  const entries = (await fs.readdir(questionsDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))

  const rows: Row[] = []

  for (const name of entries) {
    const filePath = path.join(questionsDir, name)
    const raw = await fs.readFile(filePath, "utf8")
    const question = JSON.parse(raw) as QuestionFile

    const options = question.options ?? []
    const correctOptionCount = options.filter((option) => option?.isCorrect === true).length
    const answerable = isQuestionAnswerable({
      options: options.map((option, index) => ({
        key: option?.key ?? String(index),
        text: "",
        isCorrect: option?.isCorrect ?? null,
      })),
    })

    rows.push({
      file: `questions/${name}`,
      id: question.id ?? path.basename(name, ".json"),
      status: question.status ?? "unknown",
      isCahKat: (question.tags ?? []).includes(cahKatTag),
      answerable,
      correctOptionCount,
      reason: answerable ? "Answerable (exactly one correct option)" : deriveReason(question.options, correctOptionCount),
      curriculum: question.curriculum ?? "Unclassified",
    })
  }

  const publishedRows = rows.filter((row) => row.status === "published")
  const publishedNotAnswerable = publishedRows.filter((row) => !row.answerable)
  const publishedCahKatNotAnswerable = publishedNotAnswerable.filter((row) => row.isCahKat)

  const summaryLines = [
    "# Answerability Reconciliation Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `- Total question files scanned: ${rows.length}`,
    `- Published questions: ${publishedRows.length}`,
    `- Published questions not answerable: ${publishedNotAnswerable.length}`,
    `- Published CAH-KAT questions: ${publishedRows.filter((row) => row.isCahKat).length}`,
    `- Published CAH-KAT questions not answerable: ${publishedCahKatNotAnswerable.length}`,
    "",
    "## Why questions are not answerable",
    "",
    ...Object.entries(
      publishedNotAnswerable.reduce<Record<string, number>>((acc, row) => {
        acc[row.reason] = (acc[row.reason] ?? 0) + 1
        return acc
      }, {}),
    )
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([reason, count]) => `- ${reason}: ${count}`),
    "",
    "## Artifacts",
    "",
    "- `reports/answerability-reconciliation/all-1107-questions.csv`: file-by-file status for all question files.",
    "- `reports/answerability-reconciliation/published-not-answerable-178.csv`: exact published questions that are not answerable and reason.",
    "- `reports/answerability-reconciliation/published-cah-kat-not-answerable-71.csv`: exact published CAH-KAT questions that are not answerable and reason.",
    "",
  ]

  const csvHeader = [
    "file",
    "id",
    "status",
    "is_cah_kat",
    "answerable",
    "correct_option_count",
    "reason",
    "curriculum",
  ]

  function rowsToCsv(data: Row[]) {
    const lines = [csvHeader.join(",")]
    for (const row of data) {
      lines.push(
        [
          row.file,
          row.id,
          row.status,
          row.isCahKat,
          row.answerable,
          row.correctOptionCount,
          row.reason,
          row.curriculum,
        ]
          .map(csvEscape)
          .join(","),
      )
    }
    return `${lines.join("\n")}\n`
  }

  await fs.mkdir(outDir, { recursive: true })
  await fs.writeFile(path.join(outDir, "report.md"), `${summaryLines.join("\n")}\n`, "utf8")
  await fs.writeFile(path.join(outDir, "all-1107-questions.csv"), rowsToCsv(rows), "utf8")
  await fs.writeFile(path.join(outDir, "published-not-answerable-178.csv"), rowsToCsv(publishedNotAnswerable), "utf8")
  await fs.writeFile(path.join(outDir, "published-cah-kat-not-answerable-71.csv"), rowsToCsv(publishedCahKatNotAnswerable), "utf8")

  console.log(`Wrote reconciliation report to ${outDir}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 1
})
