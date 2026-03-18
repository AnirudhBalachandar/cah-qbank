import { z } from "zod";

import { generatedQuestionResponseSchema } from "@/lib/server/schemas";

export type GeneratedQuestionPayload = z.infer<typeof generatedQuestionResponseSchema>;

export const generatedQuestionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "stem_markdown",
          "options",
          "correctKey",
          "explanation_markdown",
          "why_others_wrong",
          "key_takeaways",
          "tags",
          "citations",
        ],
        properties: {
          stem_markdown: { type: "string" },
          options: {
            type: "array",
            minItems: 5,
            maxItems: 5,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["key", "text"],
              properties: {
                key: { type: "string", enum: ["A", "B", "C", "D", "E"] },
                text: { type: "string" },
              },
            },
          },
          correctKey: { type: "string", enum: ["A", "B", "C", "D", "E"] },
          explanation_markdown: { type: "string" },
          why_others_wrong: {
            type: "object",
            additionalProperties: { type: "string" },
          },
          key_takeaways: {
            type: "array",
            minItems: 3,
            maxItems: 8,
            items: { type: "string" },
          },
          tags: {
            type: "array",
            minItems: 1,
            items: { type: "string" },
          },
          moduleCode: { type: ["string", "null"] },
          difficulty: { type: ["string", "null"], enum: ["Basic", "Intermediate", "Hard", null] },
          ausScore: { type: ["number", "null"] },
          citations: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["type"],
              properties: {
                type: { type: "string", enum: ["internal", "external"] },
                source: { type: "string" },
                page: { type: "number" },
                url: { type: "string" },
                title: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
} as const;

export function validateGeneratedPayload(raw: unknown, strictness: "strict_internal" | "augmented") {
  const parsed = generatedQuestionResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((issue) => issue.message),
    };
  }

  const errors: string[] = [];

  for (const [index, question] of parsed.data.questions.entries()) {
    const keys = question.options.map((option) => option.key);
    if (new Set(keys).size !== 5) {
      errors.push(`Question ${index + 1}: options must include unique A-E keys.`);
    }

    const distractorKeys = ["A", "B", "C", "D", "E"].filter((key) => key !== question.correctKey);
    for (const key of distractorKeys) {
      if (!question.why_others_wrong[key]) {
        errors.push(`Question ${index + 1}: missing why_others_wrong for ${key}.`);
      }
    }

    if (strictness === "strict_internal") {
      const hasExternal = question.citations.some((citation) => citation.type === "external");
      if (hasExternal) {
        errors.push(`Question ${index + 1}: strict_internal mode forbids external citations.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data: parsed.data,
  };
}
