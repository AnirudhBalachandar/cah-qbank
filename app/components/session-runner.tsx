"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"

import {
  answerQuestionAction,
  endSessionAction,
  saveNoteAction,
  toggleFlagAction,
} from "@/app/actions/practice"

type SessionQuestion = {
  id: string
  stem: string
  explanation: string | null
  rationale: string | null
  citations: Array<Record<string, unknown>>
  optionExplanations: Record<string, string>
  options: Array<{ key: string; text: string; isCorrect: boolean | null }>
  correctKey: string | null
  flagged: boolean
  noteMarkdown: string
  tags: Array<{ slug: string; name: string; kind: string }>
}

type AttemptRecord = {
  questionId: string
  selectedKey: string | null
  isCorrect: boolean
}

export function SessionRunner({
  sessionId,
  questions,
  attempts,
  initialIndex,
}: {
  sessionId: string
  questions: SessionQuestion[]
  attempts: AttemptRecord[]
  initialIndex: number
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [currentIndex, setCurrentIndex] = useState(() => Math.min(initialIndex, Math.max(questions.length - 1, 0)))
  const [answers, setAnswers] = useState<Record<string, AttemptRecord>>(
    Object.fromEntries(attempts.map((attempt) => [attempt.questionId, attempt])),
  )
  const [revealed, setRevealed] = useState<Record<string, Awaited<ReturnType<typeof answerQuestionAction>>>>({})
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [flags, setFlags] = useState<Record<string, boolean>>(
    Object.fromEntries(questions.map((question) => [question.id, question.flagged])),
  )
  const [notes, setNotes] = useState<Record<string, string>>(
    Object.fromEntries(questions.map((question) => [question.id, question.noteMarkdown])),
  )
  const [noteStatus, setNoteStatus] = useState<string>("")

  const currentQuestion = questions[currentIndex] ?? questions[0]
  if (!currentQuestion) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        This session has no questions.
      </div>
    )
  }

  const question = currentQuestion
  const currentAnswer = answers[question.id]
  const currentReveal = revealed[question.id]
  const isAnswered = Boolean(currentAnswer)
  const selectedKey = selected[question.id] ?? currentAnswer?.selectedKey ?? ""
  const answeredCount = Object.keys(answers).length
  const unlockedIndex = Math.min(Math.max(initialIndex, answeredCount), Math.max(questions.length - 1, 0))
  const correctCount = Object.values(answers).filter((attempt) => attempt.isCorrect).length

  const progressLabel = useMemo(
    () => `${answeredCount}/${questions.length} answered`,
    [answeredCount, questions.length],
  )

  function goToIndex(nextIndex: number) {
    setCurrentIndex(Math.max(0, Math.min(nextIndex, unlockedIndex)))
  }

  function submitCurrentAnswer() {
    if (!selectedKey || isAnswered) return
    startTransition(async () => {
      const result = await answerQuestionAction({
        sessionId,
        questionId: question.id,
        selectedKey,
      })
      setAnswers((current) => ({
        ...current,
        [question.id]: {
          questionId: question.id,
          selectedKey,
          isCorrect: result.isCorrect,
        },
      }))
      setRevealed((current) => ({ ...current, [question.id]: result }))
      goToIndex(result.nextIndex)
    })
  }

  function toggleFlag() {
    startTransition(async () => {
      const flagged = await toggleFlagAction(question.id)
      setFlags((current) => ({ ...current, [question.id]: flagged }))
    })
  }

  function saveNote() {
    startTransition(async () => {
      setNoteStatus("Saving…")
      const saved = await saveNoteAction({
        questionId: question.id,
        noteMarkdown: notes[question.id] ?? "",
      })
      setNotes((current) => ({ ...current, [question.id]: saved }))
      setNoteStatus(saved ? "Saved" : "Cleared")
    })
  }

  function finishSession() {
    startTransition(async () => {
      await endSessionAction(sessionId)
      router.push("/progress")
      router.refresh()
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-500">
              Question {currentIndex + 1} of {questions.length}
            </p>
            <p className="mt-1 text-sm text-slate-600">{progressLabel}</p>
          </div>
          <button
            type="button"
            onClick={toggleFlag}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700"
          >
            {flags[question.id] ? "Unflag" : "Flag"}
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
            {question.tags.map((tag) => (
              <span key={tag.slug} className="rounded-full bg-slate-100 px-2.5 py-1">
                {tag.name}
              </span>
            ))}
          </div>
          <h2 className="text-xl font-semibold leading-relaxed text-slate-900">
            {question.stem}
          </h2>
        </div>

        <div className="space-y-3">
          {question.options.map((option) => {
            const active = selectedKey === option.key
            const revealedCorrect = currentReveal?.correctKey === option.key
            const revealedIncorrect = isAnswered && currentAnswer?.selectedKey === option.key && !currentAnswer.isCorrect
            return (
              <label
                key={option.key}
                className={[
                  "flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition",
                  active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-900",
                  revealedCorrect ? "border-emerald-500 bg-emerald-50 text-emerald-950" : "",
                  revealedIncorrect ? "border-rose-400 bg-rose-50 text-rose-950" : "",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name={`question-${question.id}`}
                  value={option.key}
                  checked={active}
                  onChange={() =>
                    setSelected((current) => ({ ...current, [question.id]: option.key }))
                  }
                  disabled={isAnswered || isPending}
                  className="mt-1"
                />
                <span>
                  <span className="mr-2 font-semibold">{option.key}.</span>
                  {option.text}
                </span>
              </label>
            )
          })}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={submitCurrentAnswer}
            disabled={!selectedKey || isAnswered || isPending}
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Saving…" : "Submit answer"}
          </button>
          <button
            type="button"
            onClick={() => goToIndex(currentIndex - 1)}
            disabled={currentIndex === 0 || isPending}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => goToIndex(currentIndex + 1)}
            disabled={currentIndex >= unlockedIndex || isPending}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
          >
            Next
          </button>
        </div>

        {currentReveal ? (
          <div className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <div>
              <p className="text-sm font-semibold text-slate-500">Result</p>
              <p className={currentReveal.isCorrect ? "text-emerald-700" : "text-rose-700"}>
                {currentReveal.isCorrect ? "Correct" : `Incorrect. ${currentReveal.correctKey ?? "?"} is best.`}
              </p>
            </div>
            {currentReveal.explanation ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-500">Explanation</p>
                <p className="text-sm leading-6 text-slate-700">{currentReveal.explanation}</p>
              </div>
            ) : null}
            {currentReveal.rationale ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-500">Takeaways</p>
                <p className="text-sm leading-6 text-slate-700">{currentReveal.rationale}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <aside className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <p className="text-sm font-semibold text-slate-500">Score</p>
          <p className="text-3xl font-semibold text-slate-900">
            {correctCount}/{Object.keys(answers).length || 0}
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="note" className="text-sm font-semibold text-slate-500">
            Private note
          </label>
          <textarea
            id="note"
            value={notes[question.id] ?? ""}
            onChange={(event) =>
              setNotes((current) => ({ ...current, [question.id]: event.target.value }))
            }
            rows={6}
            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
          />
          <button
            type="button"
            onClick={saveNote}
            disabled={isPending}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700"
          >
            Save note
          </button>
          {noteStatus ? <p className="text-xs text-slate-500">{noteStatus}</p> : null}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-500">Jump to question</p>
          <div className="flex flex-wrap gap-2">
            {questions.map((question, index) => {
              const answered = answers[question.id]
              return (
                <button
                  key={question.id}
                  type="button"
                  onClick={() => goToIndex(index)}
                  disabled={index > unlockedIndex || isPending}
                  className={[
                    "h-9 w-9 rounded-full border text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50",
                    index === currentIndex ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-700",
                    answered?.isCorrect ? "border-emerald-500 text-emerald-700" : "",
                    answered && !answered.isCorrect ? "border-rose-400 text-rose-700" : "",
                  ].join(" ")}
                >
                  {index + 1}
                </button>
              )
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={finishSession}
          disabled={isPending}
          className="w-full rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
        >
          Finish session
        </button>
      </aside>
    </div>
  )
}
