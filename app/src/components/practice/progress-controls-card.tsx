"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ProgressStatus = "unseen" | "correct" | "incorrect";

function statusLabel(status: ProgressStatus) {
  if (status === "unseen") return "Unseen";
  if (status === "correct") return "Correct";
  return "Incorrect";
}

export function ProgressControlsCard({
  flaggedCount,
  recentlyMissed,
}: {
  flaggedCount: number;
  recentlyMissed: Array<{
    questionId: string;
    stemPreview: string;
    attemptedAtIso: string;
  }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [manualQuestionId, setManualQuestionId] = useState("");
  const [manualStatus, setManualStatus] = useState<ProgressStatus>("unseen");
  const [manualConfidence, setManualConfidence] = useState<1 | 2 | 3>(2);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function callProgressApi(payload: Record<string, unknown>) {
    const response = await fetch("/api/practice/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string; errorCode?: string } | null;
      throw new Error(body?.error ?? body?.errorCode ?? "Progress update failed.");
    }
  }

  function refreshDashboard() {
    startTransition(() => {
      router.refresh();
    });
  }

  async function handleResetAll() {
    setError(null);
    setSuccess(null);

    const confirmed = window.confirm(
      "Reset all saved progress? This clears attempts and mastery history. Notes/flags remain unchanged.",
    );
    if (!confirmed) return;

    try {
      await callProgressApi({ action: "reset_all" });
      setSuccess("All progress reset.");
      refreshDashboard();
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Progress reset failed.");
    }
  }

  async function applyQuestionStatus(questionId: string, status: ProgressStatus, confidence?: 1 | 2 | 3) {
    setError(null);
    setSuccess(null);

    try {
      await callProgressApi({
        action: "set_question_status",
        questionId,
        status,
        ...(status !== "unseen" ? { confidence: confidence ?? 2 } : {}),
      });
      setSuccess(`Question ${questionId.slice(0, 8)} set to ${statusLabel(status).toLowerCase()}.`);
      refreshDashboard();
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Question status update failed.");
    }
  }

  async function handleManualSubmit() {
    if (!manualQuestionId.trim()) {
      setError("Enter a question ID.");
      return;
    }
    await applyQuestionStatus(manualQuestionId.trim(), manualStatus, manualConfidence);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Progress Controls</CardTitle>
        <CardDescription>Reset overall progress or adjust per-question status safely.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border p-3">
          <p className="text-sm">Flags currently saved: <strong>{flaggedCount}</strong></p>
          <p className="mt-1 text-xs text-muted-foreground">This panel only changes attempts/mastery unless you manually change flags elsewhere.</p>
          <Button asChild type="button" variant="secondary" className="mt-3 w-full">
            <Link href="/practice">Open Practice Setup</Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="mt-2 w-full"
            onClick={() => void handleResetAll()}
            disabled={isPending}
          >
            Reset All Progress
          </Button>
        </div>

        <div className="rounded-md border p-3">
          <p className="mb-2 text-sm font-medium">Quick fixes for recently missed</p>
          {recentlyMissed.length === 0 ? (
            <p className="text-xs text-muted-foreground">No recent misses found.</p>
          ) : (
            <div className="space-y-2">
              {recentlyMissed.map((item) => (
                <div key={`${item.questionId}-${item.attemptedAtIso}`} className="rounded border p-2">
                  <p className="line-clamp-2 text-xs">{item.stemPreview}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {item.questionId.slice(0, 8)} · {new Date(item.attemptedAtIso).toLocaleString()}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void applyQuestionStatus(item.questionId, "correct", 2)}
                      disabled={isPending}
                    >
                      Mark Correct
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => void applyQuestionStatus(item.questionId, "unseen")}
                      disabled={isPending}
                    >
                      Set Unseen
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-md border p-3 space-y-2">
          <p className="text-sm font-medium">Manual question status override</p>
          <Label htmlFor="manual-question-id">Question ID</Label>
          <Input
            id="manual-question-id"
            value={manualQuestionId}
            onChange={(event) => setManualQuestionId(event.target.value)}
            placeholder="UUID from question records"
          />

          <Label htmlFor="manual-question-status">Status</Label>
          <select
            id="manual-question-status"
            value={manualStatus}
            onChange={(event) => setManualStatus(event.target.value as ProgressStatus)}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="unseen">Unseen</option>
            <option value="correct">Correct</option>
            <option value="incorrect">Incorrect</option>
          </select>

          {manualStatus !== "unseen" ? (
            <>
              <Label htmlFor="manual-confidence">Confidence</Label>
              <select
                id="manual-confidence"
                value={String(manualConfidence)}
                onChange={(event) => setManualConfidence(Number(event.target.value) as 1 | 2 | 3)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="1">Unsure</option>
                <option value="2">Average</option>
                <option value="3">Confident</option>
              </select>
            </>
          ) : null}

          <Button
            type="button"
            className="w-full"
            onClick={() => void handleManualSubmit()}
            disabled={isPending}
          >
            Apply Status Change
          </Button>
        </div>

        {success ? <p className="text-xs text-emerald-600">{success}</p> : null}
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
