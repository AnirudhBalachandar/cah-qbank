import type { DashboardHeatmapPoint } from "@/lib/qbank"

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value))
}

export function HeatmapChart({ data }: { data: DashboardHeatmapPoint[] }) {
  const maxValue = Math.max(...data.map((point) => point.value), 0)
  const valueByDate = new Map(data.map((point) => [point.date, point.value]))
  const firstDate = new Date(data[0]?.date ?? new Date().toISOString())
  const start = new Date(firstDate)
  start.setUTCDate(start.getUTCDate() - start.getUTCDay())

  const cells = Array.from({ length: 56 }, (_, index) => {
    const cellDate = new Date(start)
    cellDate.setUTCDate(start.getUTCDate() + index)
    const isoDate = cellDate.toISOString().slice(0, 10)
    const value = valueByDate.get(isoDate) ?? 0
    const intensity = maxValue === 0 ? 0 : Math.ceil((value / maxValue) * 4)

    return {
      isoDate,
      value,
      intensity,
    }
  })

  return (
    <section className="rounded-2xl border border-border bg-panel/90 p-6 shadow-glow">
      <div className="mb-5 space-y-1">
        <h2 className="text-xl font-semibold text-copy">Activity heatmap</h2>
        <p className="text-sm text-muted">Daily answer volume over the last eight weeks.</p>
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-4">
        <div className="grid grid-rows-8 gap-1 text-xs text-muted">
          {Array.from({ length: 8 }, (_, index) => (
            <span key={index} className="flex h-8 items-center">
              W{index + 1}
            </span>
          ))}
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">
            {weekdayLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1" aria-label="Heatmap of activity counts by day">
            {cells.map((cell) => (
              <div
                key={cell.isoDate}
                title={`${formatDateLabel(cell.isoDate)}: ${cell.value} attempts`}
                className={[
                  "h-8 rounded-lg border border-border transition hover:border-accent/50",
                  cell.intensity === 0 && "bg-surface",
                  cell.intensity === 1 && "bg-accent/15",
                  cell.intensity === 2 && "bg-accent/30",
                  cell.intensity === 3 && "bg-accent/50",
                  cell.intensity >= 4 && "bg-accent/80",
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
            ))}
          </div>
        </div>
      </div>

      <table className="sr-only">
        <caption>Activity count per day over the last eight weeks</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Attempts</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.date}>
              <td>{formatDateLabel(point.date)}</td>
              <td>{point.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
