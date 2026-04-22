import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { questionSchema } from "@cah/domain"
import { afterEach, describe, expect, it } from "vitest"

import { promoteDraft } from "../src/publish.js"
import { buildSourceExcerpt } from "../src/source.js"
import { claimQueuedJobs, enqueueJobs, getJobCounts, markJobDone } from "../src/storage.js"
import { runWorker } from "../src/worker.js"

const sampleSource = `
Bronchiolitis in infants is usually managed with supportive care.
Hydration and oxygen therapy are used according to clinical severity.
Antibiotics are not routinely indicated for uncomplicated viral bronchiolitis.
`

describe("generate worker", () => {
  const temporaryDirectories: string[] = []

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map((dirPath) => fs.rm(dirPath, { recursive: true, force: true })),
    )
  })

  it("processes queued jobs into valid draft question files", async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cah-generate-"))
    temporaryDirectories.push(repoRoot)

    await fs.mkdir(path.join(repoRoot, "drafts"), { recursive: true })
    await fs.mkdir(path.join(repoRoot, "tools", "generate"), { recursive: true })

    const sourcePath = path.join(repoRoot, "source.txt")
    await fs.writeFile(sourcePath, sampleSource, "utf8")

    const dbPath = path.join(repoRoot, "tools", "generate", "jobs.db")
    const jobs = enqueueJobs({
      batch: "bronchiolitis-batch",
      sourcePath,
      tags: ["general-paediatrics/respiratory", "bronchiolitis"],
      count: 2,
      dbPath,
    })

    expect(jobs).toHaveLength(2)

    const result = await runWorker({
      repoRoot,
      dbPath,
      concurrency: 2,
      generator: async ({ requestedTags, ordinal, sourceLabel }) => ({
        stem: `Which management step is most appropriate for bronchiolitis case ${ordinal}?`,
        questionType: "SBA",
        options: [
          { key: "A", text: "Routine oral antibiotics", isCorrect: false },
          { key: "B", text: "Immediate discharge without assessment", isCorrect: false },
          { key: "C", text: "Supportive care with hydration and oxygen as needed", isCorrect: true },
          { key: "D", text: "Chest CT as first-line investigation", isCorrect: false },
          { key: "E", text: "High-dose steroids for all patients", isCorrect: false },
        ],
        explanation: "Supportive care is the mainstay of bronchiolitis treatment.",
        citations: [{ type: "internal", source: sourcePath, page: 1, url: null, title: sourceLabel }],
        tags: requestedTags.length > 0 ? requestedTags : ["general-paediatrics/respiratory"],
        curriculum: "General Paediatrics",
        why_others_wrong: {
          A: "Antibiotics are not routinely indicated for uncomplicated bronchiolitis.",
          B: "Disposition depends on severity, feeding, and oxygenation.",
          C: null,
          D: "Chest CT is not a routine first-line investigation for bronchiolitis.",
          E: "Steroids are not routinely recommended for uncomplicated bronchiolitis.",
        },
        key_takeaways: [
          "Bronchiolitis is managed mainly with supportive care.",
          "Hydration and oxygenation guide escalation.",
          "Routine antibiotics are not indicated for uncomplicated cases.",
        ],
        moduleCode: null,
        difficulty: "Intermediate",
        ausScore: 2,
      }),
    })

    expect(result).toEqual({ done: 2, failed: 0 })
    expect(getJobCounts(dbPath)).toEqual({
      queued: 0,
      running: 0,
      done: 2,
      failed: 0,
      total: 2,
    })

    const draftFiles = (await fs.readdir(path.join(repoRoot, "drafts"))).sort()
    expect(draftFiles).toHaveLength(2)
    expect(draftFiles).toEqual(jobs.map((job) => `${job.id}.json`).sort())

    for (const fileName of draftFiles) {
      const filePath = path.join(repoRoot, "drafts", fileName)
      const parsed = questionSchema.parse(JSON.parse(await fs.readFile(filePath, "utf8")))
      expect(parsed.status).toBe("draft")
      expect(parsed.createdBy).toBe("ai")
      expect(parsed.tags).toContain("general-paediatrics/respiratory")
      expect(parsed.options).toHaveLength(5)
      expect(parsed.citations[0]?.source).toBe("source.txt")
    }
  })

  it("reclaims stale running jobs for a new worker", async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cah-generate-stale-"))
    temporaryDirectories.push(repoRoot)
    await fs.mkdir(path.join(repoRoot, "tools", "generate"), { recursive: true })

    const sourcePath = path.join(repoRoot, "source.txt")
    await fs.writeFile(sourcePath, sampleSource, "utf8")
    const dbPath = path.join(repoRoot, "tools", "generate", "jobs.db")

    enqueueJobs({
      batch: "bronchiolitis-batch",
      sourcePath,
      tags: ["general-paediatrics/respiratory"],
      count: 1,
      dbPath,
    })

    const firstClaim = claimQueuedJobs({
      limit: 1,
      dbPath,
      workerId: "worker-a",
    })
    expect(firstClaim).toHaveLength(1)

    await new Promise((resolve) => setTimeout(resolve, 10))

    const reclaimed = claimQueuedJobs({
      limit: 1,
      dbPath,
      workerId: "worker-b",
      staleAfterMs: 0,
    })
    expect(reclaimed).toHaveLength(1)
    expect(getJobCounts(dbPath).running).toBe(1)
  })

  it("partitions long sources across ordinal windows", () => {
    const longSource = Array.from({ length: 1200 }, (_, index) => `Paragraph ${index}`).join("\n\n")

    const first = buildSourceExcerpt(longSource, { maxChars: 200, ordinal: 1, total: 3 })
    const middle = buildSourceExcerpt(longSource, { maxChars: 200, ordinal: 2, total: 3 })
    const last = buildSourceExcerpt(longSource, { maxChars: 200, ordinal: 3, total: 3 })

    expect(first.start).toBeLessThan(middle.start)
    expect(middle.start).toBeLessThan(last.start)
    expect(first.text).not.toEqual(middle.text)
    expect(middle.text).not.toEqual(last.text)
  })

  it("keeps short sources in full-text mode", () => {
    const excerpt = buildSourceExcerpt(sampleSource, { maxChars: sampleSource.length + 10, ordinal: 2, total: 4 })

    expect(excerpt.truncated).toBe(false)
    expect(excerpt.start).toBe(0)
    expect(excerpt.end).toBe(sampleSource.length)
    expect(excerpt.text).toBe(sampleSource)
  })

  it("ignores terminal updates from the wrong worker", async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cah-generate-owner-"))
    temporaryDirectories.push(repoRoot)
    await fs.mkdir(path.join(repoRoot, "tools", "generate"), { recursive: true })

    const sourcePath = path.join(repoRoot, "source.txt")
    await fs.writeFile(sourcePath, sampleSource, "utf8")
    const dbPath = path.join(repoRoot, "tools", "generate", "jobs.db")

    const [job] = enqueueJobs({
      batch: "bronchiolitis-batch",
      sourcePath,
      tags: ["general-paediatrics/respiratory"],
      count: 1,
      dbPath,
    })

    const [claimed] = claimQueuedJobs({
      limit: 1,
      dbPath,
      workerId: "worker-a",
    })

    expect(claimed?.id).toBe(job?.id)

    const markedDone = markJobDone({
      dbPath,
      jobId: claimed!.id,
      workerId: "worker-b",
      output: {
        questionId: claimed!.id,
        draftPath: `/tmp/${claimed!.id}.json`,
        model: "gpt-5.4-mini",
      },
    })

    expect(markedDone).toBe(false)
    expect(getJobCounts(dbPath)).toEqual({
      queued: 0,
      running: 1,
      done: 0,
      failed: 0,
      total: 1,
    })
  })

  it("promotes reviewed AI drafts into published reviewed records", async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cah-generate-promote-"))
    temporaryDirectories.push(repoRoot)
    await fs.mkdir(path.join(repoRoot, "drafts"), { recursive: true })
    await fs.mkdir(path.join(repoRoot, "questions"), { recursive: true })

    const id = "00000000-0000-4000-8000-000000000321"
    const draftPath = path.join(repoRoot, "drafts", `${id}.json`)
    await fs.writeFile(
      draftPath,
      `${JSON.stringify(
        {
          id,
          stem: "Which step is most appropriate?",
          questionType: "SBA",
          options: [
            { key: "A", text: "A", isCorrect: false },
            { key: "B", text: "B", isCorrect: true },
          ],
          explanation: "Because B is correct.",
          citations: [{ type: "internal", source: "source.txt", title: "Reviewed excerpt" }],
          tags: ["general-paediatrics"],
          curriculum: "General Paediatrics",
          status: "draft",
          createdBy: "ai",
          createdAt: "2026-04-22T00:00:00.000Z",
          sourceFingerprint: "promote-fingerprint",
          source: {},
        },
        null,
        2,
      )}\n`,
      "utf8",
    )

    const result = await promoteDraft({ repoRoot, id })
    const published = questionSchema.parse(JSON.parse(await fs.readFile(result.publishedPath, "utf8")))

    expect(published.status).toBe("published")
    expect(published.createdBy).toBe("ai")
    expect((published.source as Record<string, unknown>).review).toBeTruthy()
    expect(await fs.stat(result.publishedPath)).toBeTruthy()
    await expect(fs.access(draftPath)).rejects.toMatchObject({ code: "ENOENT" })
  })
})
