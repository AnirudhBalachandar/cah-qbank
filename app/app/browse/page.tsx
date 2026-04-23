import Link from "next/link"

import { AppShell } from "@/components/app-shell"
import { getBrowseData } from "@/lib/qbank"

function topicSummary(question: {
  tags: Array<{ name: string; kind: string }>
}) {
  return question.tags
    .filter((tag) => tag.kind === "topic")
    .map((tag) => tag.name)
    .join(" · ")
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
  const buildPageHref = (page: number) => {
    const nextParams = new URLSearchParams()
    nextParams.set("page", String(page))

    if (typeof params.q === "string" && params.q) {
      nextParams.set("q", params.q)
    }
    if (typeof params.curriculum === "string" && params.curriculum) {
      nextParams.set("curriculum", params.curriculum)
    }
    if (typeof params.tag === "string" && params.tag) {
      nextParams.set("tag", params.tag)
    }

    return `/browse?${nextParams.toString()}`
  }

  return (
    <AppShell
      title="Browse Questions"
      subtitle="Search the published bank, filter by curriculum or tag, and jump into the full question detail view."
    >
      <form className="grid gap-4 rounded-3xl border border-border bg-panel/90 p-6 shadow-glow md:grid-cols-[minmax(0,1fr)_220px_220px_auto]">
        <input
          type="search"
          name="q"
          defaultValue={typeof params.q === "string" ? params.q : ""}
          placeholder="Search question stems"
          className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-copy placeholder:text-muted"
        />
        <select
          name="curriculum"
          defaultValue={typeof params.curriculum === "string" ? params.curriculum : ""}
          className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-copy"
        >
          <option value="">All curricula</option>
          {[
            "General Paediatrics",
            "Paediatric Sub-specialties",
            "Paediatric Surgery",
            "Emergency Paediatrics",
            "Adolescent Medicine",
            "Community-based Paediatrics",
            "Unclassified",
          ].map((curriculum) => (
            <option key={curriculum} value={curriculum}>
              {curriculum}
            </option>
          ))}
        </select>
        <select
          name="tag"
          defaultValue={typeof params.tag === "string" ? params.tag : ""}
          className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-copy"
        >
          <option value="">All tags</option>
          {data.tagOptions.map((tag) => (
            <option key={tag.slug} value={tag.slug}>
              {tag.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-full bg-accent px-4 py-3 text-sm font-semibold text-canvas"
        >
          Apply
        </button>
      </form>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">{data.total} questions</p>
          <p className="text-sm text-muted">
            Page {data.page} of {data.pageCount}
          </p>
        </div>

        <div className="space-y-3">
          {data.questions.map((question) => (
            <article
              key={question.id}
              className="rounded-3xl border border-border bg-panel/90 p-5 shadow-glow"
            >
              <div className="flex flex-wrap gap-2 text-xs text-muted">
                <span className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-accent">{question.curriculum}</span>
                {!question.isAnswerable ? (
                  <span className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-warning">
                    Browse only
                  </span>
                ) : null}
                {question.flagged ? (
                  <span className="rounded-full border border-danger/30 bg-danger/10 px-2.5 py-1 text-danger">
                    Flagged
                  </span>
                ) : null}
              </div>
              <h2 className="mt-3 text-lg font-semibold leading-relaxed text-copy">
                {question.stem}
              </h2>
              {topicSummary(question) ? (
                <p className="mt-3 text-sm text-muted">{topicSummary(question)}</p>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <Link
                  href={`/question/${question.id}`}
                  className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-copy transition hover:border-accent/30"
                >
                  Open question
                </Link>
              </div>
            </article>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          {data.page > 1 ? (
            <Link
              href={buildPageHref(data.page - 1)}
              className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-copy transition hover:border-accent/30"
            >
              Previous page
            </Link>
          ) : null}
          {data.page < data.pageCount ? (
            <Link
              href={buildPageHref(data.page + 1)}
              className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-copy transition hover:border-accent/30"
            >
              Next page
            </Link>
          ) : null}
        </div>
      </section>
    </AppShell>
  )
}
