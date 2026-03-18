import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireApiUser } from "@/lib/server/auth";
import { readJsonBody } from "@/lib/server/request-json";
import { userPreferencesSchema } from "@/lib/server/schemas";

export async function GET() {
  const user = await requireApiUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(user);
}

export async function PUT(request: Request) {
  const user = await requireApiUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readJsonBody(request);
  if (!body.ok) {
    return NextResponse.json({ error: "Invalid JSON body.", errorCode: "INVALID_JSON_BODY" }, { status: 400 });
  }

  const payload = body.payload;
  const parsed = userPreferencesSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid preferences payload", issues: parsed.error.issues }, { status: 400 });
  }

  const examDateValue = parsed.data.examDate === undefined
    ? undefined
    : parsed.data.examDate === null
      ? null
      : new Date(parsed.data.examDate);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      examDate: examDateValue,
      dailyTarget: parsed.data.dailyTarget,
      defaultGenerationStrictness: parsed.data.defaultGenerationStrictness,
      onboardingCompletedAt: new Date(),
    },
    select: {
      id: true,
      email: true,
      role: true,
      examDate: true,
      dailyTarget: true,
      defaultGenerationStrictness: true,
      onboardingCompletedAt: true,
    },
  });

  return NextResponse.json(updated);
}
