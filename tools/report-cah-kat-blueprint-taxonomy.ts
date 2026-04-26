import fs from "node:fs/promises"
import path from "node:path"

import { isQuestionAnswerable, questionSchema } from "@cah/domain"

import { blueprintCategories } from "../app/lib/cah-kat-blueprint"
import { projectLearnerTagSlugs } from "../app/lib/question-files"

const repoRoot = process.cwd()
const questionsDir = path.join(repoRoot, "questions")
const reportPath = path.join(repoRoot, "reports", "cah-kat-blueprint-taxonomy.json")

const categoryBySlug = new Map(blueprintCategories.map((category) => [category.slug, category]))
const subtopicToCategorySlug = new Map(
  blueprintCategories.flatMap((category) =>
    category.subtopics.map((subtopic) => [subtopic.slug, category.slug] as const),
  ),
)

type ReportQuestion = {
  id: string
  curriculum: string
  stemPreview: string
  projectedBlueprintSlugs: string[]
  learnerTagSlugs: string[]
  rawTags: string[]
  reason: string
}

function stemPreview(stem: string) {
  return stem.replace(/\s+/g, " ").trim().slice(0, 180)
}

function increment(counter: Map<string, number>, key: string) {
  counter.set(key, (counter.get(key) ?? 0) + 1)
}

async function listQuestionFiles() {
  const entries = await fs.readdir(questionsDir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(questionsDir, entry.name))
    .sort((left, right) => left.localeCompare(right))
}

async function main() {
  const questionFiles = await listQuestionFiles()
  const categoryCounts = new Map<string, number>()
  const subtopicCounts = new Map<string, number>()
  const lowConfidenceQuestions: ReportQuestion[] = []
  const unmappedQuestions: ReportQuestion[] = []

  let publishedQuestions = 0
  let publishedAnswerableQuestions = 0
  let answerableWithBlueprintCategory = 0
  let answerableWithBlueprintSubtopic = 0
  let multiCategoryQuestions = 0

  for (const questionFile of questionFiles) {
    const raw = JSON.parse(await fs.readFile(questionFile, "utf8"))
    const question = questionSchema.parse(raw)
    if (question.status !== "published") continue

    publishedQuestions += 1
    if (!isQuestionAnswerable(question)) continue

    publishedAnswerableQuestions += 1

    const learnerTagSlugs = projectLearnerTagSlugs(question)
    const categorySlugs = learnerTagSlugs.filter((slug) => categoryBySlug.has(slug))
    const subtopicSlugs = learnerTagSlugs.filter((slug) => subtopicToCategorySlug.has(slug))
    const projectedBlueprintSlugs = [...categorySlugs, ...subtopicSlugs].sort((left, right) =>
      left.localeCompare(right),
    )

    for (const slug of categorySlugs) {
      increment(categoryCounts, slug)
    }
    for (const slug of subtopicSlugs) {
      increment(subtopicCounts, slug)
    }

    if (categorySlugs.length > 0) {
      answerableWithBlueprintCategory += 1
    }
    if (subtopicSlugs.length > 0) {
      answerableWithBlueprintSubtopic += 1
    }
    if (categorySlugs.length > 1) {
      multiCategoryQuestions += 1
    }

    if (categorySlugs.length === 0) {
      unmappedQuestions.push({
        id: question.id,
        curriculum: question.curriculum,
        stemPreview: stemPreview(question.stem),
        projectedBlueprintSlugs,
        learnerTagSlugs,
        rawTags: question.tags,
        reason: "No top-level CAH KAT blueprint curriculum was projected.",
      })
      continue
    }

    if (subtopicSlugs.length === 0) {
      lowConfidenceQuestions.push({
        id: question.id,
        curriculum: question.curriculum,
        stemPreview: stemPreview(question.stem),
        projectedBlueprintSlugs,
        learnerTagSlugs,
        rawTags: question.tags,
        reason: "Only top-level blueprint curriculum was projected; no child blueprint subtopic matched.",
      })
    }
  }

  const categories = blueprintCategories.map((category) => ({
    slug: category.slug,
    name: category.name,
    examQuestionCount: category.examQuestionCount,
    examPercent: category.examPercent,
    questionCount: categoryCounts.get(category.slug) ?? 0,
    subtopics: category.subtopics.map((subtopic) => ({
      slug: subtopic.slug,
      name: subtopic.name,
      questionCount: subtopicCounts.get(subtopic.slug) ?? 0,
    })),
  }))

  const report = {
    schemaVersion: "cah-kat-blueprint-taxonomy-report-v1",
    generatedAt: new Date().toISOString(),
    totals: {
      publishedQuestions,
      publishedAnswerableQuestions,
      answerableWithBlueprintCategory,
      answerableWithBlueprintSubtopic,
      lowConfidencePublishedAnswerableQuestions: lowConfidenceQuestions.length,
      unmappedPublishedAnswerableQuestions: unmappedQuestions.length,
      multiCategoryPublishedAnswerableQuestions: multiCategoryQuestions,
    },
    categories,
    lowConfidencePublishedAnswerableQuestions: lowConfidenceQuestions.sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    unmappedPublishedAnswerableQuestions: unmappedQuestions.sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
  }

  await fs.mkdir(path.dirname(reportPath), { recursive: true })
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`Wrote ${path.relative(repoRoot, reportPath)}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
