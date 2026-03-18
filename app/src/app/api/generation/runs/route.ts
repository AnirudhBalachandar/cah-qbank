import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireApiUser } from "@/lib/server/auth";
import { createGenerationRun, listGenerationRuns } from "@/lib/server/generation/service";
import { readJsonBody } from "@/lib/server/request-json";
import { generationRequestSchema } from "@/lib/server/schemas";

export async function GET(request: Request) {
  const user = await requireApiUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitRaw) ? limitRaw : 20;

  const runs = await listGenerationRuns(user.id, limit);
  return NextResponse.json({ runs });
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readJsonBody(request);
  if (!body.ok) {
    return NextResponse.json({ error: "Invalid JSON body.", errorCode: "INVALID_JSON_BODY" }, { status: 400 });
  }

  const payload = body.payload;
  const parsed = generationRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid generation payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const maxQuestionsPerDayRaw = Number(process.env.GENERATION_MAX_QUESTIONS_PER_DAY ?? "");
  const maxRunsPerDayRaw = Number(process.env.GENERATION_MAX_RUNS_PER_DAY ?? "");
  const maxQuestionsPerDay = Number.isFinite(maxQuestionsPerDayRaw) && maxQuestionsPerDayRaw > 0
    ? Math.floor(maxQuestionsPerDayRaw)
    : null;
  const maxRunsPerDay = Number.isFinite(maxRunsPerDayRaw) && maxRunsPerDayRaw > 0
    ? Math.floor(maxRunsPerDayRaw)
    : null;
  const dayStartUtc = new Date();
  dayStartUtc.setUTCHours(0, 0, 0, 0);

  if (maxRunsPerDay !== null) {
    const runsToday = await prisma.generatedQuestionRun.count({
      where: {
        userId: user.id,
        createdAt: {
          gte: dayStartUtc,
        },
      },
    });
    if (runsToday >= maxRunsPerDay) {
      return NextResponse.json(
        {
          error: "Daily generation run limit reached.",
          errorCode: "GENERATION_RUN_LIMIT_REACHED",
          runsToday,
          maxRunsPerDay,
        },
        { status: 429 },
      );
    }
  }

  if (maxQuestionsPerDay !== null) {
    const questionsToday = await prisma.generatedQuestionItem.count({
      where: {
        createdAt: {
          gte: dayStartUtc,
        },
        run: {
          userId: user.id,
        },
      },
    });
    if (questionsToday + parsed.data.count > maxQuestionsPerDay) {
      return NextResponse.json(
        {
          error: "Daily generation question limit reached.",
          errorCode: "GENERATION_QUESTION_LIMIT_REACHED",
          questionsToday,
          requested: parsed.data.count,
          maxQuestionsPerDay,
        },
        { status: 429 },
      );
    }
  }

  try {
    const run = await createGenerationRun({
      userId: user.id,
      count: parsed.data.count,
      strictness: parsed.data.strictness,
      tagIds: parsed.data.tagIds,
    });

    return NextResponse.json(run, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generation failed" },
      { status: 500 },
    );
  }
}
