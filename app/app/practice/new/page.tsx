import { redirect } from "next/navigation"

import { startSessionAction } from "@/app/actions/practice"
import { AppShell } from "@/components/app-shell"
import { FilterChip, ProgressLine, StatusBadge, TopicProgressRow } from "@/components/qbank-ui"
import { listPracticeTags, startPracticeSession } from "@/lib/qbank"

function masteryPercent(elo: number) {
  return Math.max(8, Math.min(100, Math.round(((elo - 800) / 600) * 100)))
}

export default async function PracticeSetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [tags, params] = await Promise.all([listPracticeTags(), searchParams])
  const error = typeof params.error === "string" ? params.error : null
  const questionId = typeof params.questionId === "string" ? params.questionId : null
  const selectedTag = typeof params.tag === "string" ? params.tag : ""
  const curricula = tags.filter((tag) => tag.kind === "curriculum")
  const topics = tags.filter((tag) => tag.kind === "topic")
  const featuredRows = [
    { name: "All Topics", detail: `${tags.reduce((sum, tag) => sum + tag.questionCount, 0).toLocaleString()} available`, value: 72, checked: true },
    ...curricula.slice(0, 3).map((tag) => ({
      name: tag.name,
      detail: `${tag.questionCount.toLocaleString()} questions`,
      value: masteryPercent(tag.elo),
      checked: false,
    })),
  ]

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
      <form action={startSessionAction} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <input type="hidden" name="questionId" value="" />

        <section className="space-y-4">
          <div className="rounded-lg border border-border bg-surface p-4 shadow-card md:p-5">
            <div className="flex items-center justify-between gap-3 md:hidden">
              <span className="text-sm text-muted">Close</span>
              <h1 className="font-bold text-copy">Practice Setup</h1>
              <button type="reset" className="text-sm font-semibold text-accent">
                Reset
              </button>
            </div>
            <div className="mt-4 flex items-center gap-3 md:mt-0">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-xs font-bold text-white">1</span>
              <h2 className="text-sm font-bold text-copy">Choose your scope</h2>
            </div>
            <div className="mt-3 space-y-1">
              {featuredRows.map((row) => (
                <TopicProgressRow key={row.name} {...row} />
              ))}
            </div>
            <label htmlFor="tagId" className="mt-4 block text-xs font-bold uppercase tracking-wide text-muted">
              Full topic list
            </label>
            <select
              id="tagId"
              name="tagId"
              className="mt-2 min-h-11 w-full rounded-md border border-border bg-canvas px-3 text-sm text-copy"
              defaultValue={selectedTag}
            >
              <option value="">All answerable questions</option>
              {[...curricula, ...topics].map((tag) => (
                <option key={tag.slug} value={tag.slug}>
                  {tag.name} ({tag.questionCount})
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-lg border border-border bg-surface p-4 shadow-card md:p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-xs font-bold text-white">2</span>
              <h2 className="text-sm font-bold text-copy">Choose session type</h2>
            </div>
            <div className="mt-4 grid grid-cols-4 overflow-hidden rounded-md border border-border text-sm font-semibold">
              {["Revision", "Timed", "Incorrect", "Flagged"].map((mode, index) => (
                <button
                  key={mode}
                  type="button"
                  className={[
                    "min-h-11 border-border px-2 transition",
                    index === 0 ? "bg-accent/10 text-accent" : "bg-surface text-copy",
                    index < 3 ? "border-r" : "",
                  ].join(" ")}
                >
                  {mode}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">Study at your own pace and let lower-mastery areas surface first.</p>
          </div>

          <div className="rounded-lg border border-border bg-surface p-4 shadow-card md:p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-xs font-bold text-white">3</span>
              <h2 className="text-sm font-bold text-copy">Choose number of questions</h2>
            </div>
            <div className="mt-4 grid grid-cols-5 gap-2">
              {[10, 20, 40, 100].map((count) => (
                <label
                  key={count}
                  className="grid min-h-11 cursor-pointer place-items-center rounded-md border border-border bg-surface text-sm font-bold has-[:checked]:border-accent has-[:checked]:bg-accent/10 has-[:checked]:text-accent"
                >
                  <input className="sr-only" type="radio" name="questionCount" value={count} defaultChecked={count === 20} />
                  {count}
                </label>
              ))}
              <label className="grid min-h-11 place-items-center rounded-md border border-border bg-surface text-sm font-bold text-muted">
                Custom
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface p-4 shadow-card md:p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-xs font-bold text-white">4</span>
              <h2 className="text-sm font-bold text-copy">Question selection</h2>
            </div>
            <div className="mt-3 space-y-3">
              {[
                ["New questions only", "Questions you have not attempted before"],
                ["Unanswered questions", "Questions you have not answered yet"],
                ["Incorrect questions", "Questions you answered incorrectly"],
                ["Review due", "Questions due for spaced repetition"],
              ].map(([title, detail], index) => (
                <label key={title} className="flex min-h-12 items-start gap-3 rounded-md p-2 hover:bg-canvas">
                  <input type="checkbox" defaultChecked={index < 3} className="mt-1 h-4 w-4 accent-accent" />
                  <span>
                    <span className="block text-sm font-semibold text-copy">{title}</span>
                    <span className="text-xs text-muted">{detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {error ? (
            <p className="rounded-lg border border-danger/20 bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
              No answerable published questions matched that selection.
            </p>
          ) : null}
        </section>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
            <h2 className="text-lg font-bold text-copy">Session summary</h2>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">Scope</span>
                <StatusBadge tone="accent">Adaptive revision</StatusBadge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Questions</span>
                <span className="font-bold text-copy">20</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Estimated time</span>
                <span className="font-bold text-copy">30-40 min</span>
              </div>
              <div className="rounded-md border border-border bg-canvas p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">Weakest topic hint</p>
                <p className="mt-1 text-sm font-semibold text-copy">{topics[0]?.name ?? "Start a session to build mastery data"}</p>
                <div className="mt-2">
                  <ProgressLine value={topics[0] ? masteryPercent(topics[0].elo) : 18} tone="danger" />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <FilterChip active>Published only</FilterChip>
                <FilterChip active>Single best answer</FilterChip>
              </div>
            </div>
            <button
              type="submit"
              className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-bold text-white transition hover:bg-accent-strong"
            >
              <span aria-hidden="true">Play</span>
              Start session
            </button>
          </div>
        </aside>
      </form>
    </AppShell>
  )
}
