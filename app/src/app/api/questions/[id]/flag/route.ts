import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireApiUser } from "@/lib/server/auth";
import { readJsonBody } from "@/lib/server/request-json";
import { flagSchema } from "@/lib/server/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readJsonBody(request);
  if (!body.ok) {
    return NextResponse.json({ error: "Invalid JSON body.", errorCode: "INVALID_JSON_BODY" }, { status: 400 });
  }

  const payload = body.payload;
  const parsed = flagSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid flag payload" }, { status: 400 });
  }

  const { id: questionId } = await params;
  const existing = await prisma.flag.findUnique({
    where: {
      userId_questionId: {
        userId: user.id,
        questionId,
      },
    },
  });

  const shouldFlag = parsed.data.flagged ?? !existing;

  if (shouldFlag && !existing) {
    await prisma.flag.create({ data: { userId: user.id, questionId } });
  }

  if (!shouldFlag && existing) {
    await prisma.flag.delete({
      where: {
        userId_questionId: {
          userId: user.id,
          questionId,
        },
      },
    });
  }

  return NextResponse.json({ flagged: shouldFlag });
}
