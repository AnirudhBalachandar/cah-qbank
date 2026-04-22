"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import {
  answerQuestion,
  endSession,
  saveNote,
  startPracticeSession,
  toggleFlag,
} from "@/lib/qbank"

export async function startSessionAction(formData: FormData) {
  const tagId = String(formData.get("tagId") ?? "").trim() || null
  const questionCount = Number(formData.get("questionCount") ?? 20)
  const sessionId = await startPracticeSession({ tagId, questionCount })

  if (!sessionId) {
    redirect("/practice/new?error=no-questions")
  }

  redirect(`/practice/${sessionId}`)
}

export async function answerQuestionAction(input: {
  sessionId: string
  questionId: string
  selectedKey: string
  timeSpentMs?: number | null
  confidence?: number | null
}) {
  const result = await answerQuestion(input)
  revalidatePath(`/practice/${input.sessionId}`)
  revalidatePath("/")
  revalidatePath("/progress")
  revalidatePath(`/question/${input.questionId}`)
  return result
}

export async function toggleFlagAction(questionId: string) {
  const flagged = await toggleFlag(questionId)
  revalidatePath("/")
  revalidatePath("/browse")
  revalidatePath(`/question/${questionId}`)
  return flagged
}

export async function saveNoteAction(input: { questionId: string; noteMarkdown: string }) {
  const saved = await saveNote(input.questionId, input.noteMarkdown)
  revalidatePath("/")
  revalidatePath("/browse")
  revalidatePath(`/question/${input.questionId}`)
  return saved
}

export async function endSessionAction(sessionId: string) {
  await endSession(sessionId)
  revalidatePath("/")
  revalidatePath(`/practice/${sessionId}`)
}
