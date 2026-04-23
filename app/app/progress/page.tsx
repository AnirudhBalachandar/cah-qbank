import { AppShell } from "@/components/app-shell"
import { getProgressData } from "@/lib/qbank"

export default async function ProgressPage() {
  const progress = await getProgressData()

  return (
    <AppShell
      title="Progress"
      subtitle="Track mastery by curriculum and topic tag using a single Elo score per tag."
    >
      <section className="overflow-hidden rounded-3xl border border-border bg-panel/90 shadow-glow">
        <table className="min-w-full divide-y divide-border text-left text-sm">
          <thead className="bg-surface text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Tag</th>
              <th className="px-4 py-3 font-semibold">Kind</th>
              <th className="px-4 py-3 font-semibold">Elo</th>
              <th className="px-4 py-3 font-semibold">Attempts</th>
              <th className="px-4 py-3 font-semibold">Correct</th>
              <th className="px-4 py-3 font-semibold">Questions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/80">
            {progress.map((row) => (
              <tr key={row.slug}>
                <td className="px-4 py-3 font-medium text-copy">{row.name}</td>
                <td className="px-4 py-3 text-muted">{row.kind}</td>
                <td className="px-4 py-3 text-muted">{row.elo.toFixed(1)}</td>
                <td className="px-4 py-3 text-muted">{row.attemptCount}</td>
                <td className="px-4 py-3 text-muted">{row.correctCount}</td>
                <td className="px-4 py-3 text-muted">{row.questionCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AppShell>
  )
}
