import type { ReactNode } from "react"

export function MetricCard({
  label,
  value,
  subtitle,
  trend,
  progress,
  icon,
}: {
  label: string
  value: string | number
  subtitle?: string
  trend?: { direction: "up" | "down"; value: string }
  progress?: number
  icon?: ReactNode
}) {
  const progressWidth = Math.max(0, Math.min(progress ?? 0, 100))
  const activeSegments = Math.round(progressWidth / 10)

  return (
    <article className="rounded-2xl border border-border bg-panel/90 p-5 shadow-glow transition duration-200 hover:-translate-y-0.5 hover:border-accent/30">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted">{label}</p>
          <p className="mt-3 text-4xl font-semibold tracking-tight text-copy sm:text-5xl">{value}</p>
        </div>
        {icon ? (
          <div className="rounded-2xl border border-accent/20 bg-accent/10 p-3 text-accent">
            {icon}
          </div>
        ) : null}
      </div>

      {subtitle ? <p className="mt-4 text-sm text-muted">{subtitle}</p> : null}

      {trend ? (
        <p
          className={[
            "mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
            trend.direction === "up"
              ? "border-success/30 bg-success/10 text-success"
              : "border-danger/30 bg-danger/10 text-danger",
          ].join(" ")}
        >
          {trend.direction === "up" ? "Up" : "Down"} {trend.value}
        </p>
      ) : null}

      {typeof progress === "number" ? (
        <div className="mt-4">
          <div className="grid grid-cols-10 gap-1" aria-hidden="true">
            {Array.from({ length: 10 }, (_, index) => (
              <span
                key={index}
                className={[
                  "h-2 rounded-full",
                  index < activeSegments ? "bg-gradient-to-r from-accent to-accent-strong" : "bg-surface",
                ].join(" ")}
              />
            ))}
          </div>
        </div>
      ) : null}
    </article>
  )
}
