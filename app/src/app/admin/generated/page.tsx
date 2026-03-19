import { PageFrame } from "@/components/layout/page-frame";
import { AdminGeneratedList } from "@/components/generation/admin-generated-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/require-user";
import { getDraftGeneratedQuestions } from "@/lib/server/generation/service";

export default async function AdminGeneratedPage() {
  const admin = await requireAdmin();
  const drafts = await getDraftGeneratedQuestions();

  return (
    <PageFrame currentPath="/admin/generated" userEmail={admin.email} isAdmin>
      <div className="mb-5 space-y-1">
        <h1 className="text-2xl font-semibold">Generated draft moderation</h1>
        <p className="text-sm text-muted-foreground">
          Review generated SBA drafts, then publish or archive. Publishing is admin-only.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pending drafts</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminGeneratedList initialDrafts={drafts} />
        </CardContent>
      </Card>
    </PageFrame>
  );
}
