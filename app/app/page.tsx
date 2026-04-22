import Link from "next/link"

import { AppShell } from "@/components/app-shell"
import { getDashboardData } from "@/lib/qbank"

export default async function HomePage() {
  const dashboard = await getDashboardData()

  return (
    <AppShell
      title="Dashboard"
      subtitle="Single-user paediatrics revision with a Git-tracked question source, a rebuildable SQLite read model, and calm local-first practice flows."
    >
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Published questions", value: dashboard.publishedCount },
          { label: "Practice-ready", value: dashboard.answerableCount },
          { label: "Flagged", value: dashboard.flaggedCount },
          { label: "Notes", value: dashboard.noteCount },
        ].map((item) => (
          <div key={item.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">{item.label}</p>
            <p className="mt-2 text-4xl font-semibold tracking-tight text-slate-900">{item.value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Recent sessions</h2>
              <p className="text-sm text-slate-600">
                Your last five practice runs and how they landed.
              </p>
            </div>
            <Link
              href="/practice/new"
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Start practice
            </Link>
          </div>

          <div className="mt-6 space-y-3">
            {dashboard.recentSessions.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                No sessions yet. Start a short run and the dashboard will begin tracking your progress.
              </p>
            ) : (
              dashboard.recentSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
                >
                  <div>
                    <p className="font-medium capitalize text-slate-900">{session.mode}</p>
                    <p className="text-xs text-slate-500">
                      {session.createdAt.toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900">
                      {session.correct}/{session.answered}
                    </p>
                    <p className="text-xs text-slate-500">
                      {session.completedAt ? "Completed" : "In progress"}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <aside className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Weakest tags</h2>
          <p className="mt-1 text-sm text-slate-600">
            Lower Elo means the tag needs more reinforcement.
          </p>

          <div className="mt-6 space-y-3">
            {dashboard.weakTags.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                Tag mastery appears once you begin answering questions.
              </p>
            ) : (
              dashboard.weakTags.map((tag) => (
                <div
                  key={tag.slug}
                  className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-slate-900">{tag.name}</p>
                    <p className="text-sm font-semibold text-slate-700">{tag.elo.toFixed(1)}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{tag.attempts} attempts</p>
                </div>
              ))
            )}
          </div>
        </aside>
      </section>
    </AppShell>
  )
}
