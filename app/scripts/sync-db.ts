import { Prisma } from "@prisma/client"
import { isQuestionAnswerable } from "@cah/domain"

import { prisma } from "../lib/prisma"
import { collectTagDescriptors, loadAllQuestions, projectLearnerTagSlugs } from "../lib/question-files"

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function asJson(value: unknown) {
  return value as Prisma.InputJsonValue
}

async function upsertTags() {
  const questions = await loadAllQuestions()
  const tags = collectTagDescriptors(questions)

  for (const batch of chunk(tags, 100)) {
    await prisma.$transaction(
      batch.map((tag) =>
        prisma.tag.upsert({
          where: { slug: tag.slug },
          create: {
            slug: tag.slug,
            name: tag.name,
            kind: tag.kind,
            parentSlug: tag.parentSlug,
          },
          update: {
            name: tag.name,
            kind: tag.kind,
            parentSlug: tag.parentSlug,
          },
        }),
      ),
    )
  }

  return { questions, tags }
}

async function upsertQuestions() {
  const { questions, tags } = await upsertTags()
  const questionIds = questions.map((question) => question.id)
  const tagIds = tags.map((tag) => tag.slug)

  for (const batch of chunk(questions, 50)) {
    await prisma.$transaction(
      batch.map((question) =>
        prisma.question.upsert({
          where: { id: question.id },
          create: {
            id: question.id,
            stem: question.stem,
            questionType: question.questionType,
            options: asJson(question.options),
            explanation: question.explanation,
            citations: asJson(question.citations),
            curriculum: question.curriculum,
            status: question.status,
            createdBy: question.createdBy,
            createdAt: new Date(question.createdAt),
            sourceFingerprint: question.sourceFingerprint,
            rationale: question.rationale ?? null,
            optionExplanations: asJson(question.optionExplanations ?? {}),
            moduleCode: question.moduleCode ?? null,
            difficulty: question.difficulty ?? null,
            ausScore: question.ausScore ?? null,
            source: asJson(question.source ?? {}),
            isAnswerable: isQuestionAnswerable(question),
          },
          update: {
            stem: question.stem,
            questionType: question.questionType,
            options: asJson(question.options),
            explanation: question.explanation,
            citations: asJson(question.citations),
            curriculum: question.curriculum,
            status: question.status,
            createdBy: question.createdBy,
            createdAt: new Date(question.createdAt),
            sourceFingerprint: question.sourceFingerprint,
            rationale: question.rationale ?? null,
            optionExplanations: asJson(question.optionExplanations ?? {}),
            moduleCode: question.moduleCode ?? null,
            difficulty: question.difficulty ?? null,
            ausScore: question.ausScore ?? null,
            source: asJson(question.source ?? {}),
            isAnswerable: isQuestionAnswerable(question),
          },
        }),
      ),
    )
  }

  await prisma.questionTag.deleteMany(
    questionIds.length > 0
      ? {
          where: { questionId: { in: questionIds } },
        }
      : undefined,
  )

  const questionTags = questions.flatMap((question) =>
    projectLearnerTagSlugs(question).map((tagId) => ({ questionId: question.id, tagId })),
  )

  for (const batch of chunk(questionTags, 500)) {
    await prisma.questionTag.createMany({
      data: batch,
    })
  }

  await prisma.question.deleteMany(
    questionIds.length > 0
      ? {
          where: { id: { notIn: questionIds } },
        }
      : undefined,
  )
  await prisma.tag.deleteMany(
    tagIds.length > 0
      ? {
          where: { slug: { notIn: tagIds } },
        }
      : undefined,
  )

  return {
    questionCount: questions.length,
    publishedCount: questions.filter((question) => question.status === "published").length,
    draftCount: questions.filter((question) => question.status === "draft").length,
    answerablePublishedCount: questions.filter(
      (question) => question.status === "published" && isQuestionAnswerable(question),
    ).length,
    tagCount: tags.length,
    questionTagCount: questionTags.length,
  }
}

async function main() {
  const startedAt = Date.now()
  const summary = await upsertQuestions()
  const elapsedMs = Date.now() - startedAt

  console.log(
    JSON.stringify(
      {
        ...summary,
        elapsedMs,
      },
      null,
      2,
    ),
  )
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
