import { Prisma, PrismaClient, PracticeMode, TagKind } from "@prisma/client"

import { BASE_RATING, updateEloRating } from "./elo"
import { prisma as defaultPrisma } from "./prisma"

type DB = PrismaClient | Prisma.TransactionClient

const DEFAULT_QUESTION_COUNT = 20
const QUESTION_PAGE_SIZE = 30

type DbQuestion = Prisma.QuestionGetPayload<{
  include: {
    tags: { include: { tag: true } }
    attempts: true
    flag: true
    note: true
  }
}>

function getCorrectOptionKey(question: Pick<DbQuestion, "options">) {
  const options = question.options as Array<{ key: string; isCorrect: boolean | null }>
  const correct = options.find((option) => option.isCorrect === true)
  return correct?.key ?? null
}

function mapQuestion(question: DbQuestion) {
  return {
    id: question.id,
    stem: question.stem,
    questionType: question.questionType,
    options: question.options as Array<{ key: string; text: string; isCorrect: boolean | null }>,
    explanation: question.explanation,
    citations: question.citations as Array<Record<string, unknown>>,
    rationale: question.rationale,
    optionExplanations: question.optionExplanations as Record<string, string>,
    curriculum: question.curriculum,
    createdBy: question.createdBy,
    createdAt: question.createdAt,
    difficulty: question.difficulty,
    ausScore: question.ausScore,
    moduleCode: question.moduleCode,
    sourceFingerprint: question.sourceFingerprint,
    source: question.source as Record<string, unknown>,
    isAnswerable: question.isAnswerable,
    correctKey: getCorrectOptionKey(question),
    tags: question.tags.map((entry) => ({
      slug: entry.tag.slug,
      name: entry.tag.name,
      kind: entry.tag.kind,
    })),
    flagged: Boolean(question.flag),
    noteMarkdown: question.note?.noteMarkdown ?? "",
    attemptCount: question.attempts.length,
    correctCount: question.attempts.filter((attempt) => attempt.isCorrect).length,
  }
}

function rankQuestion(params: {
  question: Pick<DbQuestion, "attempts" | "tags" | "difficulty" | "createdAt">
  masteryByTag: Map<string, number>
}) {
  const relevantTags = params.question.tags.filter((entry) => entry.tag.kind !== TagKind.meta)
  const weaknessScores = relevantTags.map((entry) => BASE_RATING - (params.masteryByTag.get(entry.tag.slug) ?? BASE_RATING))
  const averageWeakness =
    weaknessScores.length > 0
      ? weaknessScores.reduce((sum, score) => sum + score, 0) / weaknessScores.length
      : 0

  const attemptCount = params.question.attempts.length
  const correctCount = params.question.attempts.filter((attempt) => attempt.isCorrect).length
  const incorrectRate = attemptCount === 0 ? 0.6 : (attemptCount - correctCount) / attemptCount
  const unseenBoost = attemptCount === 0 ? 50 : 0

  return averageWeakness + incorrectRate * 30 + unseenBoost
}

async function masteryMap(db: DB) {
  const rows = await db.tagMastery.findMany({
    select: { tagId: true, elo: true },
  })
  return new Map(rows.map((row) => [row.tagId, row.elo]))
}

export async function listPracticeTags(db: DB = defaultPrisma) {
  const tags = await db.tag.findMany({
    where: {
      kind: { in: [TagKind.curriculum, TagKind.topic] },
      questions: {
        some: {
          question: {
            status: "published",
            isAnswerable: true,
          },
        },
      },
    },
    include: {
      mastery: true,
      questions: {
        include: {
          question: {
            select: { isAnswerable: true, status: true },
          },
        },
      },
    },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  })

  return tags.map((tag) => ({
    slug: tag.slug,
    name: tag.name,
    kind: tag.kind,
    questionCount: tag.questions.filter(
      (entry) => entry.question.status === "published" && entry.question.isAnswerable,
    ).length,
    elo: tag.mastery?.elo ?? BASE_RATING,
  }))
}

export async function getDashboardData(db: DB = defaultPrisma) {
  const [publishedCount, answerableCount, flaggedCount, noteCount, weakTags, recentSessions] =
    await Promise.all([
      db.question.count({ where: { status: "published" } }),
      db.question.count({ where: { status: "published", isAnswerable: true } }),
      db.flag.count(),
      db.userNote.count(),
      db.tagMastery.findMany({
        include: { tag: true },
        orderBy: { elo: "asc" },
        take: 5,
      }),
      db.practiceSession.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { attempts: true },
      }),
    ])

  return {
    publishedCount,
    answerableCount,
    flaggedCount,
    noteCount,
    weakTags: weakTags.map((row) => ({
      slug: row.tag.slug,
      name: row.tag.name,
      elo: row.elo,
      attempts: row.attemptCount,
    })),
    recentSessions: recentSessions.map((session) => ({
      id: session.id,
      mode: session.mode,
      createdAt: session.createdAt,
      completedAt: session.completedAt,
      answered: session.attempts.length,
      correct: session.attempts.filter((attempt) => attempt.isCorrect).length,
    })),
  }
}

export async function startPracticeSession(
  input: { tagId?: string | null; questionCount?: number },
  db: DB = defaultPrisma,
) {
  const count = Math.max(1, Math.min(input.questionCount ?? DEFAULT_QUESTION_COUNT, 100))
  const where: Prisma.QuestionWhereInput = {
    status: "published",
    isAnswerable: true,
    ...(input.tagId
      ? {
          tags: {
            some: { tagId: input.tagId },
          },
        }
      : {}),
  }

  const [questions, currentMastery] = await Promise.all([
    db.question.findMany({
      where,
      include: {
        tags: { include: { tag: true } },
        attempts: true,
        flag: true,
        note: true,
      },
      take: 1500,
    }),
    masteryMap(db),
  ])

  if (questions.length === 0) {
    return null
  }

  const orderedQuestions = [...questions]
    .sort((left, right) => {
      const leftScore = rankQuestion({ question: left, masteryByTag: currentMastery })
      const rightScore = rankQuestion({ question: right, masteryByTag: currentMastery })
      if (leftScore !== rightScore) return rightScore - leftScore
      return left.createdAt.getTime() - right.createdAt.getTime()
    })
    .slice(0, count)

  const session = await db.practiceSession.create({
    data: {
      mode: input.tagId ? PracticeMode.custom : PracticeMode.revision,
      questionIds: orderedQuestions.map((question) => question.id),
    },
  })

  return session.id
}

export async function getSession(sessionId: string, db: DB = defaultPrisma) {
  const session = await db.practiceSession.findUnique({
    where: { id: sessionId },
    include: {
      attempts: {
        orderBy: { createdAt: "asc" },
      },
    },
  })

  if (!session) return null

  const questionIds = session.questionIds as string[]
  const questions = await db.question.findMany({
    where: { id: { in: questionIds } },
    include: {
      tags: { include: { tag: true } },
      attempts: true,
      flag: true,
      note: true,
    },
  })

  const orderMap = new Map(questionIds.map((id, index) => [id, index]))
  const orderedQuestions = questions
    .map(mapQuestion)
    .sort((left, right) => (orderMap.get(left.id) ?? 0) - (orderMap.get(right.id) ?? 0))

  const answeredByQuestion = new Map(session.attempts.map((attempt) => [attempt.questionId, attempt]))

  return {
    id: session.id,
    mode: session.mode,
    currentIndex: session.currentIndex,
    createdAt: session.createdAt,
    completedAt: session.completedAt,
    questions: orderedQuestions,
    answeredByQuestion,
  }
}

async function updateTagMasteryForQuestion(
  questionId: string,
  isCorrect: boolean,
  db: DB,
) {
  const question = await db.question.findUnique({
    where: { id: questionId },
    include: {
      tags: { include: { tag: true } },
    },
  })

  if (!question) return

  for (const entry of question.tags.filter((tag) => tag.tag.kind !== TagKind.meta)) {
    const current = await db.tagMastery.findUnique({
      where: { tagId: entry.tag.slug },
    })
    const next = updateEloRating({
      currentRating: current?.elo ?? BASE_RATING,
      difficulty: question.difficulty,
      isCorrect,
    })

    await db.tagMastery.upsert({
      where: { tagId: entry.tag.slug },
      create: {
        tagId: entry.tag.slug,
        elo: next.nextRating,
        attemptCount: 1,
        correctCount: isCorrect ? 1 : 0,
      },
      update: {
        elo: next.nextRating,
        attemptCount: { increment: 1 },
        correctCount: isCorrect ? { increment: 1 } : undefined,
      },
    })
  }
}

export async function answerQuestion(
  input: {
    sessionId: string
    questionId: string
    selectedKey: string
    timeSpentMs?: number | null
    confidence?: number | null
  },
  db: PrismaClient = defaultPrisma,
) {
  return db.$transaction(async (tx) => {
    const session = await tx.practiceSession.findUnique({
      where: { id: input.sessionId },
    })
    if (!session) {
      throw new Error("SESSION_NOT_FOUND")
    }

    const questionIds = session.questionIds as string[]
    if (!questionIds.includes(input.questionId)) {
      throw new Error("QUESTION_NOT_IN_SESSION")
    }

    const existingAttempt = await tx.attempt.findUnique({
      where: {
        sessionId_questionId: {
          sessionId: input.sessionId,
          questionId: input.questionId,
        },
      },
    })
    const currentQuestionId =
      questionIds[Math.min(session.currentIndex, Math.max(questionIds.length - 1, 0))] ?? null

    if (!existingAttempt && currentQuestionId !== input.questionId) {
      throw new Error("QUESTION_OUT_OF_SEQUENCE")
    }

    const question = await tx.question.findUnique({
      where: { id: input.questionId },
      include: {
        tags: { include: { tag: true } },
        attempts: true,
        flag: true,
        note: true,
      },
    })
    if (!question) {
      throw new Error("QUESTION_NOT_FOUND")
    }

    const correctKey = getCorrectOptionKey(question)
    const options = question.options as Array<{ key: string; text: string; isCorrect: boolean | null }>
    const correctOption = options.find((option) => option.isCorrect === true)

    if (existingAttempt) {
      return {
        isCorrect: existingAttempt.isCorrect,
        correctKey,
        correctText: correctOption?.text ?? null,
        explanation: question.explanation,
        citations: question.citations as Array<Record<string, unknown>>,
        rationale: question.rationale,
        optionExplanations: question.optionExplanations as Record<string, string>,
        completedAt: Boolean(session.completedAt),
        nextIndex: session.currentIndex,
      }
    }

    const isCorrect = correctKey !== null && correctKey === input.selectedKey

    await tx.attempt.create({
      data: {
        sessionId: input.sessionId,
        questionId: input.questionId,
        selectedKey: input.selectedKey,
        isCorrect,
        confidence: input.confidence ?? null,
        timeSpentMs: input.timeSpentMs ?? null,
      },
    })

    const answeredCount = await tx.attempt.count({
      where: { sessionId: input.sessionId },
    })

    const nextIndex = Math.min(answeredCount, Math.max(questionIds.length - 1, 0))
    await tx.practiceSession.update({
      where: { id: input.sessionId },
      data: {
        currentIndex: nextIndex,
        completedAt: answeredCount >= questionIds.length ? new Date() : null,
      },
    })

    await updateTagMasteryForQuestion(input.questionId, isCorrect, tx)

    return {
      isCorrect,
      correctKey,
      correctText: correctOption?.text ?? null,
      explanation: question.explanation,
      citations: question.citations as Array<Record<string, unknown>>,
      rationale: question.rationale,
      optionExplanations: question.optionExplanations as Record<string, string>,
      completedAt: answeredCount >= questionIds.length,
      nextIndex,
    }
  })
}

export async function toggleFlag(questionId: string, db: DB = defaultPrisma) {
  const existing = await db.flag.findUnique({ where: { questionId } })
  if (existing) {
    await db.flag.delete({ where: { questionId } })
    return false
  }

  await db.flag.create({ data: { questionId } })
  return true
}

export async function saveNote(questionId: string, noteMarkdown: string, db: DB = defaultPrisma) {
  const trimmed = noteMarkdown.trim()
  if (!trimmed) {
    await db.userNote.deleteMany({ where: { questionId } })
    return ""
  }

  const note = await db.userNote.upsert({
    where: { questionId },
    create: { questionId, noteMarkdown: trimmed },
    update: { noteMarkdown: trimmed },
  })

  return note.noteMarkdown
}

export async function endSession(sessionId: string, db: DB = defaultPrisma) {
  await db.practiceSession.update({
    where: { id: sessionId },
    data: { completedAt: new Date() },
  })
}

export async function getBrowseData(
  input: {
    page?: number
    search?: string
    curriculum?: string
    tag?: string
  },
  db: DB = defaultPrisma,
) {
  const page = Math.max(1, input.page ?? 1)
  const where: Prisma.QuestionWhereInput = {
    status: "published",
    ...(input.search
      ? {
          stem: {
            contains: input.search,
          },
        }
      : {}),
    ...(input.curriculum ? { curriculum: input.curriculum } : {}),
    ...(input.tag
      ? {
          tags: {
            some: { tagId: input.tag },
          },
        }
      : {}),
  }

  const [total, questions, tagOptions] = await Promise.all([
    db.question.count({ where }),
    db.question.findMany({
      where,
      include: {
        tags: { include: { tag: true } },
        attempts: true,
        flag: true,
        note: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * QUESTION_PAGE_SIZE,
      take: QUESTION_PAGE_SIZE,
    }),
    listPracticeTags(db),
  ])

  return {
    page,
    total,
    pageCount: Math.max(1, Math.ceil(total / QUESTION_PAGE_SIZE)),
    questions: questions.map(mapQuestion),
    tagOptions,
  }
}

export async function getQuestionDetail(questionId: string, db: DB = defaultPrisma) {
  const question = await db.question.findUnique({
    where: { id: questionId },
    include: {
      tags: { include: { tag: true } },
      attempts: true,
      flag: true,
      note: true,
    },
  })

  if (!question) return null
  return mapQuestion(question)
}

export async function getProgressData(db: DB = defaultPrisma) {
  const [tags, masteryRows] = await Promise.all([
    db.tag.findMany({
      where: {
        kind: { in: [TagKind.curriculum, TagKind.topic] },
        questions: { some: {} },
      },
      include: {
        questions: true,
      },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    }),
    db.tagMastery.findMany(),
  ])

  const masteryByTag = new Map(masteryRows.map((row) => [row.tagId, row]))

  return tags.map((tag) => {
    const mastery = masteryByTag.get(tag.slug)
    return {
      slug: tag.slug,
      name: tag.name,
      kind: tag.kind,
      questionCount: tag.questions.length,
      elo: mastery?.elo ?? BASE_RATING,
      attemptCount: mastery?.attemptCount ?? 0,
      correctCount: mastery?.correctCount ?? 0,
    }
  })
}

export async function getQuestionById(questionId: string, db: DB = defaultPrisma) {
  return getQuestionDetail(questionId, db)
}
