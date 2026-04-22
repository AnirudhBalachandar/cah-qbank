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
        <article className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-slate-100 px-2.5 py-1">{question.curriculum}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1">{question.createdBy}</span>
            {!question.isAnswerable ? (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-700">
                Browse only
              </span>
            ) : null}
          </div>

          <h2 className="text-2xl font-semibold leading-relaxed text-slate-900">{question.stem}</h2>

          <div className="space-y-3">
            {question.options.map((option) => (
              <div
                key={option.key}
                className={[
                  "rounded-2xl border px-4 py-3 text-sm",
                  option.isCorrect ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-slate-200 bg-slate-50 text-slate-800",
                ].join(" ")}
              >
                <span className="mr-2 font-semibold">{option.key}.</span>
                {option.text}
              </div>
            ))}
          </div>

          {question.explanation ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Explanation
              </h3>
              <p className="text-sm leading-6 text-slate-700">{question.explanation}</p>
            </div>
          ) : null}

          {question.rationale ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Rationale
              </h3>
              <p className="text-sm leading-6 text-slate-700">{question.rationale}</p>
            </div>
          ) : null}

          {question.citations.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Citations
              </h3>
              <ul className="space-y-2 text-sm text-slate-700">
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

        <aside className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <form action={flagAction}>
            <button
              type="submit"
              className="w-full rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              {question.flagged ? "Remove flag" : "Flag question"}
            </button>
          </form>

          <form action={noteAction} className="space-y-3">
            <label htmlFor="noteMarkdown" className="text-sm font-semibold text-slate-700">
              Private note
            </label>
            <textarea
              id="noteMarkdown"
              name="noteMarkdown"
              defaultValue={question.noteMarkdown}
              rows={8}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
            />
            <button
              type="submit"
              className="w-full rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Save note
            </button>
          </form>

          <div className="space-y-2 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Metadata</p>
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
