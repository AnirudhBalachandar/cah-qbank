import { notFound } from "next/navigation"

import { saveNoteAction, toggleFlagAction } from "@/app/actions/practice"
import { AppShell } from "@/components/app-shell"
import { getQuestionDetail } from "@/lib/qbank"

export default async function QuestionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const question = await getQuestionDetail(id)

  if (!question) {
    notFound()
  }

  const flagAction = async () => {
    "use server"

    await toggleFlagAction(question.id)
  }
  const noteAction = async (formData: FormData) => {
    "use server"

    await saveNoteAction({
      questionId: question.id,
      noteMarkdown: String(formData.get("noteMarkdown") ?? ""),
    })
  }

  return (
    <AppShell
      title="Question Detail"
      subtitle="Browse the stored JSON-backed question record, including options, notes, flag state, and source-facing metadata."
    >
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <article className="space-y-6 rounded-3xl border border-border bg-panel/90 p-6 shadow-glow">
          <div className="flex flex-wrap gap-2 text-xs text-muted">
            <span className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-accent">{question.curriculum}</span>
            <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-muted">{question.createdBy}</span>
            {!question.isAnswerable ? (
              <span className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-warning">
                Browse only
              </span>
            ) : null}
          </div>

          <h2 className="text-2xl font-semibold leading-relaxed text-copy">{question.stem}</h2>

          <div className="space-y-3">
            {question.options.map((option) => (
              <div
                key={option.key}
                className={[
                  "rounded-2xl border px-4 py-3 text-sm",
                  option.isCorrect ? "border-success/30 bg-success/10 text-success" : "border-border bg-surface text-copy",
                ].join(" ")}
              >
                <span className="mr-2 font-semibold">{option.key}.</span>
                {option.text}
              </div>
            ))}
          </div>

          {question.explanation ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
                Explanation
              </h3>
              <p className="text-sm leading-6 text-muted">{question.explanation}</p>
            </div>
          ) : null}

          {question.rationale ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
                Rationale
              </h3>
              <p className="text-sm leading-6 text-muted">{question.rationale}</p>
            </div>
          ) : null}

          {question.citations.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
                Citations
              </h3>
              <ul className="space-y-2 text-sm text-muted">
                {question.citations.map((citation, index) => (
                  <li key={`${citation.title ?? citation.source ?? "citation"}-${index}`}>
                    {(citation.title as string | undefined) ?? (citation.source as string | undefined) ?? "Untitled citation"}
                    {citation.page ? `, p.${String(citation.page)}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </article>

        <aside className="space-y-4 rounded-3xl border border-border bg-panel/90 p-5 shadow-glow">
          <form action={flagAction}>
            <button
              type="submit"
              className="w-full rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-copy transition hover:border-accent/30"
            >
              {question.flagged ? "Remove flag" : "Flag question"}
            </button>
          </form>

          <form action={noteAction} className="space-y-3">
            <label htmlFor="noteMarkdown" className="text-sm font-semibold text-copy">
              Private note
            </label>
            <textarea
              id="noteMarkdown"
              name="noteMarkdown"
              defaultValue={question.noteMarkdown}
              rows={8}
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm text-copy"
            />
            <button
              type="submit"
              className="w-full rounded-full bg-accent px-4 py-2 text-sm font-semibold text-canvas"
            >
              Save note
            </button>
          </form>

          <div className="space-y-2 rounded-2xl border border-border bg-surface/80 p-4 text-sm text-muted">
            <p className="font-semibold text-copy">Metadata</p>
            <p>Question ID: {question.id}</p>
            <p>Source fingerprint: {question.sourceFingerprint}</p>
            <p>Attempts: {question.attemptCount}</p>
            <p>Correct: {question.correctCount}</p>
          </div>
        </aside>
      </section>
    </AppShell>
  )
}
