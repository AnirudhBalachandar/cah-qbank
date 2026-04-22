import { z } from "zod"

export const curriculumSchema = z.enum([
  "General Paediatrics",
  "Paediatric Sub-specialties",
  "Paediatric Surgery",
  "Emergency Paediatrics",
  "Adolescent Medicine",
  "Community-based Paediatrics",
  "Unclassified",
])

export const questionStatusSchema = z.enum(["draft", "published"])
export const questionCreatedBySchema = z.enum(["ai", "import", "manual"])
export const questionTypeSchema = z.enum(["SBA"])
export const difficultySchema = z.enum(["Basic", "Intermediate", "Hard"])

export const optionSchema = z.object({
  key: z.string().min(1),
  text: z.string(),
  isCorrect: z.boolean().nullable().default(null),
})

export const citationSchema = z.object({
  type: z.enum(["internal", "external"]),
  source: z.string().optional(),
  page: z.number().int().nonnegative().optional(),
  url: z.string().url().optional(),
  title: z.string().optional(),
})

export const questionSchema = z.object({
  id: z.string().uuid(),
  stem: z.string().min(1),
  questionType: questionTypeSchema,
  options: z.array(optionSchema).min(2),
  explanation: z.string().nullable(),
  citations: z.array(citationSchema),
  tags: z.array(z.string().min(1)),
  curriculum: curriculumSchema,
  status: questionStatusSchema,
  createdBy: questionCreatedBySchema,
  createdAt: z.string().datetime({ offset: true }),
  sourceFingerprint: z.string().min(1),
  rationale: z.string().nullable().optional(),
  optionExplanations: z.record(z.string()).default({}).optional(),
  moduleCode: z.string().nullable().optional(),
  difficulty: difficultySchema.nullable().optional(),
  ausScore: z.number().int().min(1).max(5).nullable().optional(),
  source: z.record(z.unknown()).default({}).optional(),
})

export type Question = z.infer<typeof questionSchema>
export type QuestionOption = z.infer<typeof optionSchema>
export type QuestionStatus = z.infer<typeof questionStatusSchema>
export type QuestionCreatedBy = z.infer<typeof questionCreatedBySchema>
export type Curriculum = z.infer<typeof curriculumSchema>

export const LEGACY_CURRICULA = new Set(curriculumSchema.options.filter((value) => value !== "Unclassified"))

export function slugifyTagSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
}

export function humanizeSlugSegment(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export function humanizeTagSlug(slug: string) {
  const lastSegment = slug.split("/").filter(Boolean).at(-1) ?? slug
  return humanizeSlugSegment(lastSegment)
}

export function isQuestionAnswerable(question: Pick<Question, "options">) {
  return question.options.filter((option) => option.isCorrect === true).length === 1
}
