import { redirect } from "next/navigation";
import { SUBJECT_CONFIG } from "@cah-qbank/domain";

import { PreferencesForm } from "@/components/settings/preferences-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";

export default async function OnboardingPage() {
  const user = await requireUser();
  if (user.onboardingCompletedAt) redirect("/dashboard");

  return (
    <div className="mx-auto grid min-h-dvh max-w-6xl items-center gap-6 px-4 py-8 md:grid-cols-[1.05fr_0.95fr] md:px-6">
      <section className="space-y-5">
        <Badge>Onboarding</Badge>
        <div className="space-y-3">
          <h1 className="text-4xl font-semibold tracking-tight">Set your study defaults</h1>
          <p className="text-muted-foreground">
            Configure exam timeline and generation strictness. Strict internal mode is recommended and selected by default.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Study use disclaimer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>This platform is for education and revision only.</p>
            <p>It does not provide medical advice and should not replace official local clinical protocols.</p>
            <p>In practice, always follow local hospital policy and current Australian paediatric guidance.</p>
          </CardContent>
        </Card>
      </section>

      <PreferencesForm
        title={`Welcome to ${SUBJECT_CONFIG.appName}`}
        description="You can change these settings at any time from Settings."
        submitLabel="Save and continue"
        initialExamDate={user.examDate}
        initialDailyTarget={user.dailyTarget}
        initialStrictness={user.defaultGenerationStrictness}
        redirectTo="/dashboard"
      />
    </div>
  );
}
