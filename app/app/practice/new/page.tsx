import { redirect } from "next/navigation"

import { startSessionAction } from "@/app/actions/practice"
import { AppShell } from "@/components/app-shell"
import { listPracticeTags, startPracticeSession } from "@/lib/qbank"

export default async function PracticeSetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [tags, params] = await Promise.all([listPracticeTags(), searchParams])
  const error = typeof params.error === "string" ? params.error : null
  const questionId = typeof params.questionId === "string" ? params.questionId : null

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
      subtitle="Pick a curriculum or topic tag, choose a question count, and launch a one-question-at-a-time session."
    >
      <form
        action={startSessionAction}
        className="grid gap-6 rounded-3xl border border-border bg-panel/90 p-6 shadow-glow lg:grid-cols-[minmax(0,1fr)_220px]"
      >
        <input type="hidden" name="questionId" value="" />
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="tagId" className="text-sm font-semibold text-copy">
              Tag focus
            </label>
            <select
              id="tagId"
              name="tagId"
              className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-copy"
              defaultValue=""
            >
              <option value="">All answerable questions</option>
              {tags.map((tag) => (
                <option key={tag.slug} value={tag.slug}>
                  {tag.name} ({tag.questionCount})
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="questionCount" className="text-sm font-semibold text-copy">
                Question count
              </label>
              <input
                id="questionCount"
                name="questionCount"
                type="number"
                min={1}
                max={100}
                defaultValue={20}
                className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-copy"
              />
            </div>
          </div>

          {error ? (
            <p className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              No answerable published questions matched that selection.
            </p>
          ) : null}
        </div>

        <div className="flex flex-col justify-between gap-4 rounded-3xl border border-border bg-surface/80 p-5">
          <div className="space-y-2 text-sm text-muted">
            <p className="font-semibold text-copy">Selection rules</p>
            <p>Practice uses published questions only.</p>
            <p>Questions without a clear single correct answer stay browse-only.</p>
            <p>Within a tag, lower-mastery areas surface first.</p>
          </div>

          <button
            type="submit"
            className="rounded-full bg-accent px-4 py-3 text-sm font-semibold text-canvas"
          >
            Start session
          </button>
        </div>
      </form>
    </AppShell>
  )
}
