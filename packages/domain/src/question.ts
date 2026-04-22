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
export const generatedOptionKeySchema = z.enum(["A", "B", "C", "D", "E"])
export const generatedDifficultySchema = z.enum(["Intermediate", "Hard"])

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

export const generatedCitationSchema = z.object({
  type: z.literal("internal"),
  source: z.string().min(1),
  page: z.number().int().nonnegative().nullable(),
  url: z.null(),
  title: z.string().nullable(),
})
  .superRefine((citation, ctx) => {
    const hasLocator = citation.page !== null || (citation.title !== null && citation.title.trim().length > 0)
    if (!hasLocator) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["title"],
        message: "generated citations must include either a page or a section title.",
      })
    }
  })

export const generatedOptionSchema = z.object({
  key: generatedOptionKeySchema,
  text: z.string().min(1),
  isCorrect: z.boolean(),
})

const generatedWhyOthersWrongSchema = z.object({
  A: z.string().min(1).nullable(),
  B: z.string().min(1).nullable(),
  C: z.string().min(1).nullable(),
  D: z.string().min(1).nullable(),
  E: z.string().min(1).nullable(),
})

export const generatedCurriculumSchema = z.enum([
  "General Paediatrics",
  "Paediatric Sub-specialties",
  "Paediatric Surgery",
  "Emergency Paediatrics",
  "Adolescent Medicine",
  "Community-based Paediatrics",
])

export const generatedQuestionContentSchema = z
  .object({
    stem: z.string().min(1),
    questionType: z.literal("SBA"),
    options: z.array(generatedOptionSchema).length(5),
    explanation: z.string().min(1),
    citations: z.array(generatedCitationSchema).min(1),
    tags: z.array(z.string().min(1)).min(1),
    curriculum: generatedCurriculumSchema,
    why_others_wrong: generatedWhyOthersWrongSchema,
    key_takeaways: z.array(z.string().min(1)).min(3).max(8),
    moduleCode: z.string().nullable(),
    difficulty: generatedDifficultySchema.nullable(),
    ausScore: z.number().int().min(1).max(5).nullable(),
  })
  .superRefine((question, ctx) => {
    const expectedKeys = generatedOptionKeySchema.options
    const actualKeys = question.options.map((option) => option.key)
    const correctOptions = question.options.filter((option) => option.isCorrect)

    if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "options must contain exactly A-E in order.",
      })
    }

    if (correctOptions.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "options must include exactly one correct answer.",
      })
    }

    const correctKey = correctOptions[0]?.key ?? null
    for (const key of expectedKeys) {
      if (key === correctKey) continue
      if (!question.why_others_wrong[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["why_others_wrong", key],
          message: `why_others_wrong must include ${key}.`,
        })
      }
    }
  })

export const questionSchema = z
  .object({
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
  .superRefine((question, ctx) => {
    const review =
      typeof question.source?.review === "object" && question.source?.review !== null
        ? (question.source.review as Record<string, unknown>)
        : null
    const hasPublishReview =
      review?.decision === "publish" &&
      typeof review.reviewedAt === "string" &&
      typeof review.reviewedBy === "string" &&
      review.reviewedBy.length > 0

    if (question.createdBy === "ai" && question.status === "published" && !hasPublishReview) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["source", "review"],
        message: "Published AI-generated questions require explicit review metadata.",
      })
    }
  })

export type Question = z.infer<typeof questionSchema>
export type QuestionOption = z.infer<typeof optionSchema>
export type QuestionStatus = z.infer<typeof questionStatusSchema>
export type QuestionCreatedBy = z.infer<typeof questionCreatedBySchema>
export type Curriculum = z.infer<typeof curriculumSchema>
export type GeneratedQuestionContent = z.infer<typeof generatedQuestionContentSchema>

export const LEGACY_CURRICULA = new Set(curriculumSchema.options.filter((value) => value !== "Unclassified"))
const curriculumLookup = new Map(
  curriculumSchema.options.map((value) => [normalizeCurriculumLabel(value), value]),
)

export function normalizeCurriculumLabel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function findCurriculumByLabel(value: string) {
  return curriculumLookup.get(normalizeCurriculumLabel(value)) ?? null
}

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

export function normalizeTagSlug(value: string) {
  return value
    .split("/")
    .map((segment) => slugifyTagSegment(segment))
    .filter(Boolean)
    .join("/")
}

export function isQuestionAnswerable(question: Pick<Question, "options">) {
  return question.options.filter((option) => option.isCorrect === true).length === 1
}
