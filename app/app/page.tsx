import { Suspense } from "react"

import { AppShell } from "@/components/app-shell"
import { DashboardCharts } from "@/components/dashboard/DashboardCharts"
import { MetricCard } from "@/components/dashboard/MetricCard"
import { QuestionTable } from "@/components/dashboard/QuestionTable"
import {
  getDashboardData,
  getQuestionListData,
  type QuestionListInput,
  type QuestionSortField,
  type SortDirection,
} from "@/lib/qbank"

const validSortFields: QuestionSortField[] = ["createdAt", "stem", "curriculum", "difficulty", "score", "attempts"]

function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key]
  return typeof value === "string" ? value : undefined
}

function parseFilters(
  params: Record<string, string | string[] | undefined>,
): QuestionListInput {
  const sortParam = readParam(params, "sort")
  const directionParam = readParam(params, "direction")

  return {
    q: readParam(params, "q"),
    curriculum: readParam(params, "curriculum"),
    difficulty: readParam(params, "difficulty"),
    flagged: readParam(params, "flagged") === "true",
    sort: sortParam && validSortFields.includes(sortParam as QuestionSortField)
      ? (sortParam as QuestionSortField)
      : undefined,
    direction: directionParam === "asc" || directionParam === "desc"
      ? (directionParam as SortDirection)
      : undefined,
    page: Number(readParam(params, "page") ?? "1"),
    pageSize: Number(readParam(params, "pageSize") ?? "10"),
  }
}

function buildExportHref(filters: QuestionListInput) {
  const params = new URLSearchParams()
  if (filters.q) params.set("q", filters.q)
  if (filters.curriculum) params.set("curriculum", filters.curriculum)
  if (filters.difficulty) params.set("difficulty", filters.difficulty)
  if (filters.flagged) params.set("flagged", "true")
  if (filters.sort) params.set("sort", filters.sort)
  if (filters.direction) params.set("direction", filters.direction)
  return params.size ? `/api/questions/export?${params.toString()}` : "/api/questions/export"
}

function formatHoursAndMinutes(totalMs: number) {
  if (totalMs <= 0) return "0m"

  const totalMinutes = Math.round(totalMs / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

function DashboardSummarySkeleton() {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="animate-pulse rounded-2xl border border-border bg-panel/90 p-5">
            <div className="h-4 w-28 rounded bg-surface" />
            <div className="mt-4 h-12 w-20 rounded bg-surface" />
            <div className="mt-4 h-2 w-full rounded bg-surface" />
          </div>
        ))}
      </section>
      <section className="grid gap-6 xl:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="animate-pulse rounded-2xl border border-border bg-panel/90 p-6">
            <div className="h-5 w-40 rounded bg-surface" />
            <div className="mt-3 h-64 rounded-2xl bg-surface" />
          </div>
        ))}
      </section>
    </div>
  )
}

function DashboardTableSkeleton() {
  return (
    <section className="animate-pulse rounded-2xl border border-border bg-panel/90 p-6">
      <div className="h-5 w-40 rounded bg-surface" />
      <div className="mt-4 grid gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="h-12 rounded-2xl bg-surface" />
        ))}
      </div>
      <div className="mt-6 space-y-3">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-16 rounded-2xl bg-surface" />
        ))}
      </div>
    </section>
  )
}

async function DashboardSummary({
  activeCurriculum,
}: {
  activeCurriculum?: string
}) {
  const dashboard = await getDashboardData()
  const totalCurricula = Math.max(dashboard.topicDistribution.length, 1)
  const practiceReadyProgress =
    dashboard.publishedCount === 0 ? 0 : (dashboard.answerableCount / dashboard.publishedCount) * 100
  const completedProgress = (dashboard.modulesCompleted / totalCurricula) * 100

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Published questions"
          value={dashboard.publishedCount}
          subtitle="Total records currently available in the local bank."
          progress={100}
          icon={<span className="text-sm font-bold">Q</span>}
        />
        <MetricCard
          label="Practice-ready"
          value={dashboard.answerableCount}
          subtitle={`${dashboard.publishedCount === 0 ? 0 : Math.round(practiceReadyProgress)}% of published content`}
          progress={practiceReadyProgress}
          icon={<span className="text-sm font-bold">R</span>}
        />
        <MetricCard
          label="Flagged"
          value={dashboard.flaggedCount}
          subtitle="Questions you marked for review."
          icon={<span className="text-sm font-bold">F</span>}
        />
        <MetricCard
          label="Notes"
          value={dashboard.noteCount}
          subtitle="Private notes attached to question records."
          icon={<span className="text-sm font-bold">N</span>}
        />
        <MetricCard
          label="Accuracy %"
          value={`${dashboard.accuracyPercent}%`}
          subtitle="Correct answers across all recorded attempts."
          progress={dashboard.accuracyPercent}
          icon={<span className="text-sm font-bold">%</span>}
        />
        <MetricCard
          label="Time spent"
          value={formatHoursAndMinutes(dashboard.totalTimeSpent)}
          subtitle="Summed from attempts with tracked time."
          icon={<span className="text-sm font-bold">T</span>}
        />
        <MetricCard
          label="Streak"
          value={dashboard.currentStreak}
          subtitle="Consecutive correct answers from the latest attempt backward."
          icon={<span className="text-sm font-bold">S</span>}
        />
        <MetricCard
          label="Modules completed"
          value={dashboard.modulesCompleted}
          subtitle={`${dashboard.modulesCompleted} of ${dashboard.topicDistribution.length} curricula meet the v1 completion rule`}
          progress={completedProgress}
          icon={<span className="text-sm font-bold">M</span>}
        />
      </section>
      <DashboardCharts dashboard={dashboard} activeCurriculum={activeCurriculum} />
    </div>
  )
}

async function DashboardQuestionBrowser({ filters }: { filters: QuestionListInput }) {
  const data = await getQuestionListData(filters)

  return <QuestionTable data={data} exportHref={buildExportHref(filters)} />
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const filters = parseFilters(params)

  return (
    <AppShell
      title="Dashboard"
      subtitle="A dark analytics workspace for practice volume, performance, and question-level follow-up across the live CAH QBank data set."
    >
      <Suspense fallback={<DashboardSummarySkeleton />}>
        <DashboardSummary activeCurriculum={filters.curriculum} />
      </Suspense>
      <Suspense fallback={<DashboardTableSkeleton />}>
        <DashboardQuestionBrowser filters={filters} />
      </Suspense>
    </AppShell>
  )
}
