import Link from "next/link";

import { PageFrame } from "@/components/layout/page-frame";
import { GenerationRunForm } from "@/components/generation/generation-run-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { listGenerationRuns } from "@/lib/server/generation/service";
import { getTagTree } from "@/lib/server/practice";

export default async function GeneratePage() {
  const user = await requireUser();
  const [tags, runs] = await Promise.all([getTagTree(), listGenerationRuns(user.id, 15)]);

  return (
    <PageFrame currentPath="/generate" userEmail={user.email} isAdmin={user.role === "ADMIN"}>
      <div className="mb-6 space-y-1">
        <h1 className="text-2xl font-semibold">Generate questions</h1>
        <p className="text-sm text-muted-foreground">
          Draft generation is SBA-only. All outputs stay as draft until admin review and publish.
        </p>
      </div>

      <GenerationRunForm tags={tags} defaultStrictness={user.defaultGenerationStrictness} />

      <section className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent runs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {runs.length === 0 ? <p className="text-muted-foreground">No runs yet.</p> : null}
            {runs.map((run) => {
              const draftCount = run.items.filter((item) => item.status === "draft").length;
              const rejectedCount = run.items.filter((item) => item.status === "rejected").length;

              return (
                <Link
                  key={run.id}
                  href={`/generate/runs/${run.id}`}
                  className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 rounded-md border p-3 hover:bg-muted/30"
                >
                  <span className="truncate">{run.id}</span>
                  <Badge variant="outline">{run.status}</Badge>
                  <span className="text-muted-foreground">drafts {draftCount}</span>
                  <span className="text-muted-foreground">rejected {rejectedCount}</span>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      </section>
    </PageFrame>
  );
}
