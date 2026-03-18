import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireApiUser } from "@/lib/server/auth";
import { readJsonBody } from "@/lib/server/request-json";
import { reportIssueSchema } from "@/lib/server/schemas";

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
  const parsed = reportIssueSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid issue payload", issues: parsed.error.issues }, { status: 400 });
  }

  const { id: questionId } = await params;
  await prisma.issueReport.create({
    data: {
      userId: user.id,
      questionId,
      message: parsed.data.message,
    },
  });

  return NextResponse.json({ ok: true });
}
