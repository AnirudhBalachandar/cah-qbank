import type { ReactNode } from "react";

import { AppNav } from "@/components/layout/app-nav";

export function PageFrame({
  currentPath,
  userEmail,
  isAdmin,
  children,
}: {
  currentPath: string;
  userEmail: string;
  isAdmin: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      <AppNav currentPath={currentPath} userEmail={userEmail} isAdmin={isAdmin} />
      <main className="mx-auto max-w-7xl py-6 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1.5rem,env(safe-area-inset-bottom))] md:py-8 md:pl-[max(1.5rem,env(safe-area-inset-left))] md:pr-[max(1.5rem,env(safe-area-inset-right))]">
        {children}
        <div className="mt-8 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          Education-only revision tool. Not medical advice. Follow local Australian protocols and supervisor guidance in clinical practice.
        </div>
      </main>
    </div>
  );
}
