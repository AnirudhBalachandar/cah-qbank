import { PageFrame } from "@/components/layout/page-frame";
import { MobilePairingCard } from "@/components/settings/mobile-pairing-card";
import { PreferencesForm } from "@/components/settings/preferences-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <PageFrame currentPath="/settings" userEmail={user.email} isAdmin={user.role === "ADMIN"}>
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <PreferencesForm
          title="Study preferences"
          description="Personal settings used for dashboard targets and generation defaults."
          submitLabel="Save settings"
          initialExamDate={user.examDate}
          initialDailyTarget={user.dailyTarget}
          initialStrictness={user.defaultGenerationStrictness}
          redirectTo="/settings"
        />

        <div className="space-y-6">
          <MobilePairingCard />

          <Card>
            <CardHeader>
              <CardTitle>Disclaimers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>This app is for learning and revision only.</p>
              <p>It is not medical advice and not a substitute for clinical supervision.</p>
              <p>Always follow your local NSW/Australian protocol in clinical practice.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageFrame>
  );
}
