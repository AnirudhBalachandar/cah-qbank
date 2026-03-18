"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { TagTree } from "@/components/practice/tag-tree";
import type { TagTreeNode } from "@/lib/server/practice";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Strictness = "strict_internal" | "augmented";

export function GenerationRunForm({
  tags,
  defaultStrictness,
}: {
  tags: TagTreeNode[];
  defaultStrictness: Strictness;
}) {
  const router = useRouter();
  const [count, setCount] = useState(5);
  const [strictness, setStrictness] = useState<Strictness>(defaultStrictness);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCount = useMemo(() => selectedTagIds.size, [selectedTagIds]);

  function toggleTag(id: string) {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function startRun() {
    setError(null);
    setLoading(true);

    const response = await fetch("/api/generation/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        count,
        strictness,
        tagIds: Array.from(selectedTagIds),
      }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Unable to start generation run.");
      setLoading(false);
      return;
    }

    const run = (await response.json()) as { runId: string };
    router.push(`/generate/runs/${run.runId}`);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Generate SBA drafts</CardTitle>
          <CardDescription>
            Generates original SBA drafts from weakness tags with citations. Strict internal mode is recommended.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="generate-count">Question count</Label>
            <Input
              id="generate-count"
              type="number"
              min={1}
              max={20}
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
            />
          </div>

          <fieldset className="space-y-2" aria-label="Generation strictness">
            <legend className="text-sm font-medium">Strictness</legend>
            <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
              <input
                type="radio"
                name="run-strictness"
                checked={strictness === "strict_internal"}
                onChange={() => setStrictness("strict_internal")}
                aria-label="Strict internal only"
              />
              <span>
                <strong>Strict internal only</strong>
                <span className="block text-muted-foreground">Internal corpus only for examinable facts.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
              <input
                type="radio"
                name="run-strictness"
                checked={strictness === "augmented"}
                onChange={() => setStrictness("augmented")}
                aria-label="Augmented mode"
              />
              <span>
                <strong>Augmented mode</strong>
                <span className="block text-muted-foreground">Allows curated external clarifications with citations.</span>
              </span>
            </label>
          </fieldset>

          <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            {selectedCount > 0
              ? `Using ${selectedCount} selected tags.`
              : "No tags selected: system will use top weakness tags automatically."}
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <Button onClick={startRun} disabled={loading}>
            {loading ? "Generating..." : "Start generation run"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Target tags</CardTitle>
          <CardDescription>Choose specific tags or leave blank to use top weaknesses.</CardDescription>
        </CardHeader>
        <CardContent className="max-h-[70vh] overflow-y-auto">
          <TagTree nodes={tags} selectedIds={selectedTagIds} onToggle={toggleTag} />
        </CardContent>
      </Card>
    </div>
  );
}
