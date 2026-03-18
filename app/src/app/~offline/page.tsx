import { SUBJECT_CONFIG } from "@cah-qbank/domain";

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6 py-16 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">You&apos;re offline</h1>
      <p className="mt-2 text-sm text-muted-foreground">Reconnect to continue using {SUBJECT_CONFIG.appName}.</p>
    </main>
  );
}
