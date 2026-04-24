import Link from "next/link"

import { AppShell } from "@/components/app-shell"
import { ProgressLine, ProgressMetricCard, StatusBadge, WeakTopicCard } from "@/components/qbank-ui"
import { getDashboardData, getProgressData } from "@/lib/qbank"

function accuracy(correct: number, attempts: number) {
  if (attempts === 0) return 0
  return Math.round((correct / attempts) * 100)
}

function masteryPercent(elo: number) {
  return Math.max(6, Math.min(100, Math.round(((elo - 800) / 600) * 100)))
}

export default async function ProgressPage() {
  const [progress, dashboard] = await Promise.all([getProgressData(), getDashboardData()])
  const attemptedRows = progress.filter((row) => row.attemptCount > 0)
  const weakest = [...attemptedRows]
    .sort((left, right) => accuracy(left.correctCount, left.attemptCount) - accuracy(right.correctCount, right.attemptCount))
    .slice(0, 5)
  const totalAttempts = progress.reduce((sum, row) => sum + row.attemptCount, 0)
  const totalCorrect = progress.reduce((sum, row) => sum + row.correctCount, 0)
  const overallAccuracy = accuracy(totalCorrect, Math.max(totalAttempts, 1))

  return (
    <AppShell
      title="Progress"
      subtitle="Review performance, identify weak areas, and jump straight into focused practice."
    >
      <section className="space-y-5">
        <div className="flex items-center justify-between md:hidden">
          <h1 className="text-xl font-bold text-copy">Progress</h1>
          <button className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-copy">
            Last 30 days
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ProgressMetricCard label="Accuracy" value={`${dashboard.accuracyPercent || overallAccuracy}%`} trend="Current all-time score" />
          <ProgressMetricCard label="Questions" value={dashboard.answerableCount.toLocaleString()} trend="Practice-ready" />
          <ProgressMetricCard label="Streak" value={`${dashboard.currentStreak} days`} trend="From latest attempts" />
          <ProgressMetricCard label="Sessions" value={dashboard.sessionsBarData.length} trend="Recent history" />
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            <section className="rounded-lg border border-border bg-surface p-4 shadow-card md:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-copy">Accuracy over time</h2>
                  <p className="text-xs text-muted">Your recorded attempts by day.</p>
                </div>
                <StatusBadge tone="accent">30-day average</StatusBadge>
              </div>
              <div className="mt-5 flex h-48 items-end gap-1 border-b border-l border-border px-2 pb-2">
                {dashboard.trendData.slice(-30).map((point) => (
                  <div key={point.date} className="flex min-w-2 flex-1 items-end">
                    <span
                      className="block w-full rounded-t bg-accent"
                      style={{ height: `${Math.max(8, point.score ?? 4)}%` }}
                      title={`${point.date}: ${point.score ?? 0}%`}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs text-muted">
                <span className="inline-flex items-center gap-2"><span className="h-2 w-4 rounded bg-accent" /> Your accuracy</span>
                <span className="inline-flex items-center gap-2"><span className="h-px w-4 bg-muted" /> Rolling average</span>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-surface p-4 shadow-card md:p-5">
              <h2 className="text-base font-bold text-copy">Category performance</h2>
              <div className="mt-4 space-y-3">
                {progress.slice(0, 18).map((row) => {
                  const rowAccuracy = accuracy(row.correctCount, row.attemptCount)
                  return (
                    <div key={row.slug} className="rounded-md border border-border bg-canvas p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-copy">{row.name}</p>
                          <p className="text-xs text-muted">
                            {row.kind} · {row.questionCount} questions · {row.attemptCount} attempts
                          </p>
                        </div>
                        <span className={rowAccuracy >= 70 ? "text-sm font-bold text-success" : rowAccuracy <= 40 ? "text-sm font-bold text-danger" : "text-sm font-bold text-warning"}>
                          {row.attemptCount === 0 ? "New" : `${rowAccuracy}%`}
                        </span>
                      </div>
                      <div className="mt-3">
                        <ProgressLine value={row.attemptCount === 0 ? masteryPercent(row.elo) : rowAccuracy} tone={rowAccuracy <= 40 && row.attemptCount > 0 ? "danger" : "success"} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          </div>

          <aside className="space-y-5">
            <section className="rounded-lg border border-border bg-surface p-4 shadow-card md:p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-copy">Weakest topics</h2>
                <Link href="/review" className="text-xs font-bold text-accent">
                  View all
                </Link>
              </div>
              <div className="mt-4 space-y-2">
                {weakest.length === 0 ? (
                  <p className="text-sm text-muted">Practice attempts will populate weak-topic recommendations.</p>
                ) : (
                  weakest.map((row) => (
                    <WeakTopicCard
                      key={row.slug}
                      name={row.name}
                      percent={accuracy(row.correctCount, row.attemptCount)}
                      href={`/practice/new?tag=${row.slug}`}
                    />
                  ))
                )}
              </div>
            </section>

            <section className="rounded-lg border border-border bg-surface p-4 shadow-card md:p-5">
              <h2 className="text-base font-bold text-copy">Recent sessions</h2>
              <div className="mt-4 space-y-3">
                {dashboard.sessionsBarData.length === 0 ? (
                  <p className="text-sm text-muted">No sessions yet.</p>
                ) : (
                  dashboard.sessionsBarData.slice(-6).map((session) => (
                    <div key={session.id} className="rounded-md border border-border bg-canvas p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-copy">{session.label}</span>
                        <span className={session.score >= 70 ? "text-sm font-bold text-success" : "text-sm font-bold text-danger"}>
                          {session.score}%
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {session.correct} of {session.answered} correct
                      </p>
                    </div>
                  ))
                )}
              </div>
            </section>
          </aside>
        </div>
      </section>
    </AppShell>
  )
}
