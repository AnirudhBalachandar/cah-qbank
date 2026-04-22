import OpenAI from "openai"
import { zodResponseFormat, zodTextFormat } from "openai/helpers/zod"
import path from "node:path"

import { generatedQuestionContentSchema, type GeneratedQuestionContent } from "@cah/domain"

import {
  DEFAULT_OPENROUTER_BASE_URL,
  resolveGenerationApiKey,
  resolveGenerationModel,
  resolveGenerationProvider,
  resolveOpenRouterHeaders,
  type GenerationProvider,
} from "./provider.js"

type GenerateDraftRequest = {
  batch: string
  ordinal: number
  total: number
  requestedTags: string[]
  sourcePath: string
  sourceLabel: string
  sourceExcerpt: string
}

export type DraftGenerator = (request: GenerateDraftRequest) => Promise<GeneratedQuestionContent>
const defaultRetryLimit = 3
const defaultRetryBaseDelayMs = 1500

function getOpenAIClient() {
  const provider = resolveGenerationProvider()
  const apiKey = resolveGenerationApiKey()

  if (provider === "openrouter") {
    return {
      provider,
      model: resolveGenerationModel(),
      client: new OpenAI({
        baseURL: DEFAULT_OPENROUTER_BASE_URL,
        apiKey,
        defaultHeaders: resolveOpenRouterHeaders(),
      }),
    }
  }

  return {
    provider,
    model: resolveGenerationModel(),
    client: new OpenAI({ apiKey }),
  }
}

function extractRefusal(response: Awaited<ReturnType<OpenAI["responses"]["parse"]>>) {
  const messages: string[] = []

  for (const item of response.output) {
    if (item.type !== "message") continue
    for (const content of item.content) {
      if (content.type === "refusal") {
        messages.push(content.refusal)
      }
    }
  }

  return messages.join("\n").trim()
}

function extractChatRefusal(response: Awaited<ReturnType<OpenAI["chat"]["completions"]["parse"]>>) {
  return response.choices
    .map((choice) => choice.message.refusal?.trim())
    .filter((value): value is string => Boolean(value))
    .join("\n")
    .trim()
}

function isRetryableGenerationError(error: unknown) {
  const status = typeof error === "object" && error !== null && "status" in error ? Number((error as { status?: unknown }).status) : NaN
  const message =
    typeof error === "object" && error !== null && "message" in error ? String((error as { message?: unknown }).message ?? "") : ""

  if ([408, 409, 429].includes(status)) return true
  if (status >= 500 && status <= 599) return true
  return /rate-limit|rate limit|temporarily|timeout|overloaded/i.test(message)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withGenerationRetries<T>(work: () => Promise<T>) {
  const retryLimit = Number.parseInt(process.env.GENERATE_RETRY_LIMIT ?? `${defaultRetryLimit}`, 10)
  const baseDelayMs = Number.parseInt(process.env.GENERATE_RETRY_BASE_DELAY_MS ?? `${defaultRetryBaseDelayMs}`, 10)

  let attempt = 0
  while (true) {
    try {
      return await work()
    } catch (error) {
      attempt += 1
      if (!isRetryableGenerationError(error) || attempt > retryLimit) {
        throw error
      }

      const backoffMs = Math.max(250, baseDelayMs) * 2 ** (attempt - 1)
      const jitterMs = Math.floor(Math.random() * 250)
      await sleep(backoffMs + jitterMs)
    }
  }
}

async function generateWithOpenAI({
  client,
  model,
  input,
}: {
  client: OpenAI
  model: string
  input: GenerateDraftRequest
}) {
  const tagLine = input.requestedTags.length > 0 ? input.requestedTags.join(", ") : "(none requested)"
  const sourceFileName = path.basename(input.sourcePath)

  const response = await withGenerationRetries(() =>
    client.responses.parse({
      model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: [
                "You create original Australian paediatrics SBA revision questions.",
                "Use only the supplied source excerpt for examinable claims.",
                "Do not use outside medical knowledge, and do not invent unsupported facts.",
                "Generate exactly one SBA question with options A-E and exactly one best answer.",
                "Keep it education-only and not medical advice.",
                "Use internal citations only, pointing back to the supplied source file.",
                "Every citation.source must be the exact source filename.",
                "Every citation.url must be null.",
                "Every citation must include either page or title.",
                "If the excerpt has no explicit page number, set citation.title to the assigned source window label exactly.",
                "Difficulty must be Intermediate or Hard.",
                "If the source is too thin, stay narrow rather than adding detail.",
              ].join(" "),
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                `Batch: ${input.batch}`,
                `Job: ${input.ordinal} of ${input.total}`,
                `Requested tags: ${tagLine}`,
                `Source file: ${sourceFileName}`,
                `Required citation.source: ${sourceFileName}`,
                `Required citation.title fallback: ${input.sourceLabel}`,
                "Allowed curriculum values:",
                "- General Paediatrics",
                "- Paediatric Sub-specialties",
                "- Paediatric Surgery",
                "- Emergency Paediatrics",
                "- Adolescent Medicine",
                "- Community-based Paediatrics",
                "",
                "Return a single original question that follows the schema.",
                "Use concise tag slugs or slash-separated tag paths where appropriate.",
                "Source excerpt:",
                input.sourceExcerpt,
              ].join("\n"),
            },
          ],
        },
      ],
      text: {
        format: zodTextFormat(generatedQuestionContentSchema, "generated_question"),
      },
    }),
  )

  if (response.output_parsed) {
    return generatedQuestionContentSchema.parse(response.output_parsed)
  }

  const refusal = extractRefusal(response)
  if (refusal) {
    throw new Error(`Model refusal: ${refusal}`)
  }

  throw new Error("Model returned no parseable output.")
}

async function generateWithOpenRouter({
  client,
  model,
  input,
}: {
  client: OpenAI
  model: string
  input: GenerateDraftRequest
}) {
  const tagLine = input.requestedTags.length > 0 ? input.requestedTags.join(", ") : "(none requested)"
  const sourceFileName = path.basename(input.sourcePath)

  const response = await withGenerationRetries(() =>
    client.chat.completions.parse({
      model,
      messages: [
        {
          role: "system",
          content: [
            "You create original Australian paediatrics SBA revision questions.",
            "Use only the supplied source excerpt for examinable claims.",
            "Do not use outside medical knowledge, and do not invent unsupported facts.",
            "Generate exactly one SBA question with options A-E and exactly one best answer.",
            "Keep it education-only and not medical advice.",
            "Use internal citations only, pointing back to the supplied source file.",
            "Every citation.source must be the exact source filename.",
            "Every citation.url must be null.",
            "Every citation must include either page or title.",
            "If the excerpt has no explicit page number, set citation.title to the assigned source window label exactly.",
            "Difficulty must be Intermediate or Hard.",
            "If the source is too thin, stay narrow rather than adding detail.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `Batch: ${input.batch}`,
            `Job: ${input.ordinal} of ${input.total}`,
            `Requested tags: ${tagLine}`,
            `Source file: ${sourceFileName}`,
            `Required citation.source: ${sourceFileName}`,
            `Required citation.title fallback: ${input.sourceLabel}`,
            "Allowed curriculum values:",
            "- General Paediatrics",
            "- Paediatric Sub-specialties",
            "- Paediatric Surgery",
            "- Emergency Paediatrics",
            "- Adolescent Medicine",
            "- Community-based Paediatrics",
            "",
            "Return a single original question that follows the schema.",
            "Use concise tag slugs or slash-separated tag paths where appropriate.",
            "Source excerpt:",
            input.sourceExcerpt,
          ].join("\n"),
        },
      ],
      response_format: zodResponseFormat(generatedQuestionContentSchema, "generated_question"),
    }),
  )

  const message = response.choices[0]?.message
  if (message?.parsed) {
    return generatedQuestionContentSchema.parse(message.parsed)
  }

  const refusal = extractChatRefusal(response)
  if (refusal) {
    throw new Error(`Model refusal: ${refusal}`)
  }

  throw new Error("Model returned no parseable output.")
}

export function createDraftGenerator(
  clientConfig = getOpenAIClient(),
): DraftGenerator {
  return async function generateDraft({
    batch,
    ordinal,
    total,
    requestedTags,
    sourcePath,
    sourceLabel,
    sourceExcerpt,
  }) {
    const input: GenerateDraftRequest = {
      batch,
      ordinal,
      total,
      requestedTags,
      sourcePath,
      sourceLabel,
      sourceExcerpt,
    }

    if (clientConfig.provider === "openrouter") {
      return generateWithOpenRouter({
        client: clientConfig.client,
        model: clientConfig.model,
        input,
      })
    }

    return generateWithOpenAI({
      client: clientConfig.client,
      model: clientConfig.model,
      input,
    })
  }
}
