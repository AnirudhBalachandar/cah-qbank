import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/server/auth";
import { submitSessionAnswer } from "@/lib/server/practice";
import { readJsonBody } from "@/lib/server/request-json";
import { answerSchema } from "@/lib/server/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const user = await requireApiUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readJsonBody(request);
  if (!body.ok) {
    return NextResponse.json({ error: "Invalid JSON body.", errorCode: "INVALID_JSON_BODY" }, { status: 400 });
  }

  const payload = body.payload;
  const parsed = answerSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid answer payload", issues: parsed.error.issues }, { status: 400 });
  }

  const { sessionId } = await params;
  const result = await submitSessionAnswer({
    userId: user.id,
    sessionId,
    questionId: parsed.data.questionId,
    selectedKey: parsed.data.selectedKey,
    timeSpentMs: parsed.data.timeSpentMs,
    confidence: parsed.data.confidence,
  });

  if (!result) {
    return NextResponse.json({ error: "Question or session not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}
