import { PageFrame } from "@/components/layout/page-frame";
import { AnalyticsCharts } from "@/components/practice/analytics-charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { getAnalyticsOverview } from "@/lib/server/practice";

function masteryShade(score: number) {
  if (score >= 0.8) return "bg-success/20";
  if (score >= 0.6) return "bg-primary/20";
  if (score >= 0.4) return "bg-amber-500/20";
  return "bg-danger/20";
}

export default async function AnalyticsPage() {
  const user = await requireUser();
  const analytics = await getAnalyticsOverview(user.id);

  return (
    <PageFrame currentPath="/analytics" userEmail={user.email} isAdmin={user.role === "ADMIN"}>
      <div className="mb-5 space-y-1">
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="text-sm text-muted-foreground">Track trends, mastery, and most missed concepts.</p>
      </div>

      <AnalyticsCharts daily={analytics.dailyAccuracy} weekly={analytics.weeklyAccuracy} />

      <section className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Breakdown by tag/module</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {analytics.topicBreakdown.map((item) => (
              <div key={item.name} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 rounded-md border p-2">
                <span>{item.name}</span>
                <span className="text-muted-foreground">{item.attempts} attempts</span>
                <span className="text-muted-foreground">{item.accuracy}%</span>
                <span className="text-muted-foreground">{item.lastAttempted ? new Date(item.lastAttempted).toLocaleDateString() : "-"}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Most missed topics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {analytics.mostMissed.map((item) => (
              <div key={item.name} className="flex items-center justify-between rounded-md border p-2">
                <span>{item.name}</span>
                <span className="text-danger">{item.incorrect} missed</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Mastery heatmap</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {analytics.masteryHeatmap.length === 0 ? (
                <p className="text-sm text-muted-foreground">Mastery appears after attempts are logged.</p>
              ) : null}
              {analytics.masteryHeatmap.map((item) => (
                <div key={item.tagId} className={`rounded-md border p-3 ${masteryShade(item.masteryScore)}`}>
                  <p className="text-sm font-medium">{item.tagName}</p>
                  <p className="text-xs text-muted-foreground">{item.kind}</p>
                  <p className="mt-2 text-sm">Mastery: {Math.round(item.masteryScore * 100)}%</p>
                  <p className="text-xs text-muted-foreground">alpha {item.alpha.toFixed(2)} / beta {item.beta.toFixed(2)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </PageFrame>
  );
}
