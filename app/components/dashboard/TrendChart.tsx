"use client"

import type { DashboardTrendPoint } from "@/lib/qbank"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
  }).format(new Date(value))
}

function TooltipContent({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ payload: DashboardTrendPoint }>
  label?: string
}) {
  if (!active || !payload?.[0]) return null

  const point = payload[0].payload
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-copy shadow-glow">
      <p className="font-semibold">{formatDateLabel(label ?? point.date)}</p>
      <p className="text-muted">
        {point.score === null ? "No attempts" : `${point.score}% score`} · {point.attempts} attempts
      </p>
    </div>
  )
}

export function TrendChart({ data }: { data: DashboardTrendPoint[] }) {
  const hasActivity = data.some((point) => point.attempts > 0)

  if (!hasActivity) {
    return (
      <section className="rounded-2xl border border-border bg-panel/90 p-6 shadow-glow">
        <div className="mb-5 space-y-1">
          <h2 className="text-xl font-semibold text-copy">30-day performance</h2>
          <p className="text-sm text-muted">Daily accuracy over the last month.</p>
        </div>
        <div className="rounded-2xl border border-dashed border-border bg-surface/80 px-4 py-12 text-center text-sm text-muted">
          No answered questions yet. Daily performance will appear after the first completed attempts.
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-border bg-panel/90 p-6 shadow-glow">
      <div className="mb-5 space-y-1">
        <h2 className="text-xl font-semibold text-copy">30-day performance</h2>
        <p className="text-sm text-muted">Daily accuracy over the last month.</p>
      </div>

      <div className="h-72" aria-label="Line chart of daily score percentages over the last 30 days">
        <ResponsiveContainer width="100%" height="100%" minWidth={240} minHeight={240}>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: -16 }}>
            <CartesianGrid stroke="rgba(160, 174, 192, 0.12)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDateLabel}
              tick={{ fill: "#A0AEC0", fontSize: 12 }}
              axisLine={{ stroke: "rgba(160, 174, 192, 0.18)" }}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              domain={[0, 100]}
              tickFormatter={(value) => `${value}%`}
              tick={{ fill: "#A0AEC0", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip content={<TooltipContent />} />
            <Line
              type="monotone"
              dataKey="score"
              stroke="#00D9FF"
              strokeWidth={3}
              connectNulls={false}
              dot={{ r: 4, strokeWidth: 0, fill: "#00D9FF" }}
              activeDot={{ r: 5, strokeWidth: 0, fill: "#FFFFFF" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <table className="sr-only">
        <caption>Daily score percentages over the last 30 days</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Attempts</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.date}>
              <td>{formatDateLabel(point.date)}</td>
              <td>{point.attempts}</td>
              <td>{point.score === null ? "No attempts" : `${point.score}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
