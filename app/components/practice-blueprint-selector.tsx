"use client"

import { useMemo, useState } from "react"

import type { PracticeBlueprintNode } from "@/lib/qbank"

function uniqueQuestionCount(nodes: PracticeBlueprintNode[], selected: Set<string>) {
  const questionIds = new Set<string>()
  const visit = (node: PracticeBlueprintNode) => {
    if (selected.size === 0 || selected.has(node.slug)) {
      for (const questionId of node.questionIds) {
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

export function PracticeBlueprintSelector({
  blueprint,
  defaultSelected,
}: {
  blueprint: PracticeBlueprintNode[]
  defaultSelected?: string[]
}) {
  const [selected, setSelected] = useState(() => new Set(defaultSelected ?? []))
  const selectedValues = useMemo(
    () => Array.from(selected).sort((left, right) => left.localeCompare(right)),
    [selected],
  )
  const selectedCount = useMemo(() => uniqueQuestionCount(blueprint, selected), [blueprint, selected])
  const allCount = useMemo(() => uniqueQuestionCount(blueprint, new Set()), [blueprint])
  const scopeLabel = selectedLabel(blueprint, selected)

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

  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-card md:p-5">
      {selectedValues.map((slug) => (
        <input key={slug} type="hidden" name="tagIds" value={slug} />
      ))}
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
                  {category.examPercent}% · {category.examQuestionCount}/60 · {category.questionCount.toLocaleString()} questions
                </span>
              </span>
              <span className="text-xs font-bold text-muted transition group-open:rotate-90">›</span>
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
  )
}
