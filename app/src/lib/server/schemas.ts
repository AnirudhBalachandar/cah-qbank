import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const practiceSetupSchema = z.object({
  mode: z.enum(["revision", "timed", "weakness", "custom"]),
  tagIds: z.array(z.string()).default([]),
  questionTypes: z.array(z.enum(["SBA", "EMQ_STEM"])) .default(["SBA", "EMQ_STEM"]),
  unseenOnly: z.boolean().default(false),
  incorrectOnly: z.boolean().default(false),
  flaggedOnly: z.boolean().default(false),
  difficulties: z.array(z.string()).default([]),
  ausScores: z.array(z.number().int().min(1).max(5)).default([]),
  questionCount: z.number().int().min(1).max(300).default(20),
  durationMinutes: z.number().int().min(1).max(240).nullable().optional(),
});

export const practiceAvailabilitySchema = practiceSetupSchema;

export const answerSchema = z.object({
  questionId: z.string().uuid(),
  selectedKey: z.string().min(1).max(2),
  timeSpentMs: z.number().int().min(0).max(60 * 60 * 1000).optional(),
  confidence: z.number().int().min(1).max(3).optional(),
});

export const progressControlSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("reset_all"),
  }),
  z.object({
    action: z.literal("set_question_status"),
    questionId: z.string().uuid(),
    status: z.enum(["unseen", "correct", "incorrect"]),
    confidence: z.number().int().min(1).max(3).optional(),
  }),
]);

export const noteSchema = z.object({
  noteMarkdown: z.string().max(8000),
});

export const reportIssueSchema = z.object({
  message: z.string().min(5).max(2000),
});

export const flagSchema = z.object({
  flagged: z.boolean().optional(),
});

export const userPreferencesSchema = z.object({
  examDate: z.string().datetime().nullable().optional(),
  dailyTarget: z.number().int().min(1).max(1000).nullable().optional(),
  defaultGenerationStrictness: z.enum(["strict_internal", "augmented"]).optional(),
});

export const generationRequestSchema = z.object({
  count: z.number().int().min(1).max(20).default(5),
  strictness: z.enum(["strict_internal", "augmented"]).default("strict_internal"),
  tagIds: z.array(z.string()).default([]),
});

const generatedOptionSchema = z.object({
  key: z.enum(["A", "B", "C", "D", "E"]),
  text: z.string().min(1),
});

const citationSchema = z.object({
  type: z.enum(["internal", "external"]),
  source: z.string().nullable().optional(),
  page: z.number().int().nullable().optional(),
  url: z.string().url().nullable().optional(),
  title: z.string().nullable().optional(),
});

export const generatedQuestionSchema = z.object({
  stem_markdown: z.string().min(20),
  options: z.array(generatedOptionSchema).length(5),
  correctKey: z.enum(["A", "B", "C", "D", "E"]),
  explanation_markdown: z.string().min(20),
  why_others_wrong: z.record(z.string(), z.string()),
  key_takeaways: z.array(z.string().min(3)).min(3).max(8),
  tags: z.array(z.string()).min(1),
  moduleCode: z.string().nullable().optional(),
  difficulty: z.enum(["Basic", "Intermediate", "Hard"]).nullable().optional(),
  ausScore: z.number().int().min(1).max(5).nullable().optional(),
  citations: z.array(citationSchema).min(1),
});

export const generatedQuestionResponseSchema = z.object({
  questions: z.array(generatedQuestionSchema).min(1),
});

export const generatedPublishSchema = z.object({
  action: z.enum(["publish", "archive"]),
  reviewerNotes: z.string().max(4000).optional(),
});
