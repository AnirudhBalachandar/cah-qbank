import { notFound } from "next/navigation"

import { AppShell } from "@/components/app-shell"
import { SessionRunner } from "@/components/session-runner"
import { getSession } from "@/lib/qbank"

export default async function PracticeSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  const session = await getSession(sessionId)

  if (!session) {
    notFound()
  }

  return (
    <AppShell
      title="Practice Session"
      subtitle="Answer one question at a time, reveal the explanation, and leave notes or flags as you go."
    >
      <SessionRunner
        sessionId={session.id}
        questions={session.questions}
        initialIndex={session.currentIndex}
        attempts={Array.from(session.answeredByQuestion.values()).map((attempt) => ({
          questionId: attempt.questionId,
          selectedKey: attempt.selectedKey,
          isCorrect: attempt.isCorrect,
        }))}
      />
    </AppShell>
  )
}
