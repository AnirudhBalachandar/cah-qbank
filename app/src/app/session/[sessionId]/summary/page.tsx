import { notFound } from "next/navigation";

import { PageFrame } from "@/components/layout/page-frame";
import { SessionSummaryView } from "@/components/practice/session-summary-view";
import { requireUser } from "@/lib/auth/require-user";
import { getSessionSummary } from "@/lib/server/practice";

export default async function SessionSummaryPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const user = await requireUser();
  const { sessionId } = await params;

  const summary = await getSessionSummary(user.id, sessionId);
  if (!summary) {
    notFound();
  }

  const attemptsByQuestion = Array.from(summary.attemptsByQuestion.entries()).map(([questionId, value]) => [questionId, value] as [string, typeof value]);

  return (
    <PageFrame currentPath="/session" userEmail={user.email} isAdmin={user.role === "ADMIN"}>
      <div className="mb-5 space-y-1">
        <h1 className="text-2xl font-semibold">Session summary</h1>
        <p className="text-sm text-muted-foreground">Review answers, explanations, notes, and flags.</p>
      </div>

      <SessionSummaryView
        sessionId={summary.session.id}
        questions={summary.session.questions}
        attemptsByQuestion={attemptsByQuestion}
        accuracy={summary.accuracy}
        correctCount={summary.correctCount}
        attemptedCount={summary.attemptedCount}
        totalTimeMs={summary.totalTimeMs}
        tagBreakdown={summary.tagBreakdown}
        moduleBreakdown={summary.moduleBreakdown}
      />
    </PageFrame>
  );
}
