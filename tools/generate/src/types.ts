import { z } from "zod"

export const jobStatusSchema = z.enum(["queued", "running", "done", "failed"])

export const jobInputSchema = z.object({
  sourcePath: z.string().min(1),
  tags: z.array(z.string().min(1)).default([]),
  ordinal: z.number().int().positive(),
  total: z.number().int().positive(),
})

export const jobOutputSchema = z.object({
  questionId: z.string().uuid(),
  draftPath: z.string().min(1),
  model: z.string().min(1),
})

export const jobRecordSchema = z.object({
  id: z.string().uuid(),
  status: jobStatusSchema,
  batch: z.string().min(1),
  input: jobInputSchema,
  output: jobOutputSchema.nullable(),
  error: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
})

export type JobStatus = z.infer<typeof jobStatusSchema>
export type JobInput = z.infer<typeof jobInputSchema>
export type JobOutput = z.infer<typeof jobOutputSchema>
export type JobRecord = z.infer<typeof jobRecordSchema>
