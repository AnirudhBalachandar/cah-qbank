import { beforeEach, describe, expect, it } from "vitest"

import { answerQuestion, getQuestionDetail, getSession, startPracticeSession, toggleFlag } from "@/lib/qbank"
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
})
