import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { questionSchema } from "@cah/domain"
import { afterEach, describe, expect, it } from "vitest"

import { enqueueJobs, getJobCounts } from "../src/storage.js"
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
      generator: async ({ requestedTags, ordinal }) => ({
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
        citations: [{ type: "internal", source: "source.txt", page: 1, url: null, title: "Bronchiolitis notes" }],
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

    for (const fileName of draftFiles) {
      const filePath = path.join(repoRoot, "drafts", fileName)
      const parsed = questionSchema.parse(JSON.parse(await fs.readFile(filePath, "utf8")))
      expect(parsed.status).toBe("draft")
      expect(parsed.createdBy).toBe("ai")
      expect(parsed.tags).toContain("general-paediatrics/respiratory")
      expect(parsed.options).toHaveLength(5)
    }
  })
})
