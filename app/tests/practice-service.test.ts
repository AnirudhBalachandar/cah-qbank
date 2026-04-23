import { beforeEach, describe, expect, it } from "vitest"

import {
  answerQuestion,
  getBrowseData,
  getDashboardData,
  getQuestionDetail,
  getQuestionListCsv,
  getQuestionListData,
  getSession,
  listPracticeTags,
  startPracticeSession,
  toggleFlag,
} from "@/lib/qbank"
import { createTestDb, seedQuestionSet } from "./helpers/test-db"

describe("practice service", () => {
  let cleanup: (() => Promise<void>) | null = null

  beforeEach(async (context) => {
    if (cleanup) {
      await cleanup()
      cleanup = null
    }

    context.onTestFinished(async () => {
      if (cleanup) {
        await cleanup()
        cleanup = null
      }
    })
  })

  it("updates Elo after correct and incorrect answers using the hand-computed formula", async () => {
    const testDb = await createTestDb()
    cleanup = testDb.cleanup

    await seedQuestionSet(testDb.prisma, {
      tags: [{ slug: "general-paediatrics", name: "General Paediatrics" }],
      questions: [
        { id: "q1", stem: "Question 1", tagSlugs: ["general-paediatrics"], correctKey: "B" },
        { id: "q2", stem: "Question 2", tagSlugs: ["general-paediatrics"], correctKey: "C" },
      ],
    })

    const sessionOne = await startPracticeSession(
      { tagId: "general-paediatrics", questionCount: 1 },
      testDb.prisma,
    )
    expect(sessionOne).toBeTruthy()

    await answerQuestion(
      { sessionId: sessionOne!, questionId: "q1", selectedKey: "B" },
      testDb.prisma,
    )

    const afterCorrect = await testDb.prisma.tagMastery.findUniqueOrThrow({
      where: { tagId: "general-paediatrics" },
    })
    expect(afterCorrect.elo).toBeCloseTo(1016, 2)

    const sessionTwo = await startPracticeSession(
      { tagId: "general-paediatrics", questionCount: 2 },
      testDb.prisma,
    )
    expect(sessionTwo).toBeTruthy()

    await answerQuestion(
      { sessionId: sessionTwo!, questionId: "q2", selectedKey: "A" },
      testDb.prisma,
    )

    const afterIncorrect = await testDb.prisma.tagMastery.findUniqueOrThrow({
      where: { tagId: "general-paediatrics" },
    })
    expect(afterIncorrect.elo).toBeCloseTo(999.26, 2)
  })

  it("starts sessions in weakness-first order within the selected tag", async () => {
    const testDb = await createTestDb()
    cleanup = testDb.cleanup

    await seedQuestionSet(testDb.prisma, {
      tags: [
        { slug: "general-paediatrics", name: "General Paediatrics" },
        { slug: "weak-lane", name: "Weak Lane" },
        { slug: "strong-lane", name: "Strong Lane" },
      ],
      questions: [
        { id: "qA", stem: "A", tagSlugs: ["general-paediatrics"] },
        { id: "qB", stem: "B", tagSlugs: ["general-paediatrics", "weak-lane"] },
        { id: "qC", stem: "C", tagSlugs: ["general-paediatrics", "strong-lane"] },
      ],
    })

    await testDb.prisma.tagMastery.createMany({
      data: [
        { tagId: "general-paediatrics", elo: 1000, attemptCount: 4, correctCount: 2 },
        { tagId: "weak-lane", elo: 860, attemptCount: 4, correctCount: 1 },
        { tagId: "strong-lane", elo: 1140, attemptCount: 4, correctCount: 4 },
      ],
    })

    const sessionId = await startPracticeSession(
      { tagId: "general-paediatrics", questionCount: 3 },
      testDb.prisma,
    )
    expect(sessionId).toBeTruthy()

    const session = await testDb.prisma.practiceSession.findUniqueOrThrow({
      where: { id: sessionId! },
    })
    expect(session.questionIds).toEqual(["qB", "qA", "qC"])
  })

  it("persists flags and exposes them in question detail", async () => {
    const testDb = await createTestDb()
    cleanup = testDb.cleanup

    await seedQuestionSet(testDb.prisma, {
      tags: [{ slug: "general-paediatrics", name: "General Paediatrics" }],
      questions: [{ id: "q1", stem: "Question 1", tagSlugs: ["general-paediatrics"] }],
    })

    const flagged = await toggleFlag("q1", testDb.prisma)
    expect(flagged).toBe(true)

    const question = await getQuestionDetail("q1", testDb.prisma)
    expect(question?.flagged).toBe(true)
  })

  it("enforces sequential answers and ignores duplicate submissions for mastery updates", async () => {
    const testDb = await createTestDb()
    cleanup = testDb.cleanup

    await seedQuestionSet(testDb.prisma, {
      tags: [{ slug: "general-paediatrics", name: "General Paediatrics" }],
      questions: [
        { id: "q1", stem: "Question 1", tagSlugs: ["general-paediatrics"], correctKey: "B" },
        { id: "q2", stem: "Question 2", tagSlugs: ["general-paediatrics"], correctKey: "C" },
      ],
    })

    const sessionId = await startPracticeSession(
      { tagId: "general-paediatrics", questionCount: 2 },
      testDb.prisma,
    )
    expect(sessionId).toBeTruthy()

    await expect(
      answerQuestion(
        { sessionId: sessionId!, questionId: "q2", selectedKey: "C" },
        testDb.prisma,
      ),
    ).rejects.toThrow("QUESTION_OUT_OF_SEQUENCE")

    const firstAttempt = await answerQuestion(
      { sessionId: sessionId!, questionId: "q1", selectedKey: "B" },
      testDb.prisma,
    )
    expect(firstAttempt.isCorrect).toBe(true)

    const masteryAfterFirstAttempt = await testDb.prisma.tagMastery.findUniqueOrThrow({
      where: { tagId: "general-paediatrics" },
    })
    expect(masteryAfterFirstAttempt.attemptCount).toBe(1)

    const duplicateAttempt = await answerQuestion(
      { sessionId: sessionId!, questionId: "q1", selectedKey: "A" },
      testDb.prisma,
    )
    expect(duplicateAttempt.isCorrect).toBe(true)

    const masteryAfterDuplicateAttempt = await testDb.prisma.tagMastery.findUniqueOrThrow({
      where: { tagId: "general-paediatrics" },
    })
    expect(masteryAfterDuplicateAttempt.attemptCount).toBe(1)
    expect(masteryAfterDuplicateAttempt.elo).toBeCloseTo(masteryAfterFirstAttempt.elo, 6)

    const session = await getSession(sessionId!, testDb.prisma)
    expect(session?.currentIndex).toBe(1)
  })

  it("uses topic-only browse tag options while keeping curriculum practice tags", async () => {
    const testDb = await createTestDb()
    cleanup = testDb.cleanup

    await seedQuestionSet(testDb.prisma, {
      tags: [
        { slug: "general-paediatrics", name: "General Paediatrics" },
        { slug: "respiratory", name: "Respiratory", kind: "topic" as const },
      ],
      questions: [{ id: "q1", stem: "Question 1", tagSlugs: ["general-paediatrics", "respiratory"] }],
    })

    const practiceTags = await listPracticeTags(testDb.prisma)
    const browse = await getBrowseData({}, testDb.prisma)
    const detail = await getQuestionDetail("q1", testDb.prisma)

    expect(practiceTags.map((tag) => tag.slug)).toEqual(["general-paediatrics", "respiratory"])
    expect(browse.tagOptions.map((tag) => tag.slug)).toEqual(["respiratory"])
    expect(detail?.tags.map((tag) => tag.slug)).toEqual(["general-paediatrics", "respiratory"])
  })

  it("builds dashboard analytics from live attempts, sessions, notes, and curriculum mastery", async () => {
    const testDb = await createTestDb()
    cleanup = testDb.cleanup

    await seedQuestionSet(testDb.prisma, {
      tags: [
        { slug: "general-paediatrics", name: "General Paediatrics" },
        { slug: "paediatric-surgery", name: "Paediatric Surgery" },
      ],
      questions: [
        { id: "q1", stem: "General question", tagSlugs: ["general-paediatrics"], correctKey: "B" },
        { id: "q2", stem: "Surgery question", tagSlugs: ["paediatric-surgery"], correctKey: "C" },
        { id: "q3", stem: "Second surgery question", tagSlugs: ["paediatric-surgery"], correctKey: "A" },
      ],
    })
    await testDb.prisma.question.updateMany({
      where: { id: { in: ["q2", "q3"] } },
      data: { curriculum: "Paediatric Surgery" },
    })

    await testDb.prisma.flag.create({ data: { questionId: "q2" } })
    await testDb.prisma.userNote.create({
      data: { questionId: "q1", noteMarkdown: "Needs review" },
    })

    await testDb.prisma.tagMastery.createMany({
      data: [
        { tagId: "general-paediatrics", elo: 1115, attemptCount: 2, correctCount: 2 },
        { tagId: "paediatric-surgery", elo: 1090, attemptCount: 2, correctCount: 1 },
      ],
    })

    await testDb.prisma.practiceSession.create({
      data: {
        id: "session-1",
        mode: "revision",
        questionIds: ["q1", "q2"],
        createdAt: new Date("2026-04-20T00:00:00.000Z"),
        completedAt: new Date("2026-04-20T00:15:00.000Z"),
        attempts: {
          create: [
            {
              questionId: "q1",
              selectedKey: "B",
              isCorrect: true,
              timeSpentMs: 12_000,
              createdAt: new Date("2026-04-20T00:05:00.000Z"),
            },
            {
              questionId: "q2",
              selectedKey: "A",
              isCorrect: false,
              timeSpentMs: 9_000,
              createdAt: new Date("2026-04-20T00:10:00.000Z"),
            },
          ],
        },
      },
    })

    await testDb.prisma.practiceSession.create({
      data: {
        id: "session-2",
        mode: "custom",
        questionIds: ["q3", "q1"],
        createdAt: new Date("2026-04-22T00:00:00.000Z"),
        completedAt: new Date("2026-04-22T00:12:00.000Z"),
        attempts: {
          create: [
            {
              questionId: "q3",
              selectedKey: "A",
              isCorrect: true,
              timeSpentMs: 6_000,
              createdAt: new Date("2026-04-22T00:03:00.000Z"),
            },
            {
              questionId: "q1",
              selectedKey: "B",
              isCorrect: true,
              timeSpentMs: 3_000,
              createdAt: new Date("2026-04-22T00:08:00.000Z"),
            },
          ],
        },
      },
    })

    const dashboard = await getDashboardData(testDb.prisma)

    expect(dashboard.publishedCount).toBe(3)
    expect(dashboard.answerableCount).toBe(3)
    expect(dashboard.flaggedCount).toBe(1)
    expect(dashboard.noteCount).toBe(1)
    expect(dashboard.accuracyPercent).toBe(75)
    expect(dashboard.totalTimeSpent).toBe(30_000)
    expect(dashboard.currentStreak).toBe(2)
    expect(dashboard.modulesCompleted).toBe(1)
    expect(dashboard.trendData).toHaveLength(30)
    expect(dashboard.heatmapData).toHaveLength(56)
    expect(
      dashboard.topicDistribution.map((row) => ({
        topic: row.topic,
        count: row.count,
        percentage: row.percentage,
      })),
    ).toEqual([
      { topic: "Paediatric Surgery", count: 2, percentage: 66.7 },
      { topic: "General Paediatrics", count: 1, percentage: 33.3 },
    ])
    expect(
      dashboard.sessionsBarData.map((session) => ({
        id: session.id,
        answered: session.answered,
        correct: session.correct,
        score: session.score,
      })),
    ).toEqual([
      { id: "session-1", answered: 2, correct: 1, score: 50 },
      { id: "session-2", answered: 2, correct: 2, score: 100 },
    ])
  })

  it("supports shared question list filtering, sorting, pagination, and CSV export", async () => {
    const testDb = await createTestDb()
    cleanup = testDb.cleanup

    await seedQuestionSet(testDb.prisma, {
      tags: [
        { slug: "general-paediatrics", name: "General Paediatrics" },
        { slug: "paediatric-surgery", name: "Paediatric Surgery" },
      ],
      questions: [
        { id: "q1", stem: "Bronchiolitis stem", tagSlugs: ["general-paediatrics"], difficulty: "Basic", correctKey: "A" },
        { id: "q2", stem: "Appendicitis stem", tagSlugs: ["paediatric-surgery"], difficulty: "Hard", correctKey: "B" },
        { id: "q3", stem: "Asthma stem", tagSlugs: ["general-paediatrics"], difficulty: "Intermediate", correctKey: "C" },
      ],
    })
    await testDb.prisma.question.update({
      where: { id: "q2" },
      data: { curriculum: "Paediatric Surgery" },
    })

    await testDb.prisma.question.update({
      where: { id: "q1" },
      data: { explanation: "Bronchiolitis explanation text" },
    })
    await testDb.prisma.flag.create({ data: { questionId: "q2" } })
    await testDb.prisma.practiceSession.create({
      data: {
        id: "list-session",
        mode: "revision",
        questionIds: ["q1", "q3"],
        attempts: {
          create: [
            {
              questionId: "q1",
              selectedKey: "A",
              isCorrect: true,
              createdAt: new Date("2026-04-22T00:00:00.000Z"),
            },
          ],
        },
      },
    })
    await testDb.prisma.practiceSession.create({
      data: {
        id: "list-session-2",
        mode: "custom",
        questionIds: ["q2"],
        attempts: {
          create: [
            {
              questionId: "q2",
              selectedKey: "B",
              isCorrect: true,
              createdAt: new Date("2026-04-23T00:00:00.000Z"),
            },
          ],
        },
      },
    })
    await testDb.prisma.practiceSession.create({
      data: {
        id: "list-session-3",
        mode: "revision",
        questionIds: ["q1"],
        attempts: {
          create: [
            {
              questionId: "q1",
              selectedKey: "B",
              isCorrect: false,
              createdAt: new Date("2026-04-23T00:30:00.000Z"),
            },
          ],
        },
      },
    })

    const explanationSearch = await getQuestionListData({ q: "Bronchiolitis" }, testDb.prisma)
    const flaggedOnly = await getQuestionListData({ flagged: true }, testDb.prisma)
    const sorted = await getQuestionListData(
      { sort: "score", direction: "desc", pageSize: 10 },
      testDb.prisma,
    )
    const paged = await getQuestionListData({ page: 2, pageSize: 1 }, testDb.prisma)
    const csv = await getQuestionListCsv({ sort: "score", direction: "desc" }, testDb.prisma)

    expect(explanationSearch.questions.map((question) => question.id)).toEqual(["q1"])
    expect(flaggedOnly.questions.map((question) => question.id)).toEqual(["q2"])
    expect(sorted.questions.map((question) => question.id)).toEqual(["q2", "q1", "q3"])
    expect(paged.total).toBe(3)
    expect(paged.pageCount).toBe(3)
    expect(paged.questions).toHaveLength(1)
    expect(csv).toContain("id,title,curriculum,difficulty,flagged,attempts,correct,scorePercent,answerable,moduleCode")
    expect(csv.indexOf("q2,Appendicitis stem")).toBeLessThan(csv.indexOf("q1,Bronchiolitis stem"))
  })

  it("starts a one-question custom session from an explicit question id", async () => {
    const testDb = await createTestDb()
    cleanup = testDb.cleanup

    await seedQuestionSet(testDb.prisma, {
      tags: [{ slug: "general-paediatrics", name: "General Paediatrics" }],
      questions: [
        { id: "q1", stem: "Question 1", tagSlugs: ["general-paediatrics"], correctKey: "B" },
        { id: "q2", stem: "Question 2", tagSlugs: ["general-paediatrics"], correctKey: "C" },
      ],
    })

    const sessionId = await startPracticeSession({ questionId: "q2" }, testDb.prisma)
    expect(sessionId).toBeTruthy()

    const session = await testDb.prisma.practiceSession.findUniqueOrThrow({
      where: { id: sessionId! },
    })
    expect(session.mode).toBe("custom")
    expect(session.questionIds).toEqual(["q2"])
  })
})
