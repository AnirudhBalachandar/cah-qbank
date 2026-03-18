"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import type { TagNode } from "@/components/practice/tag-tree";
import { TagTree } from "@/components/practice/tag-tree";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const modeOptions = [
  { value: "revision", label: "Revision" },
  { value: "timed", label: "Timed" },
  { value: "weakness", label: "Weakness" },
  { value: "custom", label: "Custom" },
] as const;

type Mode = (typeof modeOptions)[number]["value"];

type PracticeAvailability = {
  totalPublishedQuestions: number;
  activeFilteredCount: number;
  baseFilteredCount: number;
  unseenInBaseFiltered: number;
  incorrectInBaseFiltered: number;
  flaggedInBaseFiltered: number;
  canStartSession: boolean;
};

export function PracticeSetupForm({
  tags,
  initialMode,
  questionBankStatus,
}: {
  tags: TagNode[];
  initialMode: Mode;
  questionBankStatus?: {
    totalPublishedQuestions: number;
    importedPublishedQuestions: number;
    ingestReportPath: string;
  };
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [questionTypes, setQuestionTypes] = useState<Set<"SBA" | "EMQ_STEM">>(new Set(["SBA", "EMQ_STEM"]));
  const [unseenOnly, setUnseenOnly] = useState(false);
  const [incorrectOnly, setIncorrectOnly] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [difficulties, setDifficulties] = useState<Set<string>>(new Set());
  const [ausScores, setAusScores] = useState<Set<number>>(new Set());
  const [questionCount, setQuestionCount] = useState(20);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [isLoading, setIsLoading] = useState(false);
  const [isAvailabilityLoading, setIsAvailabilityLoading] = useState(false);
  const [availability, setAvailability] = useState<PracticeAvailability | null>(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const flatTags = useMemo(() => {
    const items: TagNode[] = [];
    const walk = (nodes: TagNode[]) => {
      for (const node of nodes) {
        items.push(node);
        walk(node.children ?? []);
      }
    };
    walk(tags);
    return items;
  }, [tags]);

  const selectedTagIdList = useMemo(() => Array.from(selectedTagIds).sort(), [selectedTagIds]);
  const questionTypeList = useMemo(() => Array.from(questionTypes).sort(), [questionTypes]);
  const difficultyList = useMemo(() => Array.from(difficulties).sort(), [difficulties]);
  const ausScoreList = useMemo(() => Array.from(ausScores).sort((a, b) => a - b), [ausScores]);

  const sessionPayload = useMemo(
    () => ({
      mode,
      tagIds: selectedTagIdList,
      questionTypes: questionTypeList,
      unseenOnly,
      incorrectOnly,
      flaggedOnly,
      difficulties: difficultyList,
      ausScores: ausScoreList,
      questionCount,
      durationMinutes: mode === "timed" ? durationMinutes : null,
    }),
    [
      mode,
      selectedTagIdList,
      questionTypeList,
      unseenOnly,
      incorrectOnly,
      flaggedOnly,
      difficultyList,
      ausScoreList,
      questionCount,
      durationMinutes,
    ],
  );

  const availabilityPayload = useMemo(
    () => ({
      mode,
      tagIds: selectedTagIdList,
      questionTypes: questionTypeList,
      unseenOnly,
      incorrectOnly,
      flaggedOnly,
      difficulties: difficultyList,
      ausScores: ausScoreList,
    }),
    [mode, selectedTagIdList, questionTypeList, unseenOnly, incorrectOnly, flaggedOnly, difficultyList, ausScoreList],
  );

  function toggleTag(id: string) {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleType(type: "SBA" | "EMQ_STEM") {
    setQuestionTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      if (next.size === 0) {
        next.add("SBA");
      }
      return next;
    });
  }

  function toggleDifficulty(value: string) {
    setDifficulties((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function toggleAusScore(value: number) {
    setAusScores((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setIsAvailabilityLoading(true);
      setAvailabilityError(null);
      try {
        const response = await fetch("/api/practice/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(availabilityPayload),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "Could not calculate question availability.");
        }
        const data = (await response.json()) as PracticeAvailability;
        if (!cancelled) {
          setAvailability(data);
        }
      } catch (availabilityFetchError) {
        if (!cancelled) {
          setAvailability(null);
          setAvailabilityError(
            availabilityFetchError instanceof Error ? availabilityFetchError.message : "Could not calculate question availability.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsAvailabilityLoading(false);
        }
      }
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [availabilityPayload]);

  async function startSession() {
    setError(null);
    setIsLoading(true);

    const response = await fetch("/api/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sessionPayload),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Could not start session.");
      setIsLoading(false);
      return;
    }

    const data = (await response.json()) as { id: string };
    router.push(`/session/${data.id}`);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_0.95fr]">
      <Card>
        <CardHeader>
          <CardTitle>Session mode</CardTitle>
          <CardDescription>Use revision, timed tests, weakness runs, or fully custom sessions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
            <TabsList className="grid w-full grid-cols-4">
              {modeOptions.map((option) => (
                <TabsTrigger key={option.value} value={option.value}>
                  {option.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="question-count">Number of questions</Label>
              <Input
                id="question-count"
                type="number"
                min={1}
                max={300}
                value={questionCount}
                onChange={(event) => setQuestionCount(Number(event.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration">Duration (minutes, timed mode)</Label>
              <Input
                id="duration"
                type="number"
                min={1}
                max={240}
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(Number(event.target.value))}
                disabled={mode !== "timed"}
              />
            </div>
          </div>

          {availability && questionCount > availability.activeFilteredCount ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Requested {questionCount} questions, but only {availability.activeFilteredCount} currently match your filters.
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={questionTypes.has("SBA")} onCheckedChange={() => toggleType("SBA")} />
              SBA
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={questionTypes.has("EMQ_STEM")} onCheckedChange={() => toggleType("EMQ_STEM")} />
              EMQ stems
            </label>
            <p className="text-xs text-muted-foreground">MCQ-only enforced.</p>
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={unseenOnly} onCheckedChange={(value) => setUnseenOnly(Boolean(value))} />
              Unseen only
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={incorrectOnly} onCheckedChange={(value) => setIncorrectOnly(Boolean(value))} />
              Incorrect only
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={flaggedOnly} onCheckedChange={(value) => setFlaggedOnly(Boolean(value))} />
              Flagged only
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Difficulty</p>
              {["Basic", "Intermediate", "Hard"].map((value) => (
                <label key={value} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={difficulties.has(value)} onCheckedChange={() => toggleDifficulty(value)} />
                  {value}
                </label>
              ))}
            </div>
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">AUS score</p>
              {[1, 2, 3, 4, 5].map((value) => (
                <label key={value} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={ausScores.has(value)} onCheckedChange={() => toggleAusScore(value)} />
                  {value}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            <p>{flatTags.length} tags loaded. Select none to sample from all available questions.</p>
            {questionBankStatus ? (
              <p>
                Question bank status: {questionBankStatus.importedPublishedQuestions} imported / {questionBankStatus.totalPublishedQuestions} total published.
                Report: <code>{questionBankStatus.ingestReportPath}</code>
              </p>
            ) : null}
            {isAvailabilityLoading ? <p>Updating availability...</p> : null}
            {availability ? (
              <>
                <p>
                  Available now: <strong>{availability.activeFilteredCount}</strong> / Total: <strong>{availability.totalPublishedQuestions}</strong>
                </p>
                <p>
                  In current filter scope: New {availability.unseenInBaseFiltered}, Previously incorrect {availability.incorrectInBaseFiltered}, Flagged{" "}
                  {availability.flaggedInBaseFiltered}
                </p>
              </>
            ) : null}
            {availabilityError ? <p className="text-danger">{availabilityError}</p> : null}
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <Button onClick={startSession} disabled={isLoading || (availability !== null && !availability.canStartSession)} className="w-full">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Start session
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Category / tag filters</CardTitle>
          <CardDescription>Select modules/topics/meta tags to focus your session.</CardDescription>
        </CardHeader>
        <CardContent className="max-h-[72vh] overflow-y-auto">
          <TagTree nodes={tags} selectedIds={selectedTagIds} onToggle={toggleTag} prioritizeExamTags />
        </CardContent>
      </Card>
    </div>
  );
}
