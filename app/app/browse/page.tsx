import Link from "next/link"

import { AppShell } from "@/components/app-shell"
import { FilterChip, ProgressLine, QuestionPreviewCard, StatusBadge, TopicProgressRow } from "@/components/qbank-ui"
import { getBrowseData } from "@/lib/qbank"

const curricula = [
  "General Paediatrics",
  "Paediatric Sub-specialties",
  "Paediatric Surgery",
  "Emergency Paediatrics",
  "Adolescent Medicine",
  "Community-based Paediatrics",
  "Unclassified",
]

function percent(part: number, total: number) {
  if (total <= 0) return 0
  return Math.round((part / total) * 100)
}

function buildPageHref(page: number, params: Record<string, string | string[] | undefined>) {
  const nextParams = new URLSearchParams()
  nextParams.set("page", String(page))
  for (const key of ["q", "curriculum", "tag"]) {
    if (typeof params[key] === "string" && params[key]) {
      nextParams.set(key, params[key])
    }
  }
  return `/browse?${nextParams.toString()}`
}

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const data = await getBrowseData({
    page: typeof params.page === "string" ? Number(params.page) : 1,
    search: typeof params.q === "string" ? params.q : undefined,
    curriculum: typeof params.curriculum === "string" ? params.curriculum : undefined,
    tag: typeof params.tag === "string" ? params.tag : undefined,
  })
  const activeCurriculum = typeof params.curriculum === "string" ? params.curriculum : ""
  const activeTag = typeof params.tag === "string" ? params.tag : ""
  const answerable = data.questions.filter((question) => question.isAnswerable).length
  const flagged = data.questions.filter((question) => question.flagged).length

  return (
    <AppShell
      title="Browse Questions"
      subtitle="Search the published bank, review question history, and launch focused one-question practice."
    >
      <section className="md:hidden">
        <div className="space-y-4">
          <div>
            <h1 className="text-xl font-bold text-accent">CAH QBank</h1>
          </div>
          <form className="flex gap-2">
            <label className="sr-only" htmlFor="mobile-q">
              Search questions
            </label>
            <input
              id="mobile-q"
              type="search"
              name="q"
              defaultValue={typeof params.q === "string" ? params.q : ""}
              placeholder="Search topics, keywords, stem, or ID..."
              className="min-h-11 flex-1 rounded-lg border border-border bg-surface px-3 text-sm text-copy shadow-sm"
            />
            <button
              type="submit"
              className="grid min-h-11 w-11 place-items-center rounded-lg border border-border bg-surface text-copy"
              aria-label="Apply filters"
            >
              <span aria-hidden="true">=</span>
            </button>
          </form>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <FilterChip active>{activeCurriculum || "RACP (Paediatrics)"}</FilterChip>
            <FilterChip active>{data.tagOptions.find((tag) => tag.slug === activeTag)?.name ?? "Respiratory"}</FilterChip>
            <FilterChip>SBA</FilterChip>
            <FilterChip>Source: AI</FilterChip>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted">{data.total.toLocaleString()} questions found</p>
            <button className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-copy">
              Most relevant
            </button>
          </div>
          <div className="space-y-3">
            {data.questions.map((question) => (
              <QuestionPreviewCard key={question.id} question={question} compact />
            ))}
          </div>
        </div>
      </section>

      <section className="hidden gap-5 md:grid md:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <form className="rounded-lg border border-border bg-surface p-4 shadow-card">
            <label htmlFor="q" className="text-xs font-bold uppercase tracking-wide text-muted">
              Search
            </label>
            <input
              id="q"
              type="search"
              name="q"
              defaultValue={typeof params.q === "string" ? params.q : ""}
              placeholder="Question stem or keyword"
              className="mt-2 min-h-11 w-full rounded-md border border-border bg-canvas px-3 text-sm text-copy"
            />
            <label htmlFor="curriculum" className="mt-4 block text-xs font-bold uppercase tracking-wide text-muted">
              Curriculum
            </label>
            <select
              id="curriculum"
              name="curriculum"
              defaultValue={activeCurriculum}
              className="mt-2 min-h-11 w-full rounded-md border border-border bg-canvas px-3 text-sm text-copy"
            >
              <option value="">All curricula</option>
              {curricula.map((curriculum) => (
                <option key={curriculum} value={curriculum}>
                  {curriculum}
                </option>
              ))}
            </select>
            <label htmlFor="tag" className="mt-4 block text-xs font-bold uppercase tracking-wide text-muted">
              Topic
            </label>
            <select
              id="tag"
              name="tag"
              defaultValue={activeTag}
              className="mt-2 min-h-11 w-full rounded-md border border-border bg-canvas px-3 text-sm text-copy"
            >
              <option value="">All topics</option>
              {data.tagOptions.map((tag) => (
                <option key={tag.slug} value={tag.slug}>
                  {tag.name}
                </option>
              ))}
            </select>
            <button type="submit" className="mt-4 min-h-11 w-full rounded-md bg-accent px-4 text-sm font-bold text-white">
              Apply filters
            </button>
          </form>

          <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
            <h2 className="text-sm font-bold text-copy">Question coverage</h2>
            <div className="mt-3 space-y-2">
              <TopicProgressRow name="All questions" detail={`${answerable} on page`} value={percent(answerable, data.questions.length)} checked />
              {curricula.slice(0, 5).map((curriculum) => {
                const count = data.questions.filter((question) => question.curriculum === curriculum).length
                return (
                  <TopicProgressRow
                    key={curriculum}
                    name={curriculum}
                    detail={`${count} shown`}
                    value={percent(count, Math.max(data.questions.length, 1))}
                    checked={activeCurriculum === curriculum}
                  />
                )
              })}
            </div>
          </div>
        </aside>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-copy">{data.total.toLocaleString()} published questions</p>
                <p className="text-xs text-muted">
                  Page {data.page} of {data.pageCount} · {flagged} flagged on this page
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge tone="success">{answerable} answerable</StatusBadge>
                <StatusBadge tone="warning">{data.questions.length - answerable} browse only</StatusBadge>
              </div>
            </div>
            <div className="mt-3">
              <ProgressLine value={percent(answerable, Math.max(data.questions.length, 1))} tone="accent" />
            </div>
          </div>

          <div className="space-y-3">
            {data.questions.map((question) => (
              <QuestionPreviewCard key={question.id} question={question} />
            ))}
          </div>

          <div className="flex flex-wrap justify-between gap-3">
            {data.page > 1 ? (
              <Link href={buildPageHref(data.page - 1, params)} className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-bold text-copy">
                Previous page
              </Link>
            ) : <span />}
            {data.page < data.pageCount ? (
              <Link href={buildPageHref(data.page + 1, params)} className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-bold text-copy">
                Next page
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    </AppShell>
  )
}
