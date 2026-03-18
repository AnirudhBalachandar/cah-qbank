"use client";

import { useState } from "react";

import { ExplanationRenderer } from "@/components/practice/explanation-renderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { SessionQuestion } from "@/lib/server/practice";

type AttemptMapValue = {
  isCorrect: boolean;
  selectedKey: string | null;
  timeSpentMs: number | null;
  confidence?: number | null;
};

function confidenceLabel(confidence: number | null | undefined) {
  if (confidence === 1) return "Unsure";
  if (confidence === 2) return "Average";
  if (confidence === 3) return "Confident";
  return null;
}

export function SessionSummaryView({
  questions,
  attemptsByQuestion,
  sessionId,
  accuracy,
  correctCount,
  attemptedCount,
  totalTimeMs,
  tagBreakdown,
  moduleBreakdown,
}: {
  questions: SessionQuestion[];
  attemptsByQuestion: Array<[string, AttemptMapValue]>;
  sessionId: string;
  accuracy: number;
  correctCount: number;
  attemptedCount: number;
  totalTimeMs: number;
  tagBreakdown: Array<{ name: string; attempts: number; accuracy: number }>;
  moduleBreakdown: Array<{ name: string; attempts: number; accuracy: number }>;
}) {
  const attemptsMap = new Map(attemptsByQuestion);
  const [noteDrafts, setNoteDrafts] = useState<Map<string, string>>(new Map(questions.map((question) => [question.id, question.noteMarkdown ?? ""])));
  const [flagMap, setFlagMap] = useState<Map<string, boolean>>(new Map(questions.map((question) => [question.id, question.flagged])));
  const [issueDrafts, setIssueDrafts] = useState<Map<string, string>>(new Map());

  async function saveNote(questionId: string) {
    await fetch(`/api/questions/${questionId}/note`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteMarkdown: noteDrafts.get(questionId) ?? "" }),
    });
  }

  async function toggleFlag(questionId: string) {
    const next = !(flagMap.get(questionId) ?? false);
    await fetch(`/api/questions/${questionId}/flag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flagged: next }),
    });
    setFlagMap((prev) => new Map(prev).set(questionId, next));
  }

  async function sendIssue(questionId: string) {
    const message = issueDrafts.get(questionId)?.trim();
    if (!message) {
      return;
    }

    await fetch(`/api/questions/${questionId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    setIssueDrafts((prev) => {
      const next = new Map(prev);
      next.set(questionId, "");
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Score</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-semibold">{correctCount}/{attemptedCount}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Accuracy</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-semibold">{accuracy}%</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Answered</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-semibold">{attemptedCount}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Total time</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-semibold">{Math.round(totalTimeMs / 1000)}s</p></CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tag breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {tagBreakdown.map((item) => (
              <div key={item.name} className="flex justify-between">
                <span>{item.name}</span>
                <span className="text-muted-foreground">{item.accuracy}% ({item.attempts})</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Module breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {moduleBreakdown.map((item) => (
              <div key={item.name} className="flex justify-between">
                <span>{item.name}</span>
                <span className="text-muted-foreground">{item.accuracy}% ({item.attempts})</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        {questions.map((question, idx) => {
          const attempt = attemptsMap.get(question.id);
          const correctOptionText = question.correctKey
            ? question.options.find((option) => option.key.toUpperCase() === question.correctKey?.toUpperCase())?.text ?? null
            : null;
          return (
            <Card key={question.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">Q{idx + 1}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant={attempt?.isCorrect ? "success" : "danger"}>{attempt?.isCorrect ? "Correct" : "Incorrect"}</Badge>
                    <Badge variant="outline">Session {sessionId.slice(0, 8)}</Badge>
                  </div>
                </div>
                <div className="whitespace-pre-wrap text-sm">{question.stem}</div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm">
                  Your answer: <strong>{attempt?.selectedKey ?? "-"}</strong> | Correct: <strong>{question.correctKey ?? "Unknown"}</strong>
                  {correctOptionText ? ` — ${correctOptionText}` : ""}
                  {typeof attempt?.confidence === "number" ? ` | Confidence: ${confidenceLabel(attempt.confidence) ?? attempt.confidence}` : ""}
                </p>
                <ExplanationRenderer
                  text={
                    question.explanation?.trim()
                      || question.rationale?.trim()
                      || "No explanation available."
                  }
                />
                {question.explanation && question.rationale && question.rationale.trim() && question.rationale.trim() !== question.explanation.trim() ? (
                  <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">Supplementary rationale</p>
                    <p className="mt-1">{question.rationale}</p>
                  </div>
                ) : null}
                <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                  <Textarea
                    value={noteDrafts.get(question.id) ?? ""}
                    onChange={(event) =>
                      setNoteDrafts((prev) => {
                        const next = new Map(prev);
                        next.set(question.id, event.target.value);
                        return next;
                      })
                    }
                    placeholder="Personal note"
                  />
                  <div className="flex flex-col gap-2">
                    <Button variant="outline" onClick={() => saveNote(question.id)}>Save note</Button>
                    <Button variant="outline" onClick={() => toggleFlag(question.id)}>
                      {flagMap.get(question.id) ? "Unflag" : "Flag"}
                    </Button>
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                  <Input
                    value={issueDrafts.get(question.id) ?? ""}
                    onChange={(event) =>
                      setIssueDrafts((prev) => {
                        const next = new Map(prev);
                        next.set(question.id, event.target.value);
                        return next;
                      })
                    }
                    placeholder="Report issue"
                  />
                  <Button variant="outline" onClick={() => sendIssue(question.id)}>Send</Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>
    </div>
  );
}
