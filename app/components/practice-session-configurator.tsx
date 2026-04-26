"use client"

import { useMemo, useState } from "react"

import { startSessionAction } from "@/app/actions/practice"
import { FilterChip, ProgressLine, StatusBadge } from "@/components/qbank-ui"
import type { PracticeBlueprintNode, PracticeReviewMode } from "@/lib/qbank"

const quickCounts = [10, 20, 40, 100]
const maxPracticeQuestionCount = 500

const reviewOptions: Array<{
  value: PracticeReviewMode
  label: string
  description: string
}> = [
  {
    value: "all",
    label: "All questions",
    description: "Use every answerable question in the selected scope.",
  },
  {
    value: "new",
    label: "New only",
    description: "Only questions without a submitted answer.",
  },
  {
    value: "incorrect",
    label: "Wrong before",
    description: "Only questions with at least one previous incorrect answer.",
  },
]

function masteryPercent(elo: number) {
  return Math.max(8, Math.min(100, Math.round(((elo - 800) / 600) * 100)))
}

function questionIdsForMode(node: PracticeBlueprintNode, reviewMode: PracticeReviewMode) {
  if (reviewMode === "new") return node.newQuestionIds
  if (reviewMode === "incorrect") return node.incorrectQuestionIds
  return node.questionIds
}

function uniqueQuestionCount(
  nodes: PracticeBlueprintNode[],
  selected: Set<string>,
  reviewMode: PracticeReviewMode,
) {
  const questionIds = new Set<string>()
  const visit = (node: PracticeBlueprintNode) => {
    if (selected.size === 0 || selected.has(node.slug)) {
      for (const questionId of questionIdsForMode(node, reviewMode)) {
        questionIds.add(questionId)
      }
    }
    for (const child of node.children) {
      visit(child)
    }
  }

  for (const node of nodes) {
    visit(node)
  }

  return questionIds.size
}

function selectedLabel(nodes: PracticeBlueprintNode[], selected: Set<string>) {
  const names: string[] = []
  const visit = (node: PracticeBlueprintNode) => {
    if (selected.has(node.slug)) {
      names.push(node.name)
    }
    for (const child of node.children) {
      visit(child)
    }
  }

  for (const node of nodes) {
    visit(node)
  }

  if (names.length === 0) {
    return "All answerable questions"
  }
  if (names.length <= 2) {
    return names.join(", ")
  }
  return `${names.slice(0, 2).join(", ")} +${names.length - 2} more`
}

export function PracticeSessionConfigurator({
  blueprint,
  defaultSelected,
  weakestTopic,
  error,
}: {
  blueprint: PracticeBlueprintNode[]
  defaultSelected?: string[]
  weakestTopic?: { name: string; elo: number } | null
  error?: string | null
}) {
  const [selected, setSelected] = useState(() => new Set(defaultSelected ?? []))
  const [reviewMode, setReviewMode] = useState<PracticeReviewMode>("all")
  const [questionCount, setQuestionCount] = useState(20)
  const selectedValues = useMemo(
    () => Array.from(selected).sort((left, right) => left.localeCompare(right)),
    [selected],
  )
  const matchingTotal = useMemo(
    () => uniqueQuestionCount(blueprint, selected, reviewMode),
    [blueprint, reviewMode, selected],
  )
  const allInScopeTotal = useMemo(
    () => uniqueQuestionCount(blueprint, selected, "all"),
    [blueprint, selected],
  )
  const selectedCount = useMemo(
    () => uniqueQuestionCount(blueprint, selected, "all"),
    [blueprint, selected],
  )
  const allCount = useMemo(() => uniqueQuestionCount(blueprint, new Set(), "all"), [blueprint])
  const scopeLabel = selectedLabel(blueprint, selected)
  const sessionQuestionTotal = Math.min(questionCount, matchingTotal)

  const toggle = (slug: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(slug)) {
        next.delete(slug)
      } else {
        next.add(slug)
      }
      return next
    })
  }

  const clear = () => setSelected(new Set())

  const updateQuestionCount = (value: number) => {
    if (!Number.isFinite(value)) {
      setQuestionCount(20)
      return
    }
    setQuestionCount(Math.max(1, Math.min(Math.trunc(value), maxPracticeQuestionCount)))
  }

  return (
    <form action={startSessionAction} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <input type="hidden" name="questionId" value="" />
      {selectedValues.map((slug) => (
        <input key={slug} type="hidden" name="tagIds" value={slug} />
      ))}

      <section className="space-y-4">
        <div className="rounded-lg border border-border bg-surface p-4 shadow-card md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-xs font-bold text-white">1</span>
              <h2 className="text-sm font-bold text-copy">Choose your blueprint scope</h2>
            </div>
            <button type="button" className="text-xs font-bold text-accent" onClick={clear}>
              All questions
            </button>
          </div>
          <div className="mt-3 rounded-md border border-border bg-canvas p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-copy">{scopeLabel}</span>
              <span className="text-xs font-bold uppercase tracking-wide text-muted">
                {(selectedCount || allCount).toLocaleString()} unique questions
              </span>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {blueprint.map((category) => (
              <details key={category.slug} className="group rounded-md border border-border bg-canvas open:bg-surface" open>
                <summary className="flex cursor-pointer list-none items-start gap-3 p-3">
                  <input
                    type="checkbox"
                    checked={selected.has(category.slug)}
                    onChange={() => toggle(category.slug)}
                    onClick={(event) => event.stopPropagation()}
                    className="mt-1 h-4 w-4 accent-accent"
                    aria-label={`Select ${category.name}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-copy">{category.name}</span>
                    <span className="text-xs text-muted">
                      {category.examPercent}% - {category.examQuestionCount}/60 - {category.questionCount.toLocaleString()} questions
                    </span>
                  </span>
                  <span className="text-xs font-bold text-muted transition group-open:rotate-90">&gt;</span>
                </summary>
                {category.children.length > 0 ? (
                  <div className="space-y-1 border-t border-border px-3 py-2">
                    {category.children.map((topic) => (
                      <label key={topic.slug} className="flex min-h-9 cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 hover:bg-canvas">
                        <input
                          type="checkbox"
                          checked={selected.has(topic.slug)}
                          onChange={() => toggle(topic.slug)}
                          className="mt-1 h-4 w-4 accent-accent"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-copy">{topic.name}</span>
                          <span className="text-xs text-muted">{topic.questionCount.toLocaleString()} questions</span>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : null}
              </details>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4 shadow-card md:p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-xs font-bold text-white">2</span>
            <h2 className="text-sm font-bold text-copy">Choose review options</h2>
          </div>
          <fieldset className="mt-4 grid gap-2 md:grid-cols-3">
            <legend className="sr-only">Review option</legend>
            {reviewOptions.map((option) => {
              const optionCount = uniqueQuestionCount(blueprint, selected, option.value)
              return (
                <label
                  key={option.value}
                  className="cursor-pointer rounded-md border border-border bg-canvas p-3 has-[:checked]:border-accent has-[:checked]:bg-accent/10"
                >
                  <input
                    className="sr-only"
                    type="radio"
                    name="reviewMode"
                    value={option.value}
                    checked={reviewMode === option.value}
                    onChange={() => setReviewMode(option.value)}
                  />
                  <span className="block text-sm font-bold text-copy">{option.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted">{option.description}</span>
                  <span className="mt-2 block text-xs font-bold uppercase tracking-wide text-accent">
                    {optionCount.toLocaleString()} match
                  </span>
                </label>
              )
            })}
          </fieldset>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4 shadow-card md:p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-xs font-bold text-white">3</span>
            <h2 className="text-sm font-bold text-copy">Choose number of questions</h2>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px]">
            <div className="grid grid-cols-4 gap-2">
              {quickCounts.map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => updateQuestionCount(count)}
                  className={`min-h-11 rounded-md border px-3 text-sm font-bold transition ${
                    questionCount === count
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-surface text-copy hover:border-accent/60"
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-muted">Custom amount</span>
              <input
                name="questionCount"
                type="number"
                min={1}
                max={maxPracticeQuestionCount}
                step={1}
                inputMode="numeric"
                value={questionCount}
                onChange={(event) => updateQuestionCount(Number(event.target.value))}
                className="mt-1 min-h-11 w-full rounded-md border border-border bg-canvas px-3 text-sm font-bold text-copy outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </label>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4 shadow-card md:p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-xs font-bold text-white">4</span>
            <h2 className="text-sm font-bold text-copy">Matching question total</h2>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-md border border-border bg-canvas p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Selected scope</p>
              <p className="mt-1 text-2xl font-bold text-copy">{allInScopeTotal.toLocaleString()}</p>
            </div>
            <div className="rounded-md border border-border bg-canvas p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Review filter match</p>
              <p className="mt-1 text-2xl font-bold text-copy">{matchingTotal.toLocaleString()}</p>
            </div>
            <div className="rounded-md border border-border bg-canvas p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Session length</p>
              <p className="mt-1 text-2xl font-bold text-copy">{sessionQuestionTotal.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {error ? (
          <p className="rounded-lg border border-danger/20 bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
            No answerable published questions matched that selection.
          </p>
        ) : null}
      </section>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
          <h2 className="text-lg font-bold text-copy">Session summary</h2>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Scope</span>
              <StatusBadge tone="accent">{selected.size === 0 ? "All topics" : "Focused"}</StatusBadge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Review option</span>
              <span className="font-bold text-copy">{reviewOptions.find((option) => option.value === reviewMode)?.label}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Matching total</span>
              <span className="font-bold text-copy">{matchingTotal.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Questions in session</span>
              <span className="font-bold text-copy">{sessionQuestionTotal.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Estimated time</span>
              <span className="font-bold text-copy">{Math.max(1, sessionQuestionTotal * 2)} min</span>
            </div>
            <div className="rounded-md border border-border bg-canvas p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Weakest topic hint</p>
              <p className="mt-1 text-sm font-semibold text-copy">{weakestTopic?.name ?? "Start a session to build mastery data"}</p>
              <div className="mt-2">
                <ProgressLine value={weakestTopic ? masteryPercent(weakestTopic.elo) : 18} tone="danger" />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterChip active>Published only</FilterChip>
              <FilterChip active>Single best answer</FilterChip>
            </div>
          </div>
          <button
            type="submit"
            disabled={matchingTotal === 0}
            className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-bold text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:bg-muted"
          >
            <span aria-hidden="true">Play</span>
            Start session
          </button>
        </div>
      </aside>
    </form>
  )
}
