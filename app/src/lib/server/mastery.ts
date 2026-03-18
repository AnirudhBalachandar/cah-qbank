import { prisma } from "@/lib/db";
import type { MasteryModel } from "@/lib/generated/prisma";
import { applyDecay, confidenceWeight } from "@/lib/server/mastery-math";

const BASE_ALPHA = 1;
const BASE_BETA = 1;

export async function updateMasteryForAttempt({
  userId,
  questionId,
  isCorrect,
  confidence,
  at = new Date(),
  model = "beta",
}: {
  userId: string;
  questionId: string;
  isCorrect: boolean;
  confidence?: number | null;
  at?: Date;
  model?: MasteryModel;
}) {
  const questionTagLinks = await prisma.questionTag.findMany({
    where: {
      questionId,
      tag: {
        kind: {
          in: ["topic", "module", "ranZcogDomain"],
        },
      },
    },
    select: {
      tagId: true,
    },
  });

  const tagIds = Array.from(new Set(questionTagLinks.map((link) => link.tagId)));
  if (tagIds.length === 0) {
    return;
  }

  const existingRows = await prisma.mastery.findMany({
    where: {
      userId,
      tagId: { in: tagIds },
    },
  });
  const existingMap = new Map(existingRows.map((row) => [row.tagId, row]));

  const weight = confidenceWeight(confidence);
  const updates = tagIds.map((tagId) => {
    const current = existingMap.get(tagId);
    const decayed = current
      ? applyDecay(current.alpha, current.beta, current.lastUpdatedAt, at)
      : { alpha: BASE_ALPHA, beta: BASE_BETA };

    const nextAlpha = decayed.alpha + (isCorrect ? weight : 0);
    const nextBeta = decayed.beta + (isCorrect ? 0 : weight);
    const masteryScore = nextAlpha / (nextAlpha + nextBeta);

    return prisma.mastery.upsert({
      where: {
        userId_tagId: {
          userId,
          tagId,
        },
      },
      create: {
        userId,
        tagId,
        model,
        alpha: nextAlpha,
        beta: nextBeta,
        masteryScore,
      },
      update: {
        model,
        alpha: nextAlpha,
        beta: nextBeta,
        masteryScore,
        lastUpdatedAt: at,
      },
    });
  });

  await prisma.$transaction(updates);
}

export async function recomputeMasteryForUser(userId: string) {
  await prisma.mastery.deleteMany({ where: { userId } });

  const attempts = await prisma.attempt.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      questionId: true,
      isCorrect: true,
      confidence: true,
      createdAt: true,
    },
  });

  if (attempts.length === 0) {
    return;
  }

  const questionIds = Array.from(new Set(attempts.map((attempt) => attempt.questionId)));
  const questionTagLinks = await prisma.questionTag.findMany({
    where: {
      questionId: { in: questionIds },
      tag: {
        kind: {
          in: ["topic", "module", "ranZcogDomain"],
        },
      },
    },
    select: {
      questionId: true,
      tagId: true,
    },
  });

  const tagsByQuestion = new Map<string, string[]>();
  for (const link of questionTagLinks) {
    const existing = tagsByQuestion.get(link.questionId) ?? [];
    existing.push(link.tagId);
    tagsByQuestion.set(link.questionId, existing);
  }

  const masteryState = new Map<string, { alpha: number; beta: number; lastUpdatedAt: Date }>();

  for (const attempt of attempts) {
    const tagIds = tagsByQuestion.get(attempt.questionId) ?? [];
    if (tagIds.length === 0) {
      continue;
    }

    const weight = confidenceWeight(attempt.confidence);

    for (const tagId of tagIds) {
      const previous = masteryState.get(tagId);
      const decayed = previous
        ? applyDecay(previous.alpha, previous.beta, previous.lastUpdatedAt, attempt.createdAt)
        : { alpha: BASE_ALPHA, beta: BASE_BETA };

      const nextAlpha = decayed.alpha + (attempt.isCorrect ? weight : 0);
      const nextBeta = decayed.beta + (attempt.isCorrect ? 0 : weight);

      masteryState.set(tagId, {
        alpha: nextAlpha,
        beta: nextBeta,
        lastUpdatedAt: attempt.createdAt,
      });
    }
  }

  if (masteryState.size === 0) {
    return;
  }

  await prisma.mastery.createMany({
    data: Array.from(masteryState.entries()).map(([tagId, state]) => ({
      userId,
      tagId,
      model: "beta",
      alpha: state.alpha,
      beta: state.beta,
      masteryScore: state.alpha / (state.alpha + state.beta),
      lastUpdatedAt: state.lastUpdatedAt,
    })),
  });
}

export async function recomputeMasteryForAllUsers() {
  const users = await prisma.user.findMany({ select: { id: true } });
  for (const user of users) {
    await recomputeMasteryForUser(user.id);
  }
}
