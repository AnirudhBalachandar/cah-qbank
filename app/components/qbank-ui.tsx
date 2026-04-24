import Link from "next/link"
import type { ReactNode } from "react"

import type { QuestionListRow } from "@/lib/qbank"

export function AccuracyText({ value }: { value: number | null }) {
  const tone = value === null ? "text-muted" : value >= 70 ? "text-success" : value <= 30 ? "text-danger" : "text-warning"
  return <span className={`font-semibold ${tone}`}>{value === null ? "New" : `${Math.round(value)}%`}</span>
}

export function FilterChip({
  children,
  active = false,
}: {
  children: ReactNode
  active?: boolean
}) {
  return (
    <span
      className={[
        "inline-flex min-h-8 items-center rounded-md border px-3 text-xs font-semibold",
        active ? "border-accent/20 bg-accent/10 text-accent" : "border-border bg-surface text-muted",
      ].join(" ")}
    >
      {children}
    </span>
  )
}

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode
  tone?: "neutral" | "success" | "danger" | "warning" | "accent"
}) {
  const classes = {
    neutral: "border-border bg-canvas text-muted",
    success: "border-success/20 bg-success/10 text-success",
    danger: "border-danger/20 bg-danger/10 text-danger",
    warning: "border-warning/20 bg-warning/10 text-warning",
    accent: "border-accent/20 bg-accent/10 text-accent",
  }[tone]

  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-bold ${classes}`}>
      {children}
    </span>
  )
}

export function ProgressLine({
  value,
  tone = "success",
}: {
  value: number
  tone?: "success" | "accent" | "danger"
}) {
  const color = tone === "accent" ? "bg-accent" : tone === "danger" ? "bg-danger" : "bg-success"
  return (
    <span className="block h-2 overflow-hidden rounded-full bg-border/70">
      <span className={`block h-full rounded-full ${color}`} style={{ width: `${Math.max(4, Math.min(value, 100))}%` }} />
    </span>
  )
}

export function TopicProgressRow({
  name,
  detail,
  value,
  checked = false,
}: {
  name: string
  detail: string
  value: number
  checked?: boolean
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_96px] items-center gap-3 rounded-md px-2 py-2 hover:bg-canvas">
      <span
        className={[
          "grid h-5 w-5 place-items-center rounded border text-[10px] font-bold",
          checked ? "border-accent bg-accent text-white" : "border-border bg-surface text-transparent",
        ].join(" ")}
        aria-hidden="true"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-copy">{name}</p>
        <ProgressLine value={value} />
      </div>
      <p className="text-right text-xs font-medium text-muted">{detail}</p>
    </div>
  )
}

export function QuestionPreviewCard({
  question,
  compact = false,
}: {
  question: QuestionListRow
  compact?: boolean
}) {
  const topics = question.tags.filter((tag) => tag.kind === "topic").slice(0, compact ? 2 : 3)

  return (
    <article className="rounded-lg border border-border bg-surface p-4 shadow-card transition hover:border-accent/30">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-muted">Q-{question.id.slice(0, 5).toUpperCase()}</span>
            {question.flagged ? <StatusBadge tone="danger">Flagged</StatusBadge> : null}
            <StatusBadge tone={question.isAnswerable ? "success" : "warning"}>
              {question.isAnswerable ? "Answerable" : "Browse only"}
            </StatusBadge>
          </div>
          <h2 className="mt-3 line-clamp-4 text-sm font-semibold leading-6 text-copy md:text-base">
            {question.stem}
          </h2>
        </div>
        <span aria-hidden="true" className={question.flagged ? "text-danger" : "text-warning"}>
          {question.flagged ? "!" : "*"}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <FilterChip active>{question.curriculum}</FilterChip>
        {topics.map((tag) => (
          <FilterChip key={tag.slug}>{tag.name}</FilterChip>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-3 text-xs text-muted">
        <span>{question.attemptCount} {question.attemptCount === 1 ? "attempt" : "attempts"}</span>
        <span>{question.correctCount} correct</span>
        <AccuracyText value={question.yourScorePercent} />
        <Link
          href={question.isAnswerable ? `/practice/new?questionId=${question.id}` : `/question/${question.id}`}
          className="rounded-md bg-accent px-4 py-2 text-xs font-bold text-white transition hover:bg-accent-strong"
        >
          {question.isAnswerable ? "Practice" : "Open"}
        </Link>
      </div>
    </article>
  )
}

export function ProgressMetricCard({
  label,
  value,
  trend,
}: {
  label: string
  value: ReactNode
  trend?: string
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-copy">{value}</p>
      {trend ? <p className="mt-1 text-xs font-semibold text-success">{trend}</p> : null}
    </div>
  )
}

export function WeakTopicCard({
  name,
  percent,
  href,
}: {
  name: string
  percent: number
  href: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-surface p-3">
      <span className="rounded-md bg-danger/10 px-2 py-1 text-xs font-bold text-danger">{percent}%</span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-copy">{name}</span>
      <Link href={href} className="text-xs font-bold text-accent">
        Practice
      </Link>
    </div>
  )
}
