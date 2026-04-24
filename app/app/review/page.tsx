import { AppShell } from "@/components/app-shell"
import { FilterChip, QuestionPreviewCard, StatusBadge } from "@/components/qbank-ui"
import { getQuestionListData, type QuestionListRow } from "@/lib/qbank"

function score(question: QuestionListRow) {
  return question.yourScorePercent ?? (question.attemptCount === 0 ? 100 : 0)
}

function uniqueRows(rows: QuestionListRow[]) {
  const seen = new Set<string>()
  return rows.filter((row) => {
    if (seen.has(row.id)) return false
    seen.add(row.id)
    return true
  })
}

export default async function ReviewPage() {
  const [flagged, scored] = await Promise.all([
    getQuestionListData({ flagged: true, pageSize: 100 }),
    getQuestionListData({ sort: "score", direction: "asc", pageSize: 200 }),
  ])
  const incorrectRows = scored.questions.filter((question) => question.attemptCount > 0 && score(question) < 60)
  const reviewDueRows = uniqueRows([
    ...scored.questions.filter((question) => question.attemptCount > 0 && score(question) < 80),
    ...flagged.questions,
  ]).sort((left, right) => score(left) - score(right))
  const queue = uniqueRows([...reviewDueRows, ...incorrectRows, ...flagged.questions]).slice(0, 36)

  return (
    <AppShell title="Review" subtitle="Work through incorrect, flagged, and due-for-review questions.">
      <section className="space-y-4">
        <div className="flex items-center justify-between md:hidden">
          <h1 className="text-xl font-bold text-copy">Review</h1>
          <button className="text-lg font-bold text-copy" aria-label="Review menu">...</button>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <FilterChip active>Incorrect {incorrectRows.length}</FilterChip>
          <FilterChip>Flagged {flagged.total}</FilterChip>
          <FilterChip>Review Due {reviewDueRows.length}</FilterChip>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-copy">Focused review queue</h2>
              <p className="text-sm text-muted">
                Review due is derived from questions below 80% accuracy plus all flagged questions.
              </p>
            </div>
            <StatusBadge tone="success">Live queue</StatusBadge>
          </div>
        </div>
        <div className="space-y-3">
          {queue.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface p-5 text-sm text-muted shadow-card">
              No review items yet. Complete a practice session or flag questions to populate this queue.
            </div>
          ) : (
            queue.map((question) => (
              <QuestionPreviewCard key={question.id} question={question} compact />
            ))
          )}
        </div>
      </section>
    </AppShell>
  )
}
