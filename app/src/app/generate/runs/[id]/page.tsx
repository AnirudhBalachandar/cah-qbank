import Link from "next/link";
import { notFound } from "next/navigation";

import { PageFrame } from "@/components/layout/page-frame";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { getGenerationRun } from "@/lib/server/generation/service";

function asJsonPreview(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "{}";
  }
}

export default async function GenerationRunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const run = await getGenerationRun(user.id, id);
  if (!run) {
    notFound();
  }

  return (
    <PageFrame currentPath="/generate" userEmail={user.email} isAdmin={user.role === "ADMIN"}>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold">Generation run {run.id}</h1>
        <Badge variant="outline">{run.status}</Badge>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Run summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Strictness: <strong>{run.strictness}</strong></p>
            <p>Created: <strong>{new Date(run.createdAt).toLocaleString()}</strong></p>
            <p>Draft items: <strong>{run.items.filter((item) => item.status === "draft").length}</strong></p>
            <p>Rejected items: <strong>{run.items.filter((item) => item.status === "rejected").length}</strong></p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Logs</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-64 overflow-auto rounded-md border bg-muted/30 p-3 text-xs">{asJsonPreview(run.logs)}</pre>
          </CardContent>
        </Card>
      </section>

      <section className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {run.items.length === 0 ? <p className="text-sm text-muted-foreground">No items generated for this run.</p> : null}
            {run.items.map((item) => (
              <div key={item.id} className="rounded-md border p-3 text-sm">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{item.status}</Badge>
                  <span className="text-muted-foreground">cosine {item.similarityScore?.toFixed(3) ?? "-"}</span>
                  <span className="text-muted-foreground">overlap {item.overlapScore?.toFixed(3) ?? "-"}</span>
                </div>
                {item.question ? (
                  <>
                    <p className="line-clamp-2">{item.question.stem}</p>
                    <div className="mt-2">
                      {user.role === "ADMIN" ? (
                        <Link href="/admin/generated" className="text-primary underline-offset-2 hover:underline">
                          Review in admin panel
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">Pending admin review.</span>
                      )}
                    </div>
                  </>
                ) : (
                  <pre className="max-h-48 overflow-auto rounded-md border bg-muted/30 p-2 text-xs">
                    {asJsonPreview(item.validationErrors)}
                  </pre>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </PageFrame>
  );
}
