import { AppShell } from "@/components/app-shell"
import { ProfileSettings } from "@/components/profile-settings"
import { getDashboardData } from "@/lib/qbank"

export default async function ProfilePage() {
  const dashboard = await getDashboardData()

  return (
    <AppShell title="Profile" subtitle="Local learner settings and library status.">
      <section className="mx-auto w-full max-w-2xl space-y-4">
        <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
          <div className="flex items-center gap-4">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-purple/10 text-2xl font-bold text-purple">
              AB
            </div>
            <div>
              <h1 className="text-lg font-bold text-copy">Alex Brown</h1>
              <p className="text-sm text-muted">alex.brown@cahqbank.com</p>
              <p className="mt-1 text-sm font-bold text-accent">Edit profile</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-muted">Your plan</p>
              <h2 className="mt-1 text-base font-bold text-copy">CAH QBank Local</h2>
              <p className="text-sm text-muted">
                Local study licence · {dashboard.answerableCount.toLocaleString()} practice-ready questions available offline.
              </p>
            </div>
            <span className="rounded-md bg-success/10 px-3 py-2 text-sm font-bold text-success">Active</span>
          </div>
        </div>

        <ProfileSettings />
      </section>
    </AppShell>
  )
}
