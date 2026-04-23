import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { questionSchema, type Question } from "@cah/domain"

const repoRoot = process.cwd()
const draftsDir = path.join(repoRoot, "drafts")
const questionsDir = path.join(repoRoot, "questions")
const manifestPath = path.join(draftsDir, "_imports", "combined-canvas-notebooklm-v1", "manifest.json")

type PromotionMode = "practice" | "browse" | "all"

type ImportManifest = {
  ids: string[]
}

function toJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

async function readJson<T>(filePath: string) {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T
}

function parseArgs(argv: string[]) {
  let mode: PromotionMode = "practice"
  let reviewedBy = process.env.CAH_REVIEWED_BY ?? os.userInfo().username

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg) continue
    if (arg === "--mode") {
      const value = argv[index + 1]
      if (value !== "practice" && value !== "browse" && value !== "all") {
        throw new Error("Invalid value for --mode. Expected one of: practice, browse, all")
      }
      mode = value
      index += 1
      continue
    }
    if (arg === "--reviewed-by") {
      const value = argv[index + 1]
      if (!value) throw new Error("Missing value for --reviewed-by")
      reviewedBy = value
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return { mode, reviewedBy }
}

function allowedStatuses(mode: PromotionMode) {
  if (mode === "all") {
    return new Set(["ready_for_published_practice", "ready_for_published_browse_only"])
  }
  if (mode === "browse") {
    return new Set(["ready_for_published_browse_only"])
  }
  return new Set(["ready_for_published_practice"])
}

async function promoteDraft(question: Question, reviewedBy: string) {
  const draftPath = path.join(draftsDir, `${question.id}.json`)
  const publishedPath = path.join(questionsDir, `${question.id}.json`)

  try {
    await fs.access(publishedPath)
    throw new Error(`Published question already exists: ${publishedPath}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error
    }
  }

  await fs.mkdir(questionsDir, { recursive: true })

  const promotedAt = new Date().toISOString()
  const promoted = questionSchema.parse({
    ...question,
    status: "published",
    source: {
      ...(question.source ?? {}),
      review: {
        reviewedBy,
        reviewedAt: promotedAt,
        decision: "publish",
        promotedAt,
        promotedFromCreatedBy: question.createdBy,
      },
    },
  })

  await fs.rename(draftPath, publishedPath)
  try {
    await fs.writeFile(publishedPath, `${toJson(promoted)}\n`, "utf8")
  } catch (error) {
    await fs.rename(publishedPath, draftPath).catch(() => undefined)
    throw error
  }

  return publishedPath
}

async function main() {
  const { mode, reviewedBy } = parseArgs(process.argv.slice(2))
  const manifest = await readJson<ImportManifest>(manifestPath)
  const eligibleStatuses = allowedStatuses(mode)

  const promotedIds: string[] = []
  const skippedIds: string[] = []

  for (const id of manifest.ids) {
    const draftPath = path.join(draftsDir, `${id}.json`)
    const raw = await readJson<unknown>(draftPath)
    const question = questionSchema.parse(raw)
    const readiness = (question.source?.promotionReadiness as { status?: string } | undefined)?.status ?? null
    if (!readiness || !eligibleStatuses.has(readiness)) {
      skippedIds.push(id)
      continue
    }

    await promoteDraft(question, reviewedBy)
    promotedIds.push(id)
  }

  console.log(
    toJson({
      mode,
      reviewedBy,
      promotedCount: promotedIds.length,
      skippedCount: skippedIds.length,
      promotedIds,
    }),
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
