import { notFound } from "next/navigation";

import { PageFrame } from "@/components/layout/page-frame";
import { SessionRunner } from "@/components/practice/session-runner";
import { requireUser } from "@/lib/auth/require-user";
import { getSessionDetail } from "@/lib/server/practice";

export default async function SessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const user = await requireUser();
  const { sessionId } = await params;

  const session = await getSessionDetail(user.id, sessionId);
  if (!session) {
    notFound();
  }

  const attempts = Array.from(session.latestAttemptByQuestion.entries()).map(([questionId, attempt]) => ({
    questionId,
    selectedKey: attempt.selectedKey,
    isCorrect: attempt.isCorrect,
  }));

  return (
    <PageFrame currentPath="/session" userEmail={user.email} isAdmin={user.role === "ADMIN"}>
      <div className="mb-5 space-y-1">
        <h1 className="text-2xl font-semibold">Question session</h1>
        <p className="text-sm text-muted-foreground">Keyboard: A-Z select, Enter submit, N next.</p>
      </div>
      <SessionRunner
        sessionId={session.id}
        mode={session.mode}
        durationMinutes={session.durationMinutes}
        initialQuestions={session.questions}
        initialAttempts={attempts}
      />
    </PageFrame>
  );
}
