"use client"

import type { DashboardSessionBarPoint } from "@/lib/qbank"
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

function barColor(score: number) {
  if (score >= 80) return "#10B981"
  if (score >= 60) return "#F59E0B"
  return "#EF4444"
}

function TooltipContent({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: DashboardSessionBarPoint }>
}) {
  if (!active || !payload?.[0]) return null

  const point = payload[0].payload
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-copy shadow-glow">
      <p className="font-semibold">{point.label}</p>
      <p className="text-muted">
        {point.correct}/{point.answered} correct · {point.score}%
      </p>
      <p className="text-muted">{point.completedAt ? "Completed" : "In progress"}</p>
    </div>
  )
}

export function SessionsChart({ data }: { data: DashboardSessionBarPoint[] }) {
  if (data.length === 0) {
    return (
      <section className="rounded-2xl border border-border bg-panel/90 p-6 shadow-glow">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-copy">Recent sessions</h2>
          <p className="text-sm text-muted">Accuracy by session over your most recent runs.</p>
        </div>
        <div className="mt-5 rounded-2xl border border-dashed border-border bg-surface/80 px-4 py-12 text-center text-sm text-muted">
          No practice sessions yet. Start a session to build a performance history.
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-border bg-panel/90 p-6 shadow-glow">
      <div className="mb-5 space-y-1">
        <h2 className="text-xl font-semibold text-copy">Recent sessions</h2>
        <p className="text-sm text-muted">Accuracy by session over your most recent runs.</p>
      </div>

      <div className="h-72" aria-label="Horizontal bar chart of recent session scores">
        <ResponsiveContainer width="100%" height="100%" minWidth={240} minHeight={240}>
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 16 }}>
            <XAxis
              type="number"
              domain={[0, 100]}
              tickFormatter={(value) => `${value}%`}
              tick={{ fill: "#A0AEC0", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              dataKey="label"
              type="category"
              tick={{ fill: "#A0AEC0", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={88}
            />
            <Tooltip content={<TooltipContent />} />
            <Bar dataKey="score" radius={[0, 10, 10, 0]}>
              <LabelList
                dataKey="score"
                position="right"
                formatter={(value) => `${value ?? 0}%`}
                className="fill-copy text-xs font-semibold"
              />
              {data.map((entry) => (
                <Cell key={entry.id} fill={barColor(entry.score)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <table className="sr-only">
        <caption>Recent session scores</caption>
        <thead>
          <tr>
            <th>Session</th>
            <th>Answered</th>
            <th>Correct</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {data.map((entry) => (
            <tr key={entry.id}>
              <td>{entry.label}</td>
              <td>{entry.answered}</td>
              <td>{entry.correct}</td>
              <td>{entry.score}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
