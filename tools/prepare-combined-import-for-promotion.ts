import fs from "node:fs/promises"
import path from "node:path"

import { questionSchema, type Question } from "@cah/domain"

const repoRoot = process.cwd()
const questionsDir = path.join(repoRoot, "questions")
const draftsDir = path.join(repoRoot, "drafts")
const importRoot = path.join(draftsDir, "_imports", "combined-canvas-notebooklm-v1")
const manifestPath = path.join(importRoot, "manifest.json")
const archiveDir = path.join(importRoot, "archived_duplicates")
const reportPath = path.join(importRoot, "promotion_prep_report.json")
const readinessPreparedAt = new Date().toISOString()

type ImportManifest = {
  ids: string[]
  archivedDuplicateIds?: string[]
  originalImportedCount?: number
  [key: string]: unknown
}

type PublishedNotebooklmIndex = Map<string, { questionId: string; fileName: string }>

type PromotionReadinessStatus =
  | "ready_for_published_practice"
  | "ready_for_published_browse_only"
  | "manual_conversion_required"
  | "duplicate_of_published"

type PromotionReadiness = {
  status: PromotionReadinessStatus
  blockers: string[]
  reason: string
  preparedAt: string
  duplicateOf?: {
    publishedQuestionId: string
    publishedFileName: string
  }
}

type PrepReport = {
  preparedAt: string
  originalImportedCount: number
  activeCount: number
  archivedDuplicateCount: number
  readinessCounts: Record<string, number>
}

function toJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

async function readJson<T>(filePath: string) {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw error
  }
}

async function locateQuestionFile(id: string) {
  const activePath = path.join(draftsDir, `${id}.json`)
  if (await fileExists(activePath)) return activePath

  const archivedPath = path.join(archiveDir, `${id}.json`)
  if (await fileExists(archivedPath)) return archivedPath

  throw new Error(`Could not locate imported draft file for ${id}`)
}

function stripReadinessTags(tags: string[]) {
  return tags.filter((tag) => !tag.startsWith("combined-import/promotion/"))
}

function addReadinessTag(tags: string[], readiness: PromotionReadinessStatus) {
  return Array.from(new Set([...stripReadinessTags(tags), `combined-import/promotion/${readiness}`])).sort((a, b) =>
    a.localeCompare(b),
  )
}

function isAnswerable(question: Pick<Question, "options">) {
  return question.options.filter((option) => option.isCorrect === true).length === 1
}

function hasSyntheticPlaceholder(question: Pick<Question, "tags">) {
  return question.tags.includes("combined-import/requires-manual-conversion")
}

function notebooklmDuplicateKey(question: Question) {
  const source = (question.source ?? {}) as Record<string, unknown>
  if (source.sourceSystem !== "notebooklm") return null

  const combined = (source.combinedRecord ?? {}) as Record<string, unknown>
  const sourceFile = typeof combined.source_file === "string" ? combined.source_file : ""
  const questionIndex = typeof combined.question_index === "number" ? combined.question_index : null
  const quizFileName = path.basename(sourceFile)
  if (!quizFileName || questionIndex === null) return null

  return `${quizFileName}#${questionIndex}`
}

async function buildPublishedNotebooklmIndex() {
  const index: PublishedNotebooklmIndex = new Map()
  const entries = await fs.readdir(questionsDir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue
    const filePath = path.join(questionsDir, entry.name)
    const raw = await readJson<unknown>(filePath)
    const question = questionSchema.parse(raw)
    const source = (question.source ?? {}) as Record<string, unknown>

    if (source.importKind !== "notebooklm_quiz_bundle") continue

    const quizFileName = typeof source.quizFileName === "string" ? source.quizFileName : null
    const questionIndex = typeof source.questionIndex === "number" ? source.questionIndex : null
    if (!quizFileName || questionIndex === null) continue

    index.set(`${quizFileName}#${questionIndex}`, {
      questionId: question.id,
      fileName: entry.name,
    })
  }

  return index
}

function resolveReadiness(question: Question, publishedNotebooklmIndex: PublishedNotebooklmIndex): PromotionReadiness {
  const duplicateKey = notebooklmDuplicateKey(question)
  const duplicate = duplicateKey ? publishedNotebooklmIndex.get(duplicateKey) : null
  if (duplicate) {
    return {
      status: "duplicate_of_published",
      blockers: ["duplicate_published_question"],
      reason: "This imported draft exactly duplicates a notebookLM question already published in the qbank.",
      preparedAt: readinessPreparedAt,
      duplicateOf: {
        publishedQuestionId: duplicate.questionId,
        publishedFileName: duplicate.fileName,
      },
    }
  }

  if (isAnswerable(question)) {
    return {
      status: "ready_for_published_practice",
      blockers: [],
      reason: "Answerable non-duplicate draft with one correct option; suitable for promotion into the published practice pool.",
      preparedAt: readinessPreparedAt,
    }
  }

  if (hasSyntheticPlaceholder(question)) {
    return {
      status: "manual_conversion_required",
      blockers: ["synthetic_placeholder_options", "not_answerable"],
      reason:
        "The source question did not expose SBA-compatible answer options, so this draft still needs manual conversion before publication.",
      preparedAt: readinessPreparedAt,
    }
  }

  return {
    status: "ready_for_published_browse_only",
    blockers: ["not_answerable"],
    reason:
      "Non-duplicate draft preserved from source but not answerable in practice mode because the source did not expose a correct option.",
    preparedAt: readinessPreparedAt,
  }
}

async function writeQuestion(filePath: string, question: Question) {
  await fs.writeFile(filePath, `${toJson(question)}\n`, "utf8")
}

async function main() {
  const manifest = await readJson<ImportManifest>(manifestPath)
  const publishedNotebooklmIndex = await buildPublishedNotebooklmIndex()

  await fs.mkdir(archiveDir, { recursive: true })

  const allIds = Array.from(new Set([...(manifest.ids ?? []), ...(manifest.archivedDuplicateIds ?? [])])).sort((a, b) =>
    a.localeCompare(b),
  )

  const activeIds: string[] = []
  const archivedDuplicateIds: string[] = []
  const readinessCounts = new Map<PromotionReadinessStatus, number>()

  for (const id of allIds) {
    const sourcePath = await locateQuestionFile(id)
    const raw = await readJson<unknown>(sourcePath)
    const question = questionSchema.parse(raw)
    const readiness = resolveReadiness(question, publishedNotebooklmIndex)
    const updated = questionSchema.parse({
      ...question,
      tags: addReadinessTag(question.tags, readiness.status),
      source: {
        ...(question.source ?? {}),
        promotionReadiness: readiness,
      },
    })

    readinessCounts.set(readiness.status, (readinessCounts.get(readiness.status) ?? 0) + 1)

    if (readiness.status === "duplicate_of_published") {
      const targetPath = path.join(archiveDir, `${id}.json`)
      await writeQuestion(targetPath, updated)
      if (sourcePath !== targetPath) {
        await fs.rm(sourcePath, { force: true })
      }
      archivedDuplicateIds.push(id)
      continue
    }

    const targetPath = path.join(draftsDir, `${id}.json`)
    await writeQuestion(targetPath, updated)
    if (sourcePath !== targetPath) {
      await fs.rm(sourcePath, { force: true })
    }
    activeIds.push(id)
  }

  const originalImportedCount =
    typeof manifest.originalImportedCount === "number"
      ? manifest.originalImportedCount
      : activeIds.length + archivedDuplicateIds.length

  const nextManifest = {
    ...manifest,
    originalImportedCount,
    ids: activeIds.sort((a, b) => a.localeCompare(b)),
    archivedDuplicateIds: archivedDuplicateIds.sort((a, b) => a.localeCompare(b)),
    promotionPreparedAt: readinessPreparedAt,
    promotionReadinessSummary: {
      activeCount: activeIds.length,
      archivedDuplicateCount: archivedDuplicateIds.length,
      readinessCounts: Object.fromEntries(
        Array.from(readinessCounts.entries()).sort((left, right) => left[0].localeCompare(right[0])),
      ),
    },
  }

  const report: PrepReport = {
    preparedAt: readinessPreparedAt,
    originalImportedCount,
    activeCount: activeIds.length,
    archivedDuplicateCount: archivedDuplicateIds.length,
    readinessCounts: nextManifest.promotionReadinessSummary.readinessCounts,
  }

  await fs.writeFile(manifestPath, `${toJson(nextManifest)}\n`, "utf8")
  await fs.writeFile(reportPath, `${toJson(report)}\n`, "utf8")

  console.log(toJson(report))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
