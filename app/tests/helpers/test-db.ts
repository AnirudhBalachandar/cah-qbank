import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { PrismaClient, QuestionType, TagKind } from "@prisma/client"

import { ensureSqliteSchema } from "../../lib/sqlite-schema"

type TestDb = {
  prisma: PrismaClient
  cleanup: () => Promise<void>
}

export async function createTestDb(): Promise<TestDb> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cah-qbank-"))
  const dbPath = path.join(tempDir, "test.db")
  const databaseUrl = `file:${dbPath}`

  await ensureSqliteSchema(databaseUrl)

  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  })

  return {
    prisma,
    cleanup: async () => {
      await prisma.$disconnect()
      await fs.rm(tempDir, { recursive: true, force: true })
    },
  }
}

export async function seedQuestionSet(prisma: PrismaClient, input: {
  tags: Array<{ slug: string; name: string; kind?: TagKind }>
  questions: Array<{
    id: string
    stem: string
    tagSlugs: string[]
    difficulty?: string | null
    correctKey?: string
  }>
}) {
  for (const tag of input.tags) {
    await prisma.tag.create({
      data: {
        slug: tag.slug,
        name: tag.name,
        kind: tag.kind ?? TagKind.curriculum,
      },
    })
  }

  for (const question of input.questions) {
    await prisma.question.create({
      data: {
        id: question.id,
        stem: question.stem,
        questionType: QuestionType.SBA,
        options: [
          { key: "A", text: `${question.id}-A`, isCorrect: question.correctKey === "A" },
          { key: "B", text: `${question.id}-B`, isCorrect: question.correctKey === "B" },
          { key: "C", text: `${question.id}-C`, isCorrect: question.correctKey === "C" },
          { key: "D", text: `${question.id}-D`, isCorrect: question.correctKey === "D" },
          { key: "E", text: `${question.id}-E`, isCorrect: question.correctKey === "E" },
        ],
        explanation: `${question.id} explanation`,
        citations: [],
        curriculum: "General Paediatrics",
        status: "published",
        createdBy: "manual",
        createdAt: new Date("2026-04-22T00:00:00.000Z"),
        sourceFingerprint: `${question.id}-fingerprint`,
        optionExplanations: {},
        source: {},
        isAnswerable: true,
        difficulty: question.difficulty ?? "Intermediate",
        tags: {
          create: question.tagSlugs.map((tagId) => ({
            tag: { connect: { slug: tagId } },
          })),
        },
      },
    })
  }
}
