"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Fragment, useEffect, useMemo, useState } from "react"

import type { QuestionListResult, QuestionListRow, QuestionSortField } from "@/lib/qbank"
import { useToast } from "@/components/ui/toast-provider"

function difficultyClasses(difficulty: string | null) {
  const normalized = difficulty?.toLowerCase() ?? ""
  if (normalized.includes("basic") || normalized.includes("easy")) {
    return "border-success/30 bg-success/10 text-success"
  }
  if (normalized.includes("intermediate") || normalized.includes("medium")) {
    return "border-warning/30 bg-warning/10 text-warning"
  }
  if (normalized.includes("expert")) {
    return "border-violet/30 bg-violet/10 text-violet"
  }
  if (normalized.includes("hard")) {
    return "border-danger/30 bg-danger/10 text-danger"
  }
  return "border-border bg-surface text-muted"
}

function scoreLabel(question: QuestionListRow) {
  return question.yourScorePercent === null ? "--" : `${question.yourScorePercent}%`
}

function SortButton({
  label,
  field,
  activeField,
  direction,
  onClick,
}: {
  label: string
  field: QuestionSortField
  activeField: QuestionSortField
  direction: "asc" | "desc"
  onClick: (field: QuestionSortField) => void
}) {
  const active = field === activeField

  return (
    <button
      type="button"
      onClick={() => onClick(field)}
      className="inline-flex items-center gap-2 text-left text-xs font-semibold uppercase tracking-wide text-muted transition hover:text-copy"
    >
      <span>{label}</span>
      {active ? <span className="text-[10px] text-accent">{direction === "asc" ? "ASC" : "DESC"}</span> : null}
    </button>
  )
}

export function QuestionTable({
  data,
  exportHref,
}: {
  data: QuestionListResult
  exportHref: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const showToast = useToast()
  const [searchValue, setSearchValue] = useState(data.filters.q)
  const [expandedIds, setExpandedIds] = useState<string[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const currentPageIds = useMemo(() => data.questions.map((question) => question.id), [data.questions])
  const selectedOnPage = currentPageIds.filter((id) => selectedIds.includes(id))
  const allSelectedOnPage = currentPageIds.length > 0 && selectedOnPage.length === currentPageIds.length

  useEffect(() => {
    setSearchValue(data.filters.q)
  }, [data.filters.q])

  useEffect(() => {
    setExpandedIds((current) => current.filter((id) => currentPageIds.includes(id)))
    setSelectedIds((current) => current.filter((id) => currentPageIds.includes(id)))
  }, [currentPageIds])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (searchValue === data.filters.q) return

      const next = new URLSearchParams(searchParams.toString())
      if (searchValue.trim()) {
        next.set("q", searchValue.trim())
      } else {
        next.delete("q")
      }
      next.delete("page")
      router.replace(next.size ? `${pathname}?${next.toString()}` : pathname)
    }, 300)

    return () => window.clearTimeout(timeout)
  }, [data.filters.q, pathname, router, searchParams, searchValue])

  const updateParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        next.set(key, value)
      } else {
        next.delete(key)
      }
    }
    if ("curriculum" in updates || "difficulty" in updates || "flagged" in updates || "pageSize" in updates) {
      next.delete("page")
    }
    router.replace(next.size ? `${pathname}?${next.toString()}` : pathname)
  }

  const toggleSort = (field: QuestionSortField) => {
    const nextDirection =
      data.filters.sort === field && data.filters.direction === "asc" ? "desc" : "asc"
    updateParams({
      sort: field,
      direction: nextDirection,
    })
  }

  const toggleExpanded = (questionId: string) => {
    setExpandedIds((current) =>
      current.includes(questionId) ? current.filter((id) => id !== questionId) : [...current, questionId],
    )
  }

  const toggleSelected = (questionId: string) => {
    setSelectedIds((current) =>
      current.includes(questionId) ? current.filter((id) => id !== questionId) : [...current, questionId],
    )
  }

  const toggleSelectPage = () => {
    if (allSelectedOnPage) {
      setSelectedIds((current) => current.filter((id) => !currentPageIds.includes(id)))
      return
    }

    setSelectedIds((current) => Array.from(new Set([...current, ...currentPageIds])))
  }

  const clearFilters = () => {
    setSearchValue("")
    router.replace(pathname)
    showToast("Dashboard filters cleared")
  }

  const downloadCsv = () => {
    showToast("Downloading filtered CSV")
    window.location.assign(exportHref)
  }

  const renderExpandedPanel = (question: QuestionListRow) => (
    <div className="rounded-2xl border border-border bg-surface/80 p-4 text-sm text-muted">
      <p className="font-semibold text-copy">{question.stem}</p>
      {question.explanation ? (
        <p className="mt-3 leading-6 text-muted">{question.explanation}</p>
      ) : (
        <p className="mt-3 leading-6 text-muted">No explanation recorded for this question yet.</p>
      )}
    </div>
  )

  return (
    <section className="rounded-2xl border border-border bg-panel/90 p-6 shadow-glow">
      <div className="flex flex-col gap-4 border-b border-border pb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-copy">Question browser</h2>
            <p className="text-sm text-muted">
              Search, sort, and filter against the live question set.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedIds.length > 0 ? (
              <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
                {selectedIds.length} selected
              </span>
            ) : null}
            <button
              type="button"
              onClick={downloadCsv}
              className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-canvas transition hover:bg-accent-strong"
            >
              Export
            </button>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,0.7fr))_auto]">
          <input
            type="search"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Search title or explanation"
            className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-copy placeholder:text-muted"
          />
          <select
            value={data.filters.curriculum}
            onChange={(event) => updateParams({ curriculum: event.target.value || null })}
            className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-copy"
          >
            <option value="">All curricula</option>
            {data.curriculumOptions.map((curriculum) => (
              <option key={curriculum} value={curriculum}>
                {curriculum}
              </option>
            ))}
          </select>
          <select
            value={data.filters.difficulty}
            onChange={(event) => updateParams({ difficulty: event.target.value || null })}
            className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-copy"
          >
            <option value="">All difficulties</option>
            {data.difficultyOptions.map((difficulty) => (
              <option key={difficulty} value={difficulty}>
                {difficulty}
              </option>
            ))}
          </select>
          <select
            value={String(data.pageSize)}
            onChange={(event) => updateParams({ pageSize: event.target.value })}
            className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-copy"
          >
            {[10, 25, 50].map((size) => (
              <option key={size} value={String(size)}>
                {size} rows
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => updateParams({ flagged: data.filters.flagged ? null : "true" })}
            className={[
              "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
              data.filters.flagged
                ? "border-accent/30 bg-accent/10 text-accent"
                : "border-border bg-surface text-muted hover:text-copy",
            ].join(" ")}
          >
            Flagged only
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {data.total} questions · page {data.page} of {data.pageCount}
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted transition hover:text-copy"
          >
            Reset filters
          </button>
        </div>
      </div>

      {data.questions.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-surface/80 px-4 py-12 text-center">
          <p className="text-lg font-semibold text-copy">No questions match this view.</p>
          <p className="mt-2 text-sm text-muted">Try a broader curriculum, remove the flagged filter, or clear the search term.</p>
        </div>
      ) : (
        <>
          <div className="mt-6 hidden overflow-hidden rounded-2xl border border-border sm:block">
            <table className="min-w-full divide-y divide-border text-left text-sm">
              <thead className="bg-surface/90">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allSelectedOnPage}
                      onChange={toggleSelectPage}
                      aria-label="Select all questions on this page"
                    />
                  </th>
                  <th className="w-10 px-2 py-3" />
                  <th className="px-4 py-3">
                    <SortButton
                      label="Title"
                      field="stem"
                      activeField={data.filters.sort}
                      direction={data.filters.direction}
                      onClick={toggleSort}
                    />
                  </th>
                  <th className="px-4 py-3">
                    <SortButton
                      label="Topic"
                      field="curriculum"
                      activeField={data.filters.sort}
                      direction={data.filters.direction}
                      onClick={toggleSort}
                    />
                  </th>
                  <th className="px-4 py-3">
                    <SortButton
                      label="Difficulty"
                      field="difficulty"
                      activeField={data.filters.sort}
                      direction={data.filters.direction}
                      onClick={toggleSort}
                    />
                  </th>
                  <th className="px-4 py-3">
                    <SortButton
                      label="Your score"
                      field="score"
                      activeField={data.filters.sort}
                      direction={data.filters.direction}
                      onClick={toggleSort}
                    />
                  </th>
                  <th className="px-4 py-3">
                    <SortButton
                      label="Attempts"
                      field="attempts"
                      activeField={data.filters.sort}
                      direction={data.filters.direction}
                      onClick={toggleSort}
                    />
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/80 bg-panel/40">
                {data.questions.map((question) => {
                  const expanded = expandedIds.includes(question.id)
                  const selected = selectedIds.includes(question.id)

                  return (
                    <Fragment key={question.id}>
                      <tr
                        className="transition hover:bg-surface/70"
                      >
                        <td className="px-4 py-4 align-top">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleSelected(question.id)}
                            aria-label={`Select ${question.stem}`}
                          />
                        </td>
                        <td className="px-2 py-4 align-top">
                          <button
                            type="button"
                            onClick={() => toggleExpanded(question.id)}
                            className="rounded-full border border-border bg-surface px-2 py-1 text-xs font-semibold text-muted transition hover:text-copy"
                            aria-expanded={expanded}
                            aria-controls={`question-row-${question.id}`}
                          >
                            {expanded ? "-" : "+"}
                          </button>
                        </td>
                        <td className="max-w-md px-4 py-4 align-top">
                          <div className="font-semibold text-copy">
                            <span className="block truncate">{question.stem}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
                            {question.topic}
                          </span>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${difficultyClasses(question.difficulty)}`}>
                            {question.difficulty ?? "Unrated"}
                          </span>
                        </td>
                        <td className="px-4 py-4 align-top font-semibold text-copy">{scoreLabel(question)}</td>
                        <td className="px-4 py-4 align-top text-muted">{question.attemptCount}</td>
                        <td className="px-4 py-4 align-top">
                          <Link
                            href={`/practice/new?questionId=${question.id}`}
                            className="inline-flex rounded-full bg-accent px-3 py-2 text-xs font-semibold text-canvas transition hover:bg-accent-strong"
                          >
                            Attempt
                          </Link>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr id={`question-row-${question.id}`}>
                          <td colSpan={8} className="px-4 pb-4">
                            {renderExpandedPanel(question)}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-6 space-y-4 sm:hidden">
            {data.questions.map((question) => {
              const expanded = expandedIds.includes(question.id)
              return (
                <article key={question.id} className="rounded-2xl border border-border bg-surface/80 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => toggleSelected(question.id)}
                      className={[
                        "rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide",
                        selectedIds.includes(question.id)
                          ? "border-accent/30 bg-accent/10 text-accent"
                          : "border-border text-muted",
                      ].join(" ")}
                    >
                      {selectedIds.includes(question.id) ? "Selected" : "Select"}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(question.id)}
                      className="rounded-full border border-border bg-panel px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted"
                    >
                      {expanded ? "Collapse" : "Expand"}
                    </button>
                  </div>

                  <p className="mt-4 text-base font-semibold leading-7 text-copy">{question.stem}</p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
                      {question.topic}
                    </span>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${difficultyClasses(question.difficulty)}`}>
                      {question.difficulty ?? "Unrated"}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl border border-border bg-panel px-3 py-2">
                      <p className="text-xs uppercase tracking-wide text-muted">Your score</p>
                      <p className="mt-1 font-semibold text-copy">{scoreLabel(question)}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-panel px-3 py-2">
                      <p className="text-xs uppercase tracking-wide text-muted">Attempts</p>
                      <p className="mt-1 font-semibold text-copy">{question.attemptCount}</p>
                    </div>
                  </div>

                  {expanded ? <div className="mt-4">{renderExpandedPanel(question)}</div> : null}

                  <Link
                    href={`/practice/new?questionId=${question.id}`}
                    className="mt-4 inline-flex rounded-full bg-accent px-4 py-2 text-sm font-semibold text-canvas"
                  >
                    Attempt
                  </Link>
                </article>
              )
            })}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => updateParams({ page: data.page > 1 ? String(data.page - 1) : null })}
              disabled={data.page <= 1}
              className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-muted transition hover:text-copy disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <p className="text-sm text-muted">
              Page {data.page} of {data.pageCount}
            </p>
            <button
              type="button"
              onClick={() =>
                updateParams({ page: data.page < data.pageCount ? String(data.page + 1) : null })
              }
              disabled={data.page >= data.pageCount}
              className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-muted transition hover:text-copy disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </>
      )}
    </section>
  )
}
