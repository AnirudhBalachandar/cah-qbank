import { Prisma, PrismaClient, PracticeMode, TagKind } from "@prisma/client"

import { BASE_RATING, updateEloRating } from "./elo"
import { prisma as defaultPrisma } from "./prisma"

type DB = PrismaClient | Prisma.TransactionClient

const DEFAULT_QUESTION_COUNT = 20
const DEFAULT_RECENT_SESSION_LIMIT = 6
const QUESTION_PAGE_SIZE = 30
const MAX_QUESTION_PAGE_SIZE = 50
const DASHBOARD_TREND_DAYS = 30
const DASHBOARD_HEATMAP_DAYS = 56
const CURRICULUM_COMPLETION_ACCURACY_THRESHOLD = 80
const CURRICULUM_COMPLETION_ELO_THRESHOLD = 1100

const questionWithRelations = Prisma.validator<Prisma.QuestionInclude>()({
  tags: { include: { tag: true } },
  attempts: true,
  flag: true,
  note: true,
})

const attemptWithQuestion = Prisma.validator<Prisma.AttemptSelect>()({
  id: true,
  isCorrect: true,
  createdAt: true,
  timeSpentMs: true,
  question: {
    select: {
      curriculum: true,
    },
  },
})

type DbQuestion = Prisma.QuestionGetPayload<{
  include: typeof questionWithRelations
}>

type DashboardAttempt = Prisma.AttemptGetPayload<{
  select: typeof attemptWithQuestion
}>

export type QuestionSortField = "createdAt" | "stem" | "curriculum" | "difficulty" | "score" | "attempts"
export type SortDirection = "asc" | "desc"

export type QuestionRecord = {
  id: string
  stem: string
  questionType: string
  options: Array<{ key: string; text: string; isCorrect: boolean | null }>
  explanation: string | null
  citations: Array<Record<string, unknown>>
  rationale: string | null
  optionExplanations: Record<string, string>
  curriculum: string
  createdBy: string
  createdAt: Date
  difficulty: string | null
  ausScore: number | null
  moduleCode: string | null
  sourceFingerprint: string
  source: Record<string, unknown>
  isAnswerable: boolean
  correctKey: string | null
  tags: Array<{ slug: string; name: string; kind: TagKind }>
  flagged: boolean
  noteMarkdown: string
  attemptCount: number
  correctCount: number
}

export type QuestionListRow = QuestionRecord & {
  topic: string
  yourScorePercent: number | null
}

export type QuestionListInput = {
  q?: string
  curriculum?: string
  difficulty?: string
  flagged?: boolean
  sort?: QuestionSortField
  direction?: SortDirection
  page?: number
  pageSize?: number
  tag?: string
}

export type QuestionListResult = {
  page: number
  total: number
  pageCount: number
  pageSize: number
  questions: QuestionListRow[]
  filters: Required<Omit<QuestionListInput, "tag">> & { tag?: string }
  curriculumOptions: string[]
  difficultyOptions: string[]
}

export type DashboardTrendPoint = {
  date: string
  score: number | null
  attempts: number
}

export type DashboardHeatmapPoint = {
  date: string
  value: number
}

export type DashboardTopicDistributionPoint = {
  topic: string
  count: number
  percentage: number
}

export type DashboardSessionBarPoint = {
  id: string
  mode: PracticeMode
  createdAt: Date
  completedAt: Date | null
  answered: number
  correct: number
  score: number
  label: string
}

export type DashboardData = {
  publishedCount: number
  answerableCount: number
  flaggedCount: number
  noteCount: number
  accuracyPercent: number
  totalTimeSpent: number
  currentStreak: number
  modulesCompleted: number
  trendData: DashboardTrendPoint[]
  topicDistribution: DashboardTopicDistributionPoint[]
  heatmapData: DashboardHeatmapPoint[]
  sessionsBarData: DashboardSessionBarPoint[]
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10)
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

function addUtcDays(value: Date, days: number) {
  const next = new Date(value)
  next.setUTCDate(next.getUTCDate() + days)
  return startOfUtcDay(next)
}

function roundPercentage(value: number) {
  return Math.round(value * 10) / 10
}

function computeAccuracyPercent(correct: number, total: number) {
  if (total === 0) return 0
  return roundPercentage((correct / total) * 100)
}

function normalizeQuestionListInput(input: QuestionListInput = {}) {
  const q = typeof input.q === "string" ? input.q.trim() : ""
  const curriculum = typeof input.curriculum === "string" ? input.curriculum.trim() : ""
  const difficulty = typeof input.difficulty === "string" ? input.difficulty.trim() : ""
  const tag = typeof input.tag === "string" ? input.tag.trim() : ""
  const sort: QuestionSortField =
    input.sort && ["createdAt", "stem", "curriculum", "difficulty", "score", "attempts"].includes(input.sort)
      ? input.sort
      : "createdAt"
  const direction: SortDirection = input.direction === "asc" ? "asc" : "desc"
  const page = clamp(Number(input.page ?? 1) || 1, 1, 10_000)
  const pageSize = clamp(Number(input.pageSize ?? QUESTION_PAGE_SIZE) || QUESTION_PAGE_SIZE, 1, MAX_QUESTION_PAGE_SIZE)

  return {
    q,
    curriculum,
    difficulty,
    flagged: Boolean(input.flagged),
    sort,
    direction,
    page,
    pageSize,
    ...(tag ? { tag } : {}),
  }
}

function getCorrectOptionKey(question: Pick<DbQuestion, "options">) {
  const options = question.options as Array<{ key: string; isCorrect: boolean | null }>
  const correct = options.find((option) => option.isCorrect === true)
  return correct?.key ?? null
}

function mapQuestion(question: DbQuestion): QuestionRecord {
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

function getQuestionScorePercent(question: Pick<QuestionRecord, "attemptCount" | "correctCount">) {
  if (question.attemptCount === 0) return null
  return computeAccuracyPercent(question.correctCount, question.attemptCount)
}

function toQuestionListRow(question: DbQuestion): QuestionListRow {
  const mapped = mapQuestion(question)
  return {
    ...mapped,
    topic: mapped.curriculum,
    yourScorePercent: getQuestionScorePercent(mapped),
  }
}

function compareNullableText(left: string | null | undefined, right: string | null | undefined) {
  return (left ?? "").localeCompare(right ?? "", undefined, { sensitivity: "base" })
}

function compareQuestionRows(
  left: QuestionListRow,
  right: QuestionListRow,
  sort: QuestionSortField,
  direction: SortDirection,
) {
  const factor = direction === "asc" ? 1 : -1

  let base = 0
  switch (sort) {
    case "stem":
      base = left.stem.localeCompare(right.stem, undefined, { sensitivity: "base" })
      break
    case "curriculum":
      base = left.curriculum.localeCompare(right.curriculum, undefined, { sensitivity: "base" })
      break
    case "difficulty":
      base = compareNullableText(left.difficulty, right.difficulty)
      break
    case "score":
      base = (left.yourScorePercent ?? -1) - (right.yourScorePercent ?? -1)
      break
    case "attempts":
      base = left.attemptCount - right.attemptCount
      break
    case "createdAt":
    default:
      base = left.createdAt.getTime() - right.createdAt.getTime()
      break
  }

  if (base !== 0) return base * factor
  return left.stem.localeCompare(right.stem, undefined, { sensitivity: "base" })
}

function buildQuestionWhere(input: ReturnType<typeof normalizeQuestionListInput>): Prisma.QuestionWhereInput {
  return {
    status: "published",
    ...(input.q
      ? {
          OR: [
            { stem: { contains: input.q } },
            { explanation: { contains: input.q } },
            { rationale: { contains: input.q } },
          ],
        }
      : {}),
    ...(input.curriculum ? { curriculum: input.curriculum } : {}),
    ...(input.difficulty ? { difficulty: input.difficulty } : {}),
    ...(input.flagged ? { flag: { isNot: null } } : {}),
    ...(input.tag
      ? {
          tags: {
            some: { tagId: input.tag },
          },
        }
      : {}),
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

async function listCurriculumOptions(db: DB = defaultPrisma) {
  const rows = await db.question.findMany({
    where: { status: "published" },
    distinct: ["curriculum"],
    select: { curriculum: true },
    orderBy: { curriculum: "asc" },
  })

  return rows.map((row) => row.curriculum)
}

async function listDifficultyOptions(db: DB = defaultPrisma) {
  const rows = await db.question.findMany({
    where: {
      status: "published",
      NOT: { difficulty: null },
    },
    distinct: ["difficulty"],
    select: { difficulty: true },
    orderBy: { difficulty: "asc" },
  })

  return rows.map((row) => row.difficulty).filter((value): value is string => Boolean(value))
}

function formatSessionLabel(session: DashboardSessionBarPoint) {
  const mode = session.mode.charAt(0).toUpperCase() + session.mode.slice(1)
  const date = session.createdAt.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  })
  return `${mode} · ${date}`
}

function buildTrendData(attempts: DashboardAttempt[]) {
  const today = startOfUtcDay(new Date())
  const dayStarts = Array.from({ length: DASHBOARD_TREND_DAYS }, (_, index) =>
    addUtcDays(today, index - (DASHBOARD_TREND_DAYS - 1)),
  )

  const attemptsByDay = new Map<string, { total: number; correct: number }>()
  for (const attempt of attempts) {
    const key = toIsoDate(attempt.createdAt)
    const current = attemptsByDay.get(key) ?? { total: 0, correct: 0 }
    current.total += 1
    if (attempt.isCorrect) {
      current.correct += 1
    }
    attemptsByDay.set(key, current)
  }

  return dayStarts.map((dayStart) => {
    const key = toIsoDate(dayStart)
    const stats = attemptsByDay.get(key)

    return {
      date: key,
      score: stats ? computeAccuracyPercent(stats.correct, stats.total) : null,
      attempts: stats?.total ?? 0,
    }
  })
}

function buildHeatmapData(attempts: DashboardAttempt[]) {
  const today = startOfUtcDay(new Date())
  const dayStarts = Array.from({ length: DASHBOARD_HEATMAP_DAYS }, (_, index) =>
    addUtcDays(today, index - (DASHBOARD_HEATMAP_DAYS - 1)),
  )

  const counts = new Map<string, number>()
  for (const attempt of attempts) {
    const key = toIsoDate(attempt.createdAt)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return dayStarts.map((dayStart) => {
    const key = toIsoDate(dayStart)
    return {
      date: key,
      value: counts.get(key) ?? 0,
    }
  })
}

function computeCurrentStreak(attempts: DashboardAttempt[]) {
  const newestFirst = [...attempts].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
  let streak = 0
  for (const attempt of newestFirst) {
    if (!attempt.isCorrect) break
    streak += 1
  }
  return streak
}

function buildTopicDistribution(curriculumCounts: Map<string, number>) {
  const total = Array.from(curriculumCounts.values()).reduce((sum, count) => sum + count, 0)
  const rows = Array.from(curriculumCounts.entries())
    .map(([topic, count]) => ({
      topic,
      count,
      percentage: total === 0 ? 0 : roundPercentage((count / total) * 100),
    }))
    .sort((left, right) => right.count - left.count)

  return rows
}

function computeModulesCompleted(params: {
  answerableCurricula: string[]
  attempts: DashboardAttempt[]
  masteryRows: Array<{ tagId: string; elo: number; tag: { name: string; kind: TagKind } }>
}) {
  const attemptsByCurriculum = new Map<string, { total: number; correct: number }>()
  for (const attempt of params.attempts) {
    const curriculum = attempt.question.curriculum
    const stats = attemptsByCurriculum.get(curriculum) ?? { total: 0, correct: 0 }
    stats.total += 1
    if (attempt.isCorrect) {
      stats.correct += 1
    }
    attemptsByCurriculum.set(curriculum, stats)
  }

  const eloByCurriculum = new Map(
    params.masteryRows
      .filter((row) => row.tag.kind === TagKind.curriculum)
      .map((row) => [row.tag.name, row.elo]),
  )

  let completed = 0
  for (const curriculum of params.answerableCurricula) {
    const attemptStats = attemptsByCurriculum.get(curriculum)
    if (!attemptStats || attemptStats.total === 0) continue

    const accuracy = computeAccuracyPercent(attemptStats.correct, attemptStats.total)
    const elo = eloByCurriculum.get(curriculum) ?? 0
    if (
      accuracy >= CURRICULUM_COMPLETION_ACCURACY_THRESHOLD &&
      elo >= CURRICULUM_COMPLETION_ELO_THRESHOLD
    ) {
      completed += 1
    }
  }

  return completed
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

async function listBrowseTags(db: DB = defaultPrisma) {
  const tags = await listPracticeTags(db)
  return tags.filter((tag) => tag.kind === TagKind.topic)
}

export async function getDashboardData(db: DB = defaultPrisma): Promise<DashboardData> {
  const [
    publishedCount,
    answerableCount,
    flaggedCount,
    noteCount,
    attempts,
    sessions,
    answerableQuestions,
    masteryRows,
  ] = await Promise.all([
    db.question.count({ where: { status: "published" } }),
    db.question.count({ where: { status: "published", isAnswerable: true } }),
    db.flag.count(),
    db.userNote.count(),
    db.attempt.findMany({
      select: attemptWithQuestion,
      orderBy: { createdAt: "asc" },
    }),
    db.practiceSession.findMany({
      orderBy: { createdAt: "desc" },
      take: DEFAULT_RECENT_SESSION_LIMIT,
      include: {
        attempts: true,
      },
    }),
    db.question.findMany({
      where: {
        status: "published",
        isAnswerable: true,
      },
      select: {
        curriculum: true,
      },
    }),
    db.tagMastery.findMany({
      include: {
        tag: true,
      },
    }),
  ])

  const correctAttempts = attempts.filter((attempt) => attempt.isCorrect).length
  const totalTimeSpent = attempts.reduce((sum, attempt) => sum + (attempt.timeSpentMs ?? 0), 0)
  const curriculumCounts = new Map<string, number>()
  for (const question of answerableQuestions) {
    curriculumCounts.set(question.curriculum, (curriculumCounts.get(question.curriculum) ?? 0) + 1)
  }

  const sessionsBarData: DashboardSessionBarPoint[] = sessions
    .map((session) => {
      const answered = session.attempts.length
      const correct = session.attempts.filter((attempt) => attempt.isCorrect).length
      const row: DashboardSessionBarPoint = {
        id: session.id,
        mode: session.mode,
        createdAt: session.createdAt,
        completedAt: session.completedAt,
        answered,
        correct,
        score: computeAccuracyPercent(correct, answered),
        label: "",
      }

      return {
        ...row,
        label: formatSessionLabel(row),
      }
    })
    .reverse()

  return {
    publishedCount,
    answerableCount,
    flaggedCount,
    noteCount,
    accuracyPercent: computeAccuracyPercent(correctAttempts, attempts.length),
    totalTimeSpent,
    currentStreak: computeCurrentStreak(attempts),
    modulesCompleted: computeModulesCompleted({
      answerableCurricula: Array.from(curriculumCounts.keys()),
      attempts,
      masteryRows,
    }),
    trendData: buildTrendData(attempts),
    topicDistribution: buildTopicDistribution(curriculumCounts),
    heatmapData: buildHeatmapData(attempts),
    sessionsBarData,
  }
}

export async function startPracticeSession(
  input: { tagId?: string | null; questionCount?: number; questionId?: string | null },
  db: DB = defaultPrisma,
) {
  const count = Math.max(1, Math.min(input.questionCount ?? DEFAULT_QUESTION_COUNT, 100))
  const questionId = input.questionId?.trim() ?? ""

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
    ...(questionId ? { id: questionId } : {}),
  }

  const [questions, currentMastery] = await Promise.all([
    db.question.findMany({
      where,
      include: questionWithRelations,
      take: questionId ? 1 : 1500,
    }),
    masteryMap(db),
  ])

  if (questions.length === 0) {
    return null
  }

  const orderedQuestions = questionId
    ? questions
    : [...questions]
        .sort((left, right) => {
          const leftScore = rankQuestion({ question: left, masteryByTag: currentMastery })
          const rightScore = rankQuestion({ question: right, masteryByTag: currentMastery })
          if (leftScore !== rightScore) return rightScore - leftScore
          return left.createdAt.getTime() - right.createdAt.getTime()
        })
        .slice(0, count)

  const session = await db.practiceSession.create({
    data: {
      mode: input.tagId || questionId ? PracticeMode.custom : PracticeMode.revision,
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
    include: questionWithRelations,
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
      include: questionWithRelations,
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

async function getAllQuestionListRows(
  input: QuestionListInput = {},
  db: DB = defaultPrisma,
){
  const filters = normalizeQuestionListInput(input)
  const where = buildQuestionWhere(filters)

  const [questions, curriculumOptions, difficultyOptions] = await Promise.all([
    db.question.findMany({
      where,
      include: questionWithRelations,
    }),
    listCurriculumOptions(db),
    listDifficultyOptions(db),
  ])

  const allRows = questions.map(toQuestionListRow).sort((left, right) =>
    compareQuestionRows(left, right, filters.sort, filters.direction),
  )

  return {
    allRows,
    total: allRows.length,
    filters,
    curriculumOptions,
    difficultyOptions,
  }
}

export async function getQuestionListData(
  input: QuestionListInput = {},
  db: DB = defaultPrisma,
): Promise<QuestionListResult> {
  const rows = await getAllQuestionListRows(input, db)
  const pageCount = Math.max(1, Math.ceil(rows.total / rows.filters.pageSize))
  const page = clamp(rows.filters.page, 1, pageCount)
  const start = (page - 1) * rows.filters.pageSize

  return {
    page,
    total: rows.total,
    pageCount,
    pageSize: rows.filters.pageSize,
    questions: rows.allRows.slice(start, start + rows.filters.pageSize),
    filters: rows.filters,
    curriculumOptions: rows.curriculumOptions,
    difficultyOptions: rows.difficultyOptions,
  }
}

function escapeCsvValue(value: string | number | boolean | null) {
  const text = value === null ? "" : String(value)
  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replaceAll("\"", "\"\"")}"`
  }
  return text
}

export async function getQuestionListCsv(
  input: QuestionListInput = {},
  db: DB = defaultPrisma,
) {
  const rows = await getAllQuestionListRows(
    {
      ...input,
      page: 1,
      pageSize: MAX_QUESTION_PAGE_SIZE,
    },
    db,
  )

  const header = [
    "id",
    "title",
    "curriculum",
    "difficulty",
    "flagged",
    "attempts",
    "correct",
    "scorePercent",
    "answerable",
    "moduleCode",
  ]

  const body = rows.allRows.map((question) =>
    [
      question.id,
      question.stem,
      question.curriculum,
      question.difficulty ?? "",
      question.flagged,
      question.attemptCount,
      question.correctCount,
      question.yourScorePercent ?? "",
      question.isAnswerable,
      question.moduleCode ?? "",
    ]
      .map(escapeCsvValue)
      .join(","),
  )

  return [header.join(","), ...body].join("\n")
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
  const [data, tagOptions] = await Promise.all([
    getQuestionListData(
      {
        page: input.page,
        q: input.search,
        curriculum: input.curriculum,
        tag: input.tag,
      },
      db,
    ),
    listBrowseTags(db),
  ])

  return {
    page: data.page,
    total: data.total,
    pageCount: data.pageCount,
    questions: data.questions,
    tagOptions,
  }
}

export async function getQuestionDetail(questionId: string, db: DB = defaultPrisma) {
  const question = await db.question.findUnique({
    where: { id: questionId },
    include: questionWithRelations,
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
