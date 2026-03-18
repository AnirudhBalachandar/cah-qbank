"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type DraftItem = {
  id: string;
  status: "draft" | "published" | "archived" | "rejected";
  similarityScore: number | null;
  overlapScore: number | null;
  reviewerNotes: string | null;
  question: {
    id: string;
    stem: string;
    correctKey: string | null;
    citations: unknown;
    status: "draft" | "published" | "archived";
    createdAt: Date;
  } | null;
  run: {
    id: string;
    strictness: "strict_internal" | "augmented";
    user: { email: string };
  };
};

export function AdminGeneratedList({ initialDrafts }: { initialDrafts: DraftItem[] }) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [notes, setNotes] = useState<Map<string, string>>(new Map());
  const [busyId, setBusyId] = useState<string | null>(null);

  async function moderate(itemId: string, action: "publish" | "archive") {
    setBusyId(itemId);
    const reviewerNotes = notes.get(itemId) ?? "";

    const response = await fetch(`/api/generation/drafts/${itemId}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reviewerNotes }),
    });

    if (response.ok) {
      setDrafts((prev) => prev.filter((item) => item.id !== itemId));
    }

    setBusyId(null);
  }

  return (
    <div className="space-y-3">
      {drafts.length === 0 ? <p className="text-sm text-muted-foreground">No generated drafts pending review.</p> : null}
      {drafts.map((item) => (
        <article key={item.id} className="rounded-md border p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{item.run.strictness}</Badge>
            <span className="text-xs text-muted-foreground">from {item.run.user.email}</span>
            <span className="text-xs text-muted-foreground">cosine {item.similarityScore?.toFixed(3) ?? "-"}</span>
            <span className="text-xs text-muted-foreground">overlap {item.overlapScore?.toFixed(3) ?? "-"}</span>
          </div>

          {item.question ? (
            <>
              <p className="mb-2 whitespace-pre-wrap text-sm leading-6">{item.question.stem}</p>
              <p className="mb-2 text-xs text-muted-foreground">
                Correct key: {item.question.correctKey ?? "missing"}
              </p>
              <p className="mb-2 text-xs text-muted-foreground">
                Citations present: {Array.isArray(item.question.citations) ? item.question.citations.length : 0}
              </p>
            </>
          ) : (
            <p className="mb-2 text-sm text-muted-foreground">No linked question found for this draft item.</p>
          )}

          <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
            <Input
              value={notes.get(item.id) ?? ""}
              onChange={(event) =>
                setNotes((prev) => {
                  const next = new Map(prev);
                  next.set(item.id, event.target.value);
                  return next;
                })
              }
              placeholder="Reviewer notes (optional)"
            />
            <Button
              onClick={() => moderate(item.id, "publish")}
              disabled={busyId === item.id || !item.question?.correctKey}
            >
              Publish
            </Button>
            <Button variant="outline" onClick={() => moderate(item.id, "archive")} disabled={busyId === item.id}>
              Archive
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}
