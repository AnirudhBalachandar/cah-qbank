"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Strictness = "strict_internal" | "augmented";

function toDateInputValue(value: Date | null) {
  if (!value) return "";
  const copy = new Date(value);
  const year = copy.getFullYear();
  const month = `${copy.getMonth() + 1}`.padStart(2, "0");
  const day = `${copy.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function PreferencesForm({
  title,
  description,
  submitLabel,
  initialExamDate,
  initialDailyTarget,
  initialStrictness,
  redirectTo,
}: {
  title: string;
  description: string;
  submitLabel: string;
  initialExamDate: Date | null;
  initialDailyTarget: number | null;
  initialStrictness: Strictness;
  redirectTo: string;
}) {
  const router = useRouter();
  const [examDate, setExamDate] = useState(toDateInputValue(initialExamDate));
  const [dailyTarget, setDailyTarget] = useState(initialDailyTarget?.toString() ?? "");
  const [strictness, setStrictness] = useState<Strictness>(initialStrictness);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payload = useMemo(() => {
    const daily = dailyTarget.trim().length > 0 ? Number(dailyTarget) : null;
    return {
      examDate: examDate ? new Date(`${examDate}T00:00:00.000Z`).toISOString() : null,
      dailyTarget: Number.isFinite(daily) && daily && daily > 0 ? daily : null,
      defaultGenerationStrictness: strictness,
    };
  }, [examDate, dailyTarget, strictness]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);

    const response = await fetch("/api/user/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Unable to save preferences.");
      setSaving(false);
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="exam-date">Exam date (optional)</Label>
            <Input id="exam-date" type="date" value={examDate} onChange={(event) => setExamDate(event.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="daily-target">Daily target (questions, optional)</Label>
            <Input
              id="daily-target"
              type="number"
              min={1}
              max={1000}
              value={dailyTarget}
              onChange={(event) => setDailyTarget(event.target.value)}
            />
          </div>

          <fieldset className="space-y-2" aria-label="Default generation strictness">
            <legend className="text-sm font-medium">Default generation strictness</legend>
            <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
              <input
                type="radio"
                name="strictness"
                value="strict_internal"
                checked={strictness === "strict_internal"}
                onChange={() => setStrictness("strict_internal")}
                aria-label="Strict internal only"
              />
              <span>
                <strong>Strict internal only</strong>
                <span className="block text-muted-foreground">Generated facts must come from your internal documents and citations.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
              <input
                type="radio"
                name="strictness"
                value="augmented"
                checked={strictness === "augmented"}
                onChange={() => setStrictness("augmented")}
                aria-label="Augmented mode"
              />
              <span>
                <strong>Augmented mode</strong>
                <span className="block text-muted-foreground">Allows curated external citations for clarification.</span>
              </span>
            </label>
          </fieldset>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : submitLabel}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
