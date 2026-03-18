"use client";

import { AlertTriangle, Bookmark, CheckCircle2, Clock3, Flag, XCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { ExplanationRenderer } from "@/components/practice/explanation-renderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SessionQuestion } from "@/lib/server/practice";
import { cn } from "@/lib/utils";

type AttemptRecord = {
  questionId: string;
  selectedKey: string | null;
  isCorrect: boolean;
};

type Feedback = {
  isCorrect: boolean;
  correctKey: string | null;
  correctText?: string | null;
  explanation: string | null;
  rationale: string | null;
  optionExplanations?: Record<string, string>;
  optionExplanationsSource?: "cached" | "generated" | "fallback";
  citations: Array<Record<string, unknown>>;
};

const CONFIDENCE_OPTIONS: Array<{ value: 1 | 2 | 3; label: string }> = [
  { value: 1, label: "Unsure" },
  { value: 2, label: "Average" },
  { value: 3, label: "Confident" },
];

export function SessionRunner({
  sessionId,
  mode,
  durationMinutes,
  initialQuestions,
  initialAttempts,
}: {
  sessionId: string;
  mode: "revision" | "timed" | "weakness" | "custom";
  durationMinutes: number | null;
  initialQuestions: SessionQuestion[];
  initialAttempts: AttemptRecord[];
}) {
  const [questions] = useState(initialQuestions);
  const [index, setIndex] = useState(0);
  const [selectedMap, setSelectedMap] = useState<Map<string, string>>(
    new Map(initialAttempts.filter((item) => item.selectedKey).map((item) => [item.questionId, item.selectedKey as string])),
  );
  const [feedbackMap, setFeedbackMap] = useState<Map<string, Feedback>>(
    new Map(
      initialAttempts.map((item) => [
        item.questionId,
        {
          isCorrect: item.isCorrect,
          correctKey: null,
          correctText: null,
          explanation: null,
          rationale: null,
          optionExplanations: {},
          optionExplanationsSource: "fallback",
          citations: [],
        },
      ]),
    ),
  );
  const [noteDraft, setNoteDraft] = useState(initialQuestions[0]?.noteMarkdown ?? "");
  const [issueText, setIssueText] = useState("");
  const [issueSent, setIssueSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confidence, setConfidence] = useState<1 | 2 | 3>(2);
  const [timerStartedAt] = useState(Date.now());
  const [flaggedMap, setFlaggedMap] = useState<Map<string, boolean>>(new Map(initialQuestions.map((q) => [q.id, q.flagged])));

  const currentQuestion = questions[index];
  const selectedKey = selectedMap.get(currentQuestion.id) ?? "";
  const feedback = feedbackMap.get(currentQuestion.id) ?? null;

  const answeredCount = feedbackMap.size;
  const correctCount = Array.from(feedbackMap.values()).filter((item) => item.isCorrect).length;

  const remainingMs = durationMinutes ? Math.max(0, durationMinutes * 60 * 1000 - (Date.now() - timerStartedAt)) : null;

  const moveQuestion = useCallback((delta: number) => {
    setIssueSent(false);
    setIssueText("");
    const next = Math.max(0, Math.min(questions.length - 1, index + delta));
    setIndex(next);
    setNoteDraft(questions[next]?.noteMarkdown ?? "");
  }, [index, questions]);

  const chooseOption = useCallback((key: string) => {
    setSelectedMap((prev) => new Map(prev).set(currentQuestion.id, key));
  }, [currentQuestion.id]);

  const submitAnswer = useCallback(async () => {
    if (!selectedKey || feedback || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    const response = await fetch(`/api/session/${sessionId}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionId: currentQuestion.id,
        selectedKey,
        timeSpentMs: Math.max(0, Date.now() - timerStartedAt),
        confidence,
      }),
    });

    if (response.ok) {
      const body = (await response.json()) as Feedback;
      setFeedbackMap((prev) => new Map(prev).set(currentQuestion.id, body));
    }

    setIsSubmitting(false);
  }, [selectedKey, feedback, isSubmitting, sessionId, currentQuestion.id, timerStartedAt, confidence]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!currentQuestion) return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) {
        return;
      }

      const key = event.key.toUpperCase();
      if (/^[A-Z]$/.test(key)) {
        const hasOption = currentQuestion.options.some((option) => option.key.toUpperCase() === key);
        if (hasOption) {
          event.preventDefault();
          chooseOption(key);
        }
      }

      if (event.key === "Enter" && !feedback) {
        event.preventDefault();
        void submitAnswer();
      }

      if (key === "N" && feedback) {
        event.preventDefault();
        moveQuestion(1);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentQuestion, feedback, chooseOption, moveQuestion, submitAnswer]);

  async function saveNote() {
    await fetch(`/api/questions/${currentQuestion.id}/note`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteMarkdown: noteDraft }),
    });
  }

  async function toggleFlag() {
    const flagged = !(flaggedMap.get(currentQuestion.id) ?? false);
    const response = await fetch(`/api/questions/${currentQuestion.id}/flag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flagged }),
    });

    if (response.ok) {
      setFlaggedMap((prev) => new Map(prev).set(currentQuestion.id, flagged));
    }
  }

  async function reportIssue() {
    if (!issueText.trim()) {
      return;
    }

    const response = await fetch(`/api/questions/${currentQuestion.id}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: issueText.trim() }),
    });

    if (response.ok) {
      setIssueSent(true);
      setIssueText("");
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_0.35fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{mode}</Badge>
                <Badge variant="outline">
                  {index + 1} / {questions.length}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock3 className="h-4 w-4" />
                {remainingMs === null ? "Untimed" : `${Math.ceil(remainingMs / 60000)} min left`}
              </div>
            </div>
            {currentQuestion.emqSet ? (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <p className="font-medium">{currentQuestion.emqSet.title ?? "EMQ set"}</p>
                {currentQuestion.emqSet.instructions ? <p className="mt-1 text-muted-foreground">{currentQuestion.emqSet.instructions}</p> : null}
                <div className="mt-2 grid gap-1 md:grid-cols-2">
                  {currentQuestion.emqSet.optionList.map((option) => (
                    <p key={option.key} className="text-xs">
                      <strong>{option.key}.</strong> {option.text}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="prose-content whitespace-pre-wrap text-[15px] leading-7">{currentQuestion.stem}</div>
          </CardHeader>
          <CardContent className="space-y-2">
            {currentQuestion.options.map((option) => {
              const isSelected = selectedKey === option.key;
              const isCorrect = feedback?.correctKey?.toUpperCase() === option.key.toUpperCase();
              const isWrongSelected = feedback && isSelected && !isCorrect;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => chooseOption(option.key)}
                  className={cn(
                    "w-full rounded-md border p-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                    isSelected ? "border-primary bg-primary/10" : "hover:bg-muted/50",
                    feedback && isCorrect && "border-success bg-success/10",
                    isWrongSelected && "border-danger bg-danger/10",
                  )}
                  aria-label={`Select option ${option.key}`}
                >
                  <span className="font-semibold">{option.key}. </span>
                  {option.text}
                </button>
              );
            })}

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <div className="mr-2 flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
                <span className="text-muted-foreground">Confidence:</span>
                {CONFIDENCE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(
                      "rounded px-2 py-0.5",
                      confidence === option.value ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                    )}
                    onClick={() => setConfidence(option.value)}
                    aria-label={`Set confidence ${option.label.toLowerCase()}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <Button onClick={submitAnswer} disabled={!selectedKey || Boolean(feedback) || isSubmitting}>
                Submit (Enter)
              </Button>
              <Button variant="outline" onClick={() => moveQuestion(-1)} disabled={index === 0}>
                Previous
              </Button>
              <Button variant="outline" onClick={() => moveQuestion(1)} disabled={index >= questions.length - 1}>
                Next (N)
              </Button>
              <Button variant="ghost" onClick={toggleFlag} aria-label="Toggle flag">
                <Flag className={cn("h-4 w-4", flaggedMap.get(currentQuestion.id) ? "fill-current" : "")} />
                {flaggedMap.get(currentQuestion.id) ? "Flagged" : "Flag"}
              </Button>
              <Button asChild variant="secondary" className="ml-auto">
                <Link href={`/session/${sessionId}/summary`}>Finish & Review</Link>
              </Button>
            </div>

            {feedback ? (
              <div className={cn("space-y-3 rounded-md border p-3 text-sm", feedback.isCorrect ? "border-success/30 bg-success/10" : "border-danger/30 bg-danger/10")}>
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  {feedback.isCorrect ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-danger" />}
                  <span>{feedback.isCorrect ? "Correct" : "Incorrect"}</span>
                  {feedback.correctKey ? (
                    <Badge variant="outline">
                      Correct answer: {feedback.correctKey}
                      {feedback.correctText ? ` — ${feedback.correctText}` : ""}
                    </Badge>
                  ) : null}
                </div>
                <ExplanationRenderer
                  text={
                    feedback.explanation?.trim()
                      || feedback.rationale?.trim()
                      || "No explanation available."
                  }
                />
                {feedback.explanation && feedback.rationale && feedback.rationale.trim() && feedback.rationale.trim() !== feedback.explanation.trim() ? (
                  <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">Supplementary rationale</p>
                    <p className="mt-1">{feedback.rationale}</p>
                  </div>
                ) : null}
                {feedback.citations.length > 0 ? (
                  <div className="mt-3 rounded-md border bg-muted/30 p-2">
                    <p className="text-xs font-medium">References</p>
                    <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                      {feedback.citations.map((citation, idx) => (
                        <li key={`${currentQuestion.id}-citation-${idx}`}>
                          {typeof citation.source === "string" ? citation.source : null}
                          {typeof citation.page === "number" ? ` (p.${citation.page})` : null}
                          {typeof citation.url === "string" ? ` ${citation.url}` : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Answered: {answeredCount} / {questions.length}</p>
            <p>Correct: {correctCount}</p>
            <p>Accuracy: {answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bookmark className="h-4 w-4" />
              Personal note
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Add your note here" />
            <Button variant="outline" onClick={saveNote} className="w-full">
              Save note
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4" />
              Report issue
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="issue">Describe the issue</Label>
            <Input id="issue" value={issueText} onChange={(event) => setIssueText(event.target.value)} placeholder="e.g., answer key mismatch" />
            <Button variant="outline" onClick={reportIssue} className="w-full">
              Send report
            </Button>
            {issueSent ? <p className="text-xs text-success">Issue submitted.</p> : null}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
