import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/server/auth";
import { resetUserPracticeProgress, setUserQuestionProgressStatus } from "@/lib/server/practice";
import { readJsonBody } from "@/lib/server/request-json";
import { progressControlSchema } from "@/lib/server/schemas";

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readJsonBody(request);
  if (!body.ok) {
    return NextResponse.json({ error: "Invalid JSON body.", errorCode: "INVALID_JSON_BODY" }, { status: 400 });
  }

  const parsed = progressControlSchema.safeParse(body.payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid progress-control payload", issues: parsed.error.issues }, { status: 400 });
  }

  if (parsed.data.action === "reset_all") {
    await resetUserPracticeProgress(user.id);
    return NextResponse.json({ ok: true, action: "reset_all" });
  }

  const result = await setUserQuestionProgressStatus({
    userId: user.id,
    questionId: parsed.data.questionId,
    status: parsed.data.status,
    confidence: parsed.data.confidence,
  });

  if (!result.ok) {
    return NextResponse.json({ error: "Question not found", errorCode: result.reason }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    action: "set_question_status",
    questionId: parsed.data.questionId,
    status: parsed.data.status,
  });
}
