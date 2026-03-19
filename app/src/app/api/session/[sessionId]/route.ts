import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/server/auth";
import { getSessionDetail } from "@/lib/server/practice";

export async function GET(_: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const user = await requireApiUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  const session = await getSessionDetail(user.id, sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: session.id,
    mode: session.mode,
    durationMinutes: session.durationMinutes,
    createdAt: session.createdAt,
    completedAt: session.completedAt,
    questions: session.questions,
    attempts: Array.from(session.latestAttemptByQuestion.entries()).map(([questionId, attempt]) => ({
      questionId,
      selectedKey: attempt.selectedKey,
      isCorrect: attempt.isCorrect,
      createdAt: attempt.createdAt,
      timeSpentMs: attempt.timeSpentMs,
      confidence: attempt.confidence,
    })),
  });
}
