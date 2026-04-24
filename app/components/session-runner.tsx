"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

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
  const [summaryVisible, setSummaryVisible] = useState(false)

  const currentQuestion = questions[currentIndex] ?? questions[0]
  if (!currentQuestion) {
    return (
      <div className="rounded-3xl border border-border bg-panel/90 p-6 text-sm text-muted shadow-glow">
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
  const incorrectCount = Object.values(answers).filter((attempt) => !attempt.isCorrect).length
  const unansweredCount = Math.max(questions.length - answeredCount, 0)
  const isComplete = answeredCount >= questions.length || summaryVisible
  const scorePercent = answeredCount === 0 ? 0 : Math.round((correctCount / answeredCount) * 100)
  const topicRows = buildTopicRows(questions, answers)

  const progressLabel = `${answeredCount}/${questions.length} answered`

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
      setSummaryVisible(true)
      router.refresh()
    })
  }

  function reviewIncorrect() {
    const firstIncorrectIndex = questions.findIndex((item) => answers[item.id]?.isCorrect === false)
    if (firstIncorrectIndex >= 0) {
      setSummaryVisible(false)
      setCurrentIndex(firstIncorrectIndex)
    }
  }

  if (isComplete) {
    return (
      <section className="mx-auto max-w-3xl space-y-5 rounded-lg border border-border bg-surface p-5 shadow-card md:p-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-copy">Session Summary</h2>
          <button
            type="button"
            onClick={() => router.push("/progress")}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm font-bold text-copy"
          >
            Done
          </button>
        </div>

        <div className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
          <div className="grid place-items-center rounded-lg border border-border bg-canvas p-6">
            <div
              className="grid h-36 w-36 place-items-center rounded-full"
              style={{ background: `conic-gradient(var(--color-accent) ${scorePercent}%, var(--color-border) 0)` }}
            >
              <div className="grid h-28 w-28 place-items-center rounded-full bg-surface text-center">
                <div>
                  <p className="text-3xl font-bold text-copy">{scorePercent}%</p>
                  <p className="text-xs text-muted">{correctCount} of {answeredCount} correct</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryStat label="Total" value={questions.length} />
            <SummaryStat label="Correct" value={correctCount} tone="success" />
            <SummaryStat label="Incorrect" value={incorrectCount} tone="danger" />
            <SummaryStat label="Unanswered" value={unansweredCount} />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-canvas p-4">
          <h3 className="text-sm font-bold text-copy">Performance by topic</h3>
          <div className="mt-3 space-y-3">
            {topicRows.map((row) => (
              <div key={row.name} className="grid grid-cols-[minmax(0,1fr)_80px] items-center gap-3">
                <div>
                  <p className="truncate text-sm font-semibold text-copy">{row.name}</p>
                  <span className="mt-1 block h-2 overflow-hidden rounded-full bg-border">
                    <span className="block h-full rounded-full bg-success" style={{ width: `${row.percent}%` }} />
                  </span>
                </div>
                <p className="text-right text-xs font-bold text-muted">{row.percent}% ({row.correct}/{row.total})</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={reviewIncorrect}
            disabled={incorrectCount === 0}
            className="min-h-11 rounded-md bg-accent px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Review incorrect ({incorrectCount})
          </button>
          <button
            type="button"
            onClick={() => router.push("/practice/new")}
            className="min-h-11 rounded-md border border-border bg-surface px-4 text-sm font-bold text-copy"
          >
            Start another session
          </button>
        </div>
      </section>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="space-y-6 rounded-3xl border border-border bg-panel/90 p-6 shadow-glow">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted">
              Question {currentIndex + 1} of {questions.length}
            </p>
            <p className="mt-1 text-sm text-muted">{progressLabel}</p>
          </div>
          <button
            type="button"
            onClick={toggleFlag}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium text-copy transition hover:border-accent/30"
          >
            {flags[question.id] ? "Unflag" : "Flag"}
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs text-muted">
            {question.tags.map((tag) => (
              <span key={tag.slug} className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-accent">
                {tag.name}
              </span>
            ))}
          </div>
          <h2 className="text-xl font-semibold leading-relaxed text-copy">
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
                  active ? "border-accent/40 bg-accent/10 text-copy" : "border-border bg-surface text-copy",
                  revealedCorrect ? "border-success/40 bg-success/10 text-success" : "",
                  revealedIncorrect ? "border-danger/40 bg-danger/10 text-danger" : "",
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
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-canvas disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Saving…" : "Submit answer"}
          </button>
          <button
            type="button"
            onClick={() => goToIndex(currentIndex - 1)}
            disabled={currentIndex === 0 || isPending}
            className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-copy disabled:opacity-60"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => goToIndex(currentIndex + 1)}
            disabled={currentIndex >= unlockedIndex || isPending}
            className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-copy disabled:opacity-60"
          >
            Next
          </button>
        </div>

        {currentReveal ? (
          <div className="space-y-4 rounded-3xl border border-border bg-surface/80 p-5">
            <div>
              <p className="text-sm font-semibold text-muted">Result</p>
              <p className={currentReveal.isCorrect ? "text-success" : "text-danger"}>
                {currentReveal.isCorrect ? "Correct" : `Incorrect. ${currentReveal.correctKey ?? "?"} is best.`}
              </p>
            </div>
            {currentReveal.explanation ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-muted">Explanation</p>
                <p className="text-sm leading-6 text-muted">{currentReveal.explanation}</p>
              </div>
            ) : null}
            {currentReveal.rationale ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-muted">Takeaways</p>
                <p className="text-sm leading-6 text-muted">{currentReveal.rationale}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <aside className="space-y-4 rounded-3xl border border-border bg-panel/90 p-5 shadow-glow">
        <div>
          <p className="text-sm font-semibold text-muted">Score</p>
          <p className="text-3xl font-semibold text-copy">
            {correctCount}/{Object.keys(answers).length || 0}
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="note" className="text-sm font-semibold text-muted">
            Private note
          </label>
          <textarea
            id="note"
            value={notes[question.id] ?? ""}
            onChange={(event) =>
              setNotes((current) => ({ ...current, [question.id]: event.target.value }))
            }
            rows={6}
            className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm text-copy"
          />
          <button
            type="button"
            onClick={saveNote}
            disabled={isPending}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-copy"
          >
            Save note
          </button>
          {noteStatus ? <p className="text-xs text-muted">{noteStatus}</p> : null}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-muted">Jump to question</p>
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
                    index === currentIndex ? "border-accent/40 bg-accent/10 text-copy" : "border-border text-copy",
                    answered?.isCorrect ? "border-success/40 text-success" : "",
                    answered && !answered.isCorrect ? "border-danger/40 text-danger" : "",
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
          className="w-full rounded-full bg-success px-4 py-2 text-sm font-semibold text-canvas"
        >
          Finish session
        </button>
      </aside>
    </div>
  )
}

function SummaryStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string
  value: number
  tone?: "neutral" | "success" | "danger"
}) {
  const toneClass = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-copy"
  return (
    <div className="rounded-lg border border-border bg-canvas p-4 text-center">
      <p className={`text-2xl font-bold ${toneClass}`}>{value}</p>
      <p className="text-xs font-semibold text-muted">{label}</p>
    </div>
  )
}

function buildTopicRows(
  questions: SessionQuestion[],
  answers: Record<string, AttemptRecord>,
) {
  const rows = new Map<string, { name: string; total: number; correct: number }>()
  for (const question of questions) {
    const tag = question.tags.find((item) => item.kind === "topic") ?? question.tags[0]
    const name = tag?.name ?? "Mixed questions"
    const row = rows.get(name) ?? { name, total: 0, correct: 0 }
    row.total += 1
    if (answers[question.id]?.isCorrect) {
      row.correct += 1
    }
    rows.set(name, row)
  }

  return Array.from(rows.values())
    .map((row) => ({
      ...row,
      percent: row.total === 0 ? 0 : Math.round((row.correct / row.total) * 100),
    }))
    .sort((left, right) => right.total - left.total)
    .slice(0, 6)
}
