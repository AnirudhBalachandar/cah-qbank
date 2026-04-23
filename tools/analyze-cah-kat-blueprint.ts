import fs from "node:fs/promises"
import path from "node:path"

import { isQuestionAnswerable } from "../packages/domain/src/question.ts"

type QuestionFile = {
  curriculum?: string | null
  options?: Array<{ isCorrect?: boolean | null }> | null
  status?: string | null
  stem?: string | null
  tags?: string[] | null
}

const repoRoot = process.cwd()
const questionsDir = path.join(repoRoot, "questions")

const cahKatTag = "cah-exam-blueprint/cah-kat"

const blueprintOrder = [
  "General Paediatrics",
  "Paediatric Sub-specialties",
  "Paediatric Surgery",
  "Emergency Paediatrics",
  "Adolescent Medicine",
  "Community-based Paediatrics",
] as const

const blueprintUnits = new Map<string, number>([
  ["General Paediatrics", 16],
  ["Paediatric Sub-specialties", 12],
  ["Paediatric Surgery", 10],
  ["Emergency Paediatrics", 10],
  ["Adolescent Medicine", 6],
  ["Community-based Paediatrics", 6],
])

const categoryFractions = new Map(
  [...blueprintUnits.entries()].map(([curriculum, units]) => [curriculum, units / 60]),
)

function sortedCounter(counter: Map<string, number>) {
  return Object.fromEntries(
    [...counter.entries()].sort((a, b) => {
      if (blueprintOrder.includes(a[0] as (typeof blueprintOrder)[number]) && blueprintOrder.includes(b[0] as (typeof blueprintOrder)[number])) {
        return blueprintOrder.indexOf(a[0] as (typeof blueprintOrder)[number]) - blueprintOrder.indexOf(b[0] as (typeof blueprintOrder)[number])
      }
      return a[0].localeCompare(b[0])
    }),
  )
}

function increment(counter: Map<string, number>, key: string) {
  counter.set(key, (counter.get(key) ?? 0) + 1)
}

function computeTargets(totalQuestions: number) {
  const exact = blueprintOrder.map((curriculum) => {
    const raw = (totalQuestions * (blueprintUnits.get(curriculum) ?? 0)) / 60
    return {
      curriculum,
      floor: Math.floor(raw),
      remainder: raw - Math.floor(raw),
    }
  })

  const targets = new Map(exact.map(({ curriculum, floor }) => [curriculum, floor]))
  let remaining = totalQuestions - exact.reduce((sum, item) => sum + item.floor, 0)

  for (const item of [...exact].sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder
    return blueprintOrder.indexOf(a.curriculum) - blueprintOrder.indexOf(b.curriculum)
  })) {
    if (remaining <= 0) break
    targets.set(item.curriculum, (targets.get(item.curriculum) ?? 0) + 1)
    remaining -= 1
  }

  return targets
}

async function listQuestionPaths() {
  const entries = await fs.readdir(questionsDir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(questionsDir, entry.name))
    .sort((a, b) => a.localeCompare(b))
}

async function main() {
  const questionPaths = await listQuestionPaths()

  const allAnswerableByCurriculum = new Map<string, number>()
  const cahKatAnswerableByCurriculum = new Map<string, number>()
  const nonCahKatAnswerableByCurriculum = new Map<string, number>()
  const sampleUnclassified = new Array<{ file: string; stem: string }>()

  let totalPublished = 0
  let totalPublishedAnswerable = 0
  let totalCahKatPublished = 0
  let totalCahKatAnswerable = 0

  for (const questionPath of questionPaths) {
    const raw = await fs.readFile(questionPath, "utf8")
    const question = JSON.parse(raw) as QuestionFile

    if (question.status !== "published") continue

    totalPublished += 1

    const answerable = isQuestionAnswerable({
      options: (question.options ?? []).map((option, index) => ({
        key: String(index),
        text: "",
        isCorrect: option?.isCorrect ?? null,
      })),
    })
    const curriculum = question.curriculum ?? "Unclassified"
    const tags = question.tags ?? []
    const isCahKat = tags.includes(cahKatTag)

    if (isCahKat) {
      totalCahKatPublished += 1
    }

    if (!answerable) continue

    totalPublishedAnswerable += 1
    increment(allAnswerableByCurriculum, curriculum)

    if (isCahKat) {
      totalCahKatAnswerable += 1
      increment(cahKatAnswerableByCurriculum, curriculum)
    } else {
      increment(nonCahKatAnswerableByCurriculum, curriculum)
    }

    if (curriculum === "Unclassified" && sampleUnclassified.length < 20) {
      sampleUnclassified.push({
        file: path.basename(questionPath),
        stem: question.stem?.replace(/\s+/g, " ").slice(0, 140) ?? "",
      })
    }
  }

  const targets = computeTargets(totalCahKatAnswerable)
  const deltas = new Map<string, number>()

  for (const curriculum of blueprintOrder) {
    deltas.set(
      curriculum,
      (targets.get(curriculum) ?? 0) - (cahKatAnswerableByCurriculum.get(curriculum) ?? 0),
    )
  }

  const maxBalancedSubset = Math.floor(Math.min(
    ...blueprintOrder.map((curriculum) => {
      const available = cahKatAnswerableByCurriculum.get(curriculum) ?? 0
      const fraction = categoryFractions.get(curriculum) ?? 1
      return available / fraction
    }),
  ))

  const summary = {
    totals: {
      publishedQuestions: totalPublished,
      publishedAnswerableQuestions: totalPublishedAnswerable,
      publishedCahKatQuestions: totalCahKatPublished,
      publishedAnswerableCahKatQuestions: totalCahKatAnswerable,
    },
    currentAnswerableCahKatByCurriculum: sortedCounter(cahKatAnswerableByCurriculum),
    blueprintTargetsForCurrentCahKatTotal: sortedCounter(targets),
    targetMinusCurrentDelta: sortedCounter(deltas),
    allAnswerableQuestionsByCurriculum: sortedCounter(allAnswerableByCurriculum),
    nonCahKatAnswerableQuestionsByCurriculum: sortedCounter(nonCahKatAnswerableByCurriculum),
    maxBalancedCahKatSubsetWithoutReclassifyingExistingCurricula: maxBalancedSubset,
    sampleAnswerableUnclassifiedQuestions: sampleUnclassified,
  }

  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
