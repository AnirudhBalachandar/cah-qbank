import { redirect } from "next/navigation";
import { SUBJECT_CONFIG } from "@cah-qbank/domain";

import { LoginForm } from "@/components/layout/login-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isSingleUserModeEnabled } from "@/lib/auth/single-user-mode";
import { getCurrentUser } from "@/lib/auth/require-user";

export default async function HomePage() {
  const singleUserMode = isSingleUserModeEnabled();
  const user = await getCurrentUser();
  if (user) {
    if (!user.onboardingCompletedAt) redirect("/onboarding");
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto grid min-h-dvh max-w-7xl items-center gap-8 px-4 py-10 md:grid-cols-[1.1fr_0.9fr] md:px-6">
      <section className="space-y-6 animate-fade-in">
        <Badge>{SUBJECT_CONFIG.appName}</Badge>
        <div className="space-y-4">
          <h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
            MCQ-first {SUBJECT_CONFIG.subjectName} practice with mastery tracking and source-grounded generation.
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground md:text-lg">
            Revision mode, timed sessions, weakness-focused practice, analytics, and admin-reviewed AI drafts grounded in your local CAH corpus.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Content setup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Prepare a folder with your CAH source documents, then run <code>pnpm corpus:prepare -- --source-folder /absolute/path/to/folder</code>.</p>
            <p>Import question files with <code>pnpm ingest</code>, then index notes with <code>pnpm chunks:ingest</code> and <code>pnpm embeddings:build</code>.</p>
            <p>Keep your exam blueprint in <code>./content/CAH_qbank/metadata/exam_blueprint.csv</code> and apply it with <code>pnpm blueprint:apply</code>.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Disclaimer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>For education only, not medical advice.</p>
            <p>Always follow local Australian paediatric clinical protocols in practice.</p>
          </CardContent>
        </Card>
      </section>
      <section className="flex justify-center md:justify-end">
        {singleUserMode ? (
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Single-user mode is enabled</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>No sign-in is required in this mode.</p>
              <p>If this page persists, run <code>pnpm db:seed</code> to create your local user profile.</p>
            </CardContent>
          </Card>
        ) : (
          <LoginForm />
        )}
      </section>
    </div>
  );
}
