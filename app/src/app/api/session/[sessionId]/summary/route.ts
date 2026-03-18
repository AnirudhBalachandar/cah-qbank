import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/server/auth";
import { getSessionSummary } from "@/lib/server/practice";

export async function GET(_: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const user = await requireApiUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  const summary = await getSessionSummary(user.id, sessionId);
  if (!summary) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({
    attemptedCount: summary.attemptedCount,
    correctCount: summary.correctCount,
    accuracy: summary.accuracy,
    totalTimeMs: summary.totalTimeMs,
    tagBreakdown: summary.tagBreakdown,
    moduleBreakdown: summary.moduleBreakdown,
    attemptsByQuestion: Array.from(summary.attemptsByQuestion.entries()),
    questions: summary.session.questions,
    mode: summary.session.mode,
    createdAt: summary.session.createdAt,
  });
}
