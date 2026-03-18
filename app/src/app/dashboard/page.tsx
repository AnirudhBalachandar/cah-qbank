import Link from "next/link";

import { PageFrame } from "@/components/layout/page-frame";
import { ProgressControlsCard } from "@/components/practice/progress-controls-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { getDashboardSummary } from "@/lib/server/practice";

export default async function DashboardPage() {
  const user = await requireUser();
  const data = await getDashboardSummary(user.id);
  const recentlyMissedForControls = data.recentlyMissed.map((item) => ({
    questionId: item.questionId,
    stemPreview: item.stemPreview,
    attemptedAtIso: item.attemptedAt.toISOString(),
  }));

  return (
    <PageFrame currentPath="/dashboard" userEmail={user.email} isAdmin={user.role === "ADMIN"}>
      <section className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Attempted / Published</CardDescription>
            <CardTitle className="text-3xl">
              {data.totalAttempted} / {data.totalPublishedQuestions}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total correct</CardDescription>
            <CardTitle className="text-3xl">{data.totalCorrect}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Accuracy</CardDescription>
            <CardTitle className="text-3xl">{data.accuracy}%</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Streak</CardDescription>
            <CardTitle className="text-3xl">{data.streak}d</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <CardHeader>
            <CardTitle>Mastery by module</CardTitle>
            <CardDescription>Beta-binomial mastery score with recent attempt support metrics.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.masteryByModule.length === 0 ? <p className="text-sm text-muted-foreground">No module data yet.</p> : null}
            {data.masteryByModule.map((module) => {
              const pct = Math.round(module.masteryScore * 100);
              return (
                <div key={module.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>{module.name}</span>
                    <span className="text-muted-foreground">
                      mastery {pct}% | accuracy {module.accuracy}% ({module.attempts})
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Weaknesses</CardTitle>
            <CardDescription>Low mastery + recent misses + confidence adjustment.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.weaknesses.length === 0 ? <p className="text-sm text-muted-foreground">Attempt more questions to unlock weakness sessions.</p> : null}
            {data.weaknesses.map((item) => (
              <div key={item.tagId} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <span>{item.tagName}</span>
                <Badge variant="secondary">{item.weaknessScore.toFixed(2)}</Badge>
              </div>
            ))}
            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              Suggested mix: {Math.round(data.recommendedMix.weakTagsPortion * 100)}% weak tags / {Math.round(data.recommendedMix.retentionPortion * 100)}% reinforcement.
            </div>
            <div className="grid gap-2 pt-1">
              <Button asChild className="w-full">
                <Link href="/practice?mode=weakness">Start Weakness Session</Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href="/generate">Generate from Weaknesses</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recently missed questions</CardTitle>
            <CardDescription>Quickly revisit recent incorrect attempts.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.recentlyMissed.length === 0 ? <p className="text-muted-foreground">No recent misses.</p> : null}
            {data.recentlyMissed.map((missed) => (
              <div key={`${missed.questionId}-${missed.attemptedAt.toISOString()}`} className="rounded-md border p-2">
                <p className="line-clamp-2">{missed.stemPreview}</p>
                <p className="text-xs text-muted-foreground">{new Date(missed.attemptedAt).toLocaleString()}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <ProgressControlsCard
          flaggedCount={data.flaggedCount}
          recentlyMissed={recentlyMissedForControls}
        />
      </section>
    </PageFrame>
  );
}
