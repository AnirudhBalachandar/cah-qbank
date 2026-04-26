import { redirect } from "next/navigation"

import { AppShell } from "@/components/app-shell"
import { PracticeSessionConfigurator } from "@/components/practice-session-configurator"
import { listPracticeBlueprint, listPracticeTags, startPracticeSession } from "@/lib/qbank"

export default async function PracticeSetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [blueprint, tags, params] = await Promise.all([listPracticeBlueprint(), listPracticeTags(), searchParams])
  const error = typeof params.error === "string" ? params.error : null
  const questionId = typeof params.questionId === "string" ? params.questionId : null
  const topics = tags.filter((tag) => tag.kind === "topic")
  const selectedTags = [params.tag, params.tagIds]
    .flat()
    .filter((value): value is string => typeof value === "string" && value.length > 0)

  if (questionId) {
    const sessionId = await startPracticeSession({ questionId, questionCount: 1 })
    if (!sessionId) {
      redirect("/practice/new?error=no-questions")
    }

    redirect(`/practice/${sessionId}`)
  }

  return (
    <AppShell
      title="Start Practice"
      subtitle="Build a focused session from curriculum, topic, count, and review state."
    >
      <PracticeSessionConfigurator
        blueprint={blueprint}
        defaultSelected={selectedTags}
        weakestTopic={topics[0] ?? null}
        error={error}
      />
    </AppShell>
  )
}
