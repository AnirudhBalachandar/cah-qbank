import { randomUUID, createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

import { normalizeTagSlug, questionSchema, type GeneratedQuestionContent } from "@cah/domain"

import { createDraftGenerator, type DraftGenerator } from "./openai-client.js"
import { resolveGenerationModel } from "./provider.js"
import { buildSourceExcerpt, extractSourceText } from "./source.js"
import { claimQueuedJobs, defaultJobsDbPath, ensureJobsDatabase, markJobDone, markJobFailed, touchClaimedJobs } from "./storage.js"
import { jobInputSchema, type JobOutput, type JobRecord } from "./types.js"

type ProcessJobParams = {
  job: JobRecord
  repoRoot: string
  workerId: string
  dbPath?: string
  generator?: DraftGenerator
}

type RunWorkerParams = {
  repoRoot: string
  dbPath?: string
  concurrency?: number
  generator?: DraftGenerator
}

type ProcessedJob = JobOutput & { jobId: string }

function normalizeTag(value: string) {
  return normalizeTagSlug(value.replace(/>/g, "/"))
}

function mergeTags(requestedTags: string[], generatedTags: string[]) {
  const seen = new Set<string>()
  const merged: string[] = []

  for (const tag of [...requestedTags, ...generatedTags]) {
    const normalized = normalizeTag(tag)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    merged.push(normalized)
  }

  return merged
}

function buildSourceFingerprint({
  batch,
  sourcePath,
  sourceExcerpt,
  question,
}: {
  batch: string
  sourcePath: string
  sourceExcerpt: string
  question: GeneratedQuestionContent
}) {
  const digest = createHash("sha1")
    .update(batch)
    .update("\u0000")
    .update(sourcePath)
    .update("\u0000")
    .update(sourceExcerpt)
    .update("\u0000")
    .update(question.stem)
    .digest("hex")

  return `generate-${digest}`
}

function normalizeOptionExplanations(question: GeneratedQuestionContent) {
  return Object.fromEntries(
    Object.entries(question.why_others_wrong).filter((entry): entry is [string, string] => entry[1] !== null),
  )
}

function normalizeNullableGeneratedText(value: string | null) {
  if (value === null) return null

  const normalized = value.trim()
  if (!normalized) return null
  if (["null", ":null", "n/a", "none", "nil"].includes(normalized.toLowerCase())) {
    return null
  }

  return normalized
}

export async function processJob({
  job,
  repoRoot,
  workerId,
  dbPath = defaultJobsDbPath(repoRoot),
  generator = createDraftGenerator(),
}: ProcessJobParams): Promise<ProcessedJob> {
  const input = jobInputSchema.parse(job.input)
  const sourceText = await extractSourceText(input.sourcePath)
  const sourceExcerpt = buildSourceExcerpt(sourceText, {
    ordinal: input.ordinal,
    total: input.total,
  })
  const sourceFileName = path.basename(input.sourcePath)
  const sourceLabel = sourceExcerpt.truncated ? `Excerpt ${input.ordinal}/${input.total}` : "Full source"

  if (!sourceExcerpt.text) {
    throw new Error(`Source produced no readable text: ${input.sourcePath}`)
  }

  const generated = await generator({
    batch: job.batch,
    ordinal: input.ordinal,
    total: input.total,
    requestedTags: input.tags,
    sourcePath: input.sourcePath,
    sourceLabel,
    sourceExcerpt: sourceExcerpt.text,
  })

  const questionId = job.id
  const createdAt = new Date().toISOString()
  const mergedTags = mergeTags(input.tags, generated.tags)

  const draftQuestion = questionSchema.parse({
    id: questionId,
    stem: generated.stem,
    questionType: generated.questionType,
    options: generated.options,
    explanation: generated.explanation,
    citations: generated.citations.map((citation) => {
      const citationSource = path.basename(citation.source)
      if (citationSource !== sourceFileName) {
        throw new Error(`Generated citation source must be ${sourceFileName} but found ${citation.source}`)
      }

      return {
        type: citation.type,
        source: citationSource,
        ...(citation.page !== null ? { page: citation.page } : {}),
        ...(citation.title !== null ? { title: citation.title } : {}),
      }
    }),
    tags: mergedTags,
    curriculum: generated.curriculum,
    status: "draft",
    createdBy: "ai",
    createdAt,
    sourceFingerprint: buildSourceFingerprint({
      batch: job.batch,
      sourcePath: input.sourcePath,
      sourceExcerpt: sourceExcerpt.text,
      question: generated,
    }),
    rationale: generated.key_takeaways.join("; "),
    optionExplanations: normalizeOptionExplanations(generated),
    moduleCode: normalizeNullableGeneratedText(generated.moduleCode),
    difficulty: generated.difficulty ?? null,
    ausScore: generated.ausScore ?? null,
    source: {
      batch: job.batch,
      jobId: job.id,
      sourcePath: input.sourcePath,
      generatedAt: createdAt,
      model: resolveGenerationModel(),
      requestedTags: input.tags,
      rawGeneratedTags: generated.tags,
      excerptWindow: {
        start: sourceExcerpt.start,
        end: sourceExcerpt.end,
        truncated: sourceExcerpt.truncated,
        ordinal: input.ordinal,
        total: input.total,
        label: sourceLabel,
      },
    },
  })

  const draftsDir = path.join(repoRoot, "drafts")
  await fs.mkdir(draftsDir, { recursive: true })
  const draftPath = path.join(draftsDir, `${questionId}.json`)
  const tempDraftPath = `${draftPath}.tmp-${workerId}`
  await fs.writeFile(tempDraftPath, `${JSON.stringify(draftQuestion, null, 2)}\n`, "utf8")

  const output: JobOutput = {
    questionId,
    draftPath,
    model: resolveGenerationModel(),
  }
  const markedDone = markJobDone({
    dbPath,
    jobId: job.id,
    workerId,
    output,
  })
  if (!markedDone) {
    await fs.rm(tempDraftPath, { force: true })
    throw new Error(`Lost ownership of generate job ${job.id} before completion.`)
  }

  await fs.rename(tempDraftPath, draftPath)

  return {
    jobId: job.id,
    ...output,
  }
}

export async function runWorker({
  repoRoot,
  dbPath = defaultJobsDbPath(repoRoot),
  concurrency = Number(process.env.GENERATE_CONCURRENCY ?? 3),
  generator = createDraftGenerator(),
}: RunWorkerParams) {
  ensureJobsDatabase(dbPath)

  const workerConcurrency = Number.isFinite(concurrency) && concurrency > 0 ? Math.floor(concurrency) : 3
  const workerId = randomUUID()
  let done = 0
  let failed = 0

  while (true) {
    const jobs = claimQueuedJobs({
      limit: workerConcurrency,
      dbPath,
      workerId,
    })
    if (jobs.length === 0) break

    const heartbeat = setInterval(() => {
      try {
        touchClaimedJobs({
          dbPath,
          jobIds: jobs.map((job) => job.id),
          workerId,
        })
      } catch {
        // Heartbeat is best-effort; ownership checks still protect terminal writes.
      }
    }, 30_000)

    let results: PromiseSettledResult<ProcessedJob>[]
    try {
      results = await Promise.allSettled(
        jobs.map((job) =>
          processJob({
            job,
            repoRoot,
            workerId,
            dbPath,
            generator,
          }),
        ),
      )
    } finally {
      clearInterval(heartbeat)
    }

    for (const [index, result] of results.entries()) {
      const job = jobs[index]
      if (!job) continue
      if (result.status === "fulfilled") {
        done += 1
        continue
      }

      failed += 1
      markJobFailed({
        dbPath,
        jobId: job.id,
        workerId,
        error: result.reason instanceof Error ? result.reason.stack ?? result.reason.message : String(result.reason),
      })
    }
  }

  return { done, failed }
}
