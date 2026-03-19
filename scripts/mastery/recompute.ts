import dotenv from "dotenv";

import { prisma } from "../lib/prisma";

dotenv.config();

const BASE_ALPHA = 1;
const BASE_BETA = 1;
const DECAY_HALF_LIFE_DAYS = 45;

function daysBetween(older: Date, newer: Date) {
  return Math.max(0, (newer.getTime() - older.getTime()) / (1000 * 60 * 60 * 24));
}

function decayFactor(days: number) {
  if (days <= 0) return 1;
  return Math.pow(0.5, days / DECAY_HALF_LIFE_DAYS);
}

function applyDecay(alpha: number, beta: number, lastUpdatedAt: Date, now: Date) {
  const factor = decayFactor(daysBetween(lastUpdatedAt, now));
  return {
    alpha: BASE_ALPHA + (alpha - BASE_ALPHA) * factor,
    beta: BASE_BETA + (beta - BASE_BETA) * factor,
  };
}

function confidenceWeight(confidence: number | null) {
  if (!confidence || confidence < 1 || confidence > 5) return 1;
  return 0.8 + confidence * 0.1;
}

async function updateForAttempt(userId: string, questionId: string, isCorrect: boolean, confidence: number | null, at: Date) {
  const tags = await prisma.questionTag.findMany({
    where: {
      questionId,
      tag: { kind: { in: ["topic", "module", "ranZcogDomain"] } },
    },
    select: { tagId: true },
  });

  const weight = confidenceWeight(confidence);

  for (const tag of tags) {
    const existing = await prisma.mastery.findUnique({
      where: {
        userId_tagId: {
          userId,
          tagId: tag.tagId,
        },
      },
    });

    const current = existing
      ? applyDecay(existing.alpha, existing.beta, existing.lastUpdatedAt, at)
      : { alpha: BASE_ALPHA, beta: BASE_BETA };

    const nextAlpha = current.alpha + (isCorrect ? weight : 0);
    const nextBeta = current.beta + (isCorrect ? 0 : weight);
    const masteryScore = nextAlpha / (nextAlpha + nextBeta);

    await prisma.mastery.upsert({
      where: {
        userId_tagId: {
          userId,
          tagId: tag.tagId,
        },
      },
      create: {
        userId,
        tagId: tag.tagId,
        model: "beta",
        alpha: nextAlpha,
        beta: nextBeta,
        masteryScore,
      },
      update: {
        model: "beta",
        alpha: nextAlpha,
        beta: nextBeta,
        masteryScore,
        lastUpdatedAt: at,
      },
    });
  }
}

async function recompute(userId?: string) {
  if (userId) {
    await prisma.mastery.deleteMany({ where: { userId } });
  } else {
    await prisma.mastery.deleteMany();
  }

  const attempts = await prisma.attempt.findMany({
    where: userId ? { userId } : undefined,
    orderBy: [{ userId: "asc" }, { createdAt: "asc" }],
    select: {
      userId: true,
      questionId: true,
      isCorrect: true,
      confidence: true,
      createdAt: true,
    },
  });

  for (const attempt of attempts) {
    await updateForAttempt(attempt.userId, attempt.questionId, attempt.isCorrect, attempt.confidence, attempt.createdAt);
  }

  return { attemptsProcessed: attempts.length, userId: userId ?? null };
}

const userIdArg = process.argv[2];

recompute(userIdArg)
  .then((summary) => {
    console.log("Mastery recompute complete");
    console.log(JSON.stringify(summary, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
