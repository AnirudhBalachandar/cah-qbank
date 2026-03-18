import OpenAI from "openai";

import { generatedQuestionJsonSchema } from "@/lib/server/generation/validator";

export type GenerationUsage = {
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required");
  }

  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function getModel() {
  return process.env.OPENAI_MODEL ?? "gpt-5.1";
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function generateStructuredQuestions(prompt: string) {
  const client = getOpenAIClient();
  const model = getModel();

  const response = await client.responses.create({
    model,
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        name: "generated_questions",
        strict: true,
        schema: generatedQuestionJsonSchema,
      },
    },
  });

  const text = response.output_text;
  if (!text) {
    throw new Error("LLM returned empty output_text");
  }

  return {
    payload: JSON.parse(text) as unknown,
    usage: {
      model,
      inputTokens: asNumber(response.usage?.input_tokens),
      outputTokens: asNumber(response.usage?.output_tokens),
      totalTokens: asNumber(response.usage?.total_tokens),
    } satisfies GenerationUsage,
  };
}
