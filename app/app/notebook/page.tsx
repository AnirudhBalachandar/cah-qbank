import Link from "next/link"

import { AppShell } from "@/components/app-shell"
import { FilterChip, StatusBadge } from "@/components/qbank-ui"
import { getQuestionListData } from "@/lib/qbank"

export default async function NotebookPage() {
  const data = await getQuestionListData({ pageSize: 100, sort: "createdAt", direction: "desc" })
  const notes = data.questions.filter((question) => question.noteMarkdown.trim().length > 0)
  const bookmarks = data.questions.filter((question) => question.flagged)

  return (
    <AppShell title="Notebook" subtitle="Saved explanations, private notes, and bookmarked questions.">
      <section className="space-y-4">
        <div className="flex items-center justify-between md:hidden">
          <h1 className="text-xl font-bold text-copy">Notebook</h1>
          <button className="rounded-lg bg-accent px-3 py-2 text-xs font-bold text-white">New note</button>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <FilterChip active>All Notes {notes.length + bookmarks.length}</FilterChip>
          <FilterChip>My Notes {notes.length}</FilterChip>
          <FilterChip>Bookmarks {bookmarks.length}</FilterChip>
        </div>
        <div className="space-y-3">
          {notes.length === 0 && bookmarks.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface p-5 text-sm text-muted shadow-card">
              Add notes from question detail or explanations to build this notebook.
            </div>
          ) : null}
          {notes.slice(0, 20).map((question) => (
            <article key={question.id} className="rounded-lg border border-border bg-surface p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <StatusBadge tone="accent">MY NOTE</StatusBadge>
                  <h2 className="mt-3 text-sm font-bold text-copy">{question.tags[0]?.name ?? question.curriculum}</h2>
                </div>
                <span className="text-xs text-muted">Saved</span>
              </div>
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted">{question.noteMarkdown}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <FilterChip>{question.curriculum}</FilterChip>
                {question.tags.slice(0, 2).map((tag) => <FilterChip key={tag.slug}>{tag.name}</FilterChip>)}
              </div>
              <Link href={`/question/${question.id}`} className="mt-3 inline-flex text-sm font-bold text-accent">
                Open question
              </Link>
            </article>
          ))}
          {bookmarks.slice(0, 20).map((question) => (
            <article key={`bookmark-${question.id}`} className="rounded-lg border border-border bg-surface p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <StatusBadge tone="danger">BOOKMARK</StatusBadge>
                  <h2 className="mt-3 line-clamp-2 text-sm font-bold text-copy">{question.stem}</h2>
                </div>
                <span className="text-xs text-danger">Flagged</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <FilterChip>{question.curriculum}</FilterChip>
                {question.tags.slice(0, 2).map((tag) => <FilterChip key={tag.slug}>{tag.name}</FilterChip>)}
              </div>
              <Link href={`/question/${question.id}`} className="mt-3 inline-flex text-sm font-bold text-accent">
                Open bookmark
              </Link>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  )
}
