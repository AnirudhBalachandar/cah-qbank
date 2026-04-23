"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import type { DashboardTopicDistributionPoint } from "@/lib/qbank"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"

const chartColors = ["#00D9FF", "#00A8CC", "#8B5CF6", "#F59E0B", "#10B981", "#EF4444", "#38BDF8"]
const legendDotClasses = [
  "bg-accent",
  "bg-cyan-500",
  "bg-violet",
  "bg-warning",
  "bg-success",
  "bg-danger",
  "bg-sky-400",
]

function TooltipContent({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: DashboardTopicDistributionPoint }>
}) {
  if (!active || !payload?.[0]) return null

  const point = payload[0].payload
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-copy shadow-glow">
      <p className="font-semibold">{point.topic}</p>
      <p className="text-muted">
        {point.count} questions · {point.percentage}%
      </p>
    </div>
  )
}

export function TopicsChart({
  data,
  activeCurriculum,
}: {
  data: DashboardTopicDistributionPoint[]
  activeCurriculum?: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  const setCurriculum = (value?: string) => {
    const next = new URLSearchParams(searchParams.toString())
    if (value) {
      next.set("curriculum", value)
    } else {
      next.delete("curriculum")
    }
    next.delete("page")
    router.replace(next.size ? `${pathname}?${next.toString()}` : pathname)
  }

  const handleSegmentClick = (entry: unknown) => {
    const payload = entry as DashboardTopicDistributionPoint | undefined
    if (!payload?.topic) return
    setCurriculum(payload.topic === activeCurriculum ? undefined : payload.topic)
  }

  if (data.length === 0) {
    return (
      <section className="rounded-2xl border border-border bg-panel/90 p-6 shadow-glow">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-copy">Curriculum distribution</h2>
          <p className="text-sm text-muted">Published practice-ready questions by curriculum.</p>
        </div>
        <div className="mt-5 rounded-2xl border border-dashed border-border bg-surface/80 px-4 py-12 text-center text-sm text-muted">
          No curriculum distribution is available yet.
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-border bg-panel/90 p-6 shadow-glow">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-copy">Curriculum distribution</h2>
          <p className="text-sm text-muted">Click a segment to filter the table below.</p>
        </div>
        {activeCurriculum ? (
          <button
            type="button"
            onClick={() => setCurriculum(undefined)}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted transition hover:border-accent/40 hover:text-copy"
          >
            Clear filter
          </button>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
        <div className="h-64" aria-label="Donut chart of published practice-ready questions by curriculum">
          <ResponsiveContainer width="100%" height="100%" minWidth={240} minHeight={240}>
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="topic"
                innerRadius={56}
                outerRadius={88}
                paddingAngle={3}
                onClick={handleSegmentClick}
              >
                {data.map((entry, index) => (
                  <Cell
                    key={entry.topic}
                    fill={chartColors[index % chartColors.length]}
                    opacity={!activeCurriculum || activeCurriculum === entry.topic ? 1 : 0.45}
                    cursor="pointer"
                  />
                ))}
              </Pie>
              <Tooltip content={<TooltipContent />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="space-y-2">
          {data.map((entry, index) => {
            const isActive = activeCurriculum === entry.topic
            return (
              <button
                key={entry.topic}
                type="button"
                onClick={() => setCurriculum(isActive ? undefined : entry.topic)}
                className={[
                  "flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition",
                  isActive
                    ? "border-accent/40 bg-accent/10 text-copy"
                    : "border-border bg-surface/80 text-copy hover:border-accent/30",
                ].join(" ")}
              >
                <span className="flex items-center gap-3">
                  <span className={`h-3 w-3 rounded-full ${legendDotClasses[index % legendDotClasses.length]}`} />
                  <span>
                    <span className="block text-sm font-semibold">{entry.topic}</span>
                    <span className="block text-xs text-muted">{entry.count} questions</span>
                  </span>
                </span>
                <span className="text-sm font-semibold">{entry.percentage}%</span>
              </button>
            )
          })}
        </div>
      </div>

      <table className="sr-only">
        <caption>Published practice-ready questions by curriculum</caption>
        <thead>
          <tr>
            <th>Curriculum</th>
            <th>Questions</th>
            <th>Percentage</th>
          </tr>
        </thead>
        <tbody>
          {data.map((entry) => (
            <tr key={entry.topic}>
              <td>{entry.topic}</td>
              <td>{entry.count}</td>
              <td>{entry.percentage}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
