import { randomUUID, createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

import { normalizeTagSlug, questionSchema, type GeneratedQuestionContent } from "@cah/domain"

import { createDraftGenerator, type DraftGenerator } from "./openai-client.js"
import { buildSourceExcerpt, extractSourceText } from "./source.js"
import { claimQueuedJobs, defaultJobsDbPath, ensureJobsDatabase, markJobDone, markJobFailed } from "./storage.js"
import { jobInputSchema, type JobOutput, type JobRecord } from "./types.js"

type ProcessJobParams = {
  job: JobRecord
  repoRoot: string
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

function normalizeGeneratedCitations(question: GeneratedQuestionContent) {
  return question.citations.map((citation) => ({
    type: citation.type,
    ...(citation.source !== null ? { source: citation.source } : {}),
    ...(citation.page !== null ? { page: citation.page } : {}),
    ...(citation.url !== null ? { url: citation.url } : {}),
    ...(citation.title !== null ? { title: citation.title } : {}),
  }))
}

function normalizeOptionExplanations(question: GeneratedQuestionContent) {
  return Object.fromEntries(
    Object.entries(question.why_others_wrong).filter((entry): entry is [string, string] => entry[1] !== null),
  )
}

export async function processJob({
  job,
  repoRoot,
  dbPath = defaultJobsDbPath(repoRoot),
  generator = createDraftGenerator(),
}: ProcessJobParams): Promise<ProcessedJob> {
  const input = jobInputSchema.parse(job.input)
  const sourceText = await extractSourceText(input.sourcePath)
  const sourceExcerpt = buildSourceExcerpt(sourceText)

  if (!sourceExcerpt) {
    throw new Error(`Source produced no readable text: ${input.sourcePath}`)
  }

  const generated = await generator({
    batch: job.batch,
    ordinal: input.ordinal,
    total: input.total,
    requestedTags: input.tags,
    sourcePath: input.sourcePath,
    sourceExcerpt,
  })

  const questionId = randomUUID()
  const createdAt = new Date().toISOString()
  const mergedTags = mergeTags(input.tags, generated.tags)

  const draftQuestion = questionSchema.parse({
    id: questionId,
    stem: generated.stem,
    questionType: generated.questionType,
    options: generated.options,
    explanation: generated.explanation,
    citations: normalizeGeneratedCitations(generated),
    tags: mergedTags,
    curriculum: generated.curriculum,
    status: "draft",
    createdBy: "ai",
    createdAt,
    sourceFingerprint: buildSourceFingerprint({
      batch: job.batch,
      sourcePath: input.sourcePath,
      sourceExcerpt,
      question: generated,
    }),
    rationale: generated.key_takeaways.join("; "),
    optionExplanations: normalizeOptionExplanations(generated),
    moduleCode: generated.moduleCode ?? null,
    difficulty: generated.difficulty ?? null,
    ausScore: generated.ausScore ?? null,
    source: {
      batch: job.batch,
      jobId: job.id,
      sourcePath: input.sourcePath,
      generatedAt: createdAt,
      model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
      requestedTags: input.tags,
      rawGeneratedTags: generated.tags,
    },
  })

  const draftsDir = path.join(repoRoot, "drafts")
  await fs.mkdir(draftsDir, { recursive: true })
  const draftPath = path.join(draftsDir, `${questionId}.json`)
  await fs.writeFile(draftPath, `${JSON.stringify(draftQuestion, null, 2)}\n`, "utf8")

  const output: JobOutput = {
    questionId,
    draftPath,
    model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
  }
  markJobDone({
    dbPath,
    jobId: job.id,
    output,
  })

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
  let done = 0
  let failed = 0

  while (true) {
    const jobs = claimQueuedJobs(workerConcurrency, dbPath)
    if (jobs.length === 0) break

    const results = await Promise.allSettled(
      jobs.map((job) =>
        processJob({
          job,
          repoRoot,
          dbPath,
          generator,
        }),
      ),
    )

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
        error: result.reason instanceof Error ? result.reason.stack ?? result.reason.message : String(result.reason),
      })
    }
  }

  return { done, failed }
}
