import { PageFrame } from "@/components/layout/page-frame";
import { PracticeSetupForm } from "@/components/practice/practice-setup-form";
import type { TagNode } from "@/components/practice/tag-tree";
import { requireUser } from "@/lib/auth/require-user";
import { getQuestionBankStatus, getTagTree } from "@/lib/server/practice";

export default async function PracticePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const [tags, questionBankStatus] = await Promise.all([getTagTree(), getQuestionBankStatus()]);
  const params = await searchParams;

  const modeValue = typeof params.mode === "string" ? params.mode : "revision";
  const initialMode = ["revision", "timed", "weakness", "custom"].includes(modeValue) ? (modeValue as "revision" | "timed" | "weakness" | "custom") : "revision";

  return (
    <PageFrame currentPath="/practice" userEmail={user.email} isAdmin={user.role === "ADMIN"}>
      <div className="mb-5 space-y-1">
        <h1 className="text-2xl font-semibold">Practice setup</h1>
        <p className="text-sm text-muted-foreground">Choose your mode, filters, and session size.</p>
      </div>
      <PracticeSetupForm tags={tags as TagNode[]} initialMode={initialMode} questionBankStatus={questionBankStatus} />
    </PageFrame>
  );
}
