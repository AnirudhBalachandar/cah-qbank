import fs from "node:fs/promises"
import path from "node:path"

import { isQuestionAnswerable, questionSchema, type Question } from "@cah/domain"

const repoRoot = process.cwd()
const draftsDir = path.join(repoRoot, "drafts")
const reportDir = path.join(repoRoot, "reports", "draft-promotion-review")
const reportPath = path.join(reportDir, "latest.json")
const reviewedAt = new Date().toISOString()

type PromotionReadinessStatus = "ready_for_published_practice" | "blocked"

type PromotionReadiness = {
  status: PromotionReadinessStatus
  blockers: string[]
  reason: string
  preparedAt: string
}

type ReviewSummary = {
  reviewedAt: string
  totalDrafts: number
  changedDrafts: number
  readyForPromotion: number
  blocked: number
  normalizationCounts: Record<string, number>
  blockerCounts: Record<string, number>
}

function toJson(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function collapseWhitespace(value: string) {
  return value.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ").trim()
}

function stripMarkdown(value: string) {
  let next = value

  for (let index = 0; index < 6; index += 1) {
    const previous = next
    next = next
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1")
      .replace(/(?<!_)_([^_\n]+)_(?!_)/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/(?<!\\)\$([^$\n]+)\$/g, "$1")
    if (next === previous) break
  }

  return collapseWhitespace(next)
}

function normalizeTextField(value: string | null | undefined) {
  if (typeof value !== "string") return value ?? null
  return stripMarkdown(value)
}

function derivePromotionReadiness(question: Question): PromotionReadiness {
  const blockers: string[] = []

  if (!isQuestionAnswerable(question)) {
    blockers.push("not_answerable")
  }
  if (!question.explanation?.trim()) {
    blockers.push("missing_explanation")
  }
  if (question.citations.length === 0) {
    blockers.push("missing_citations")
  }
  if (question.tags.length === 0) {
    blockers.push("missing_tags")
  }
  if (question.curriculum === "Unclassified") {
    blockers.push("unclassified_curriculum")
  }

  if (blockers.length > 0) {
    return {
      status: "blocked",
      blockers,
      reason: "Draft still has one or more promotion blockers.",
      preparedAt: reviewedAt,
    }
  }

  return {
    status: "ready_for_published_practice",
    blockers: [],
    reason: "Draft is schema-valid, answerable, tagged, cited, and normalized for the plain-text UI.",
    preparedAt: reviewedAt,
  }
}

function normalizeQuestion(question: Question) {
  const normalizationCounts = {
    stem: 0,
    explanation: 0,
    rationale: 0,
    optionText: 0,
    optionExplanations: 0,
  }

  const stem = normalizeTextField(question.stem) ?? question.stem
  if (stem !== question.stem) normalizationCounts.stem += 1

  const explanation = normalizeTextField(question.explanation)
  if (explanation !== question.explanation) normalizationCounts.explanation += 1

  const rationale = normalizeTextField(question.rationale)
  if (rationale !== question.rationale) normalizationCounts.rationale += 1

  const options = question.options.map((option) => {
    const text = normalizeTextField(option.text) ?? option.text
    if (text !== option.text) normalizationCounts.optionText += 1
    return {
      ...option,
      text,
    }
  })

  const optionExplanations = Object.fromEntries(
    Object.entries(question.optionExplanations ?? {}).map(([key, value]) => {
      const normalizedValue = normalizeTextField(value) ?? value
      if (normalizedValue !== value) normalizationCounts.optionExplanations += 1
      return [key, normalizedValue]
    }),
  )

  const normalized = questionSchema.parse({
    ...question,
    stem,
    explanation,
    rationale,
    options,
    optionExplanations,
  })

  return {
    question: normalized,
    normalizationCounts,
  }
}

async function main() {
  const entries = await fs.readdir(draftsDir, { withFileTypes: true })
  const fileNames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))

  const summary: ReviewSummary = {
    reviewedAt,
    totalDrafts: fileNames.length,
    changedDrafts: 0,
    readyForPromotion: 0,
    blocked: 0,
    normalizationCounts: {
      stem: 0,
      explanation: 0,
      rationale: 0,
      optionText: 0,
      optionExplanations: 0,
    },
    blockerCounts: {},
  }

  for (const fileName of fileNames) {
    const filePath = path.join(draftsDir, fileName)
    const raw = JSON.parse(await fs.readFile(filePath, "utf8"))
    const question = questionSchema.parse(raw)
    const normalized = normalizeQuestion(question)
    const promotionReadiness = derivePromotionReadiness(normalized.question)
    const updated = questionSchema.parse({
      ...normalized.question,
      source: {
        ...(normalized.question.source ?? {}),
        promotionReadiness,
      },
    })

    const before = JSON.stringify(question)
    const after = JSON.stringify(updated)
    if (before !== after) {
      summary.changedDrafts += 1
      await fs.writeFile(filePath, toJson(updated), "utf8")
    }

    for (const [key, count] of Object.entries(normalized.normalizationCounts)) {
      summary.normalizationCounts[key] = (summary.normalizationCounts[key] ?? 0) + count
    }

    if (promotionReadiness.status === "ready_for_published_practice") {
      summary.readyForPromotion += 1
    } else {
      summary.blocked += 1
      for (const blocker of promotionReadiness.blockers) {
        summary.blockerCounts[blocker] = (summary.blockerCounts[blocker] ?? 0) + 1
      }
    }
  }

  await fs.mkdir(reportDir, { recursive: true })
  await fs.writeFile(reportPath, toJson(summary), "utf8")
  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
