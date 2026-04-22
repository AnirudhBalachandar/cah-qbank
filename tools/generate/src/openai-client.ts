import OpenAI from "openai"
import { zodTextFormat } from "openai/helpers/zod"
import path from "node:path"

import { generatedQuestionContentSchema, type GeneratedQuestionContent } from "@cah/domain"

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

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for generate worker")
  }
  return new OpenAI({ apiKey })
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

export function createDraftGenerator(client = getOpenAIClient()): DraftGenerator {
  return async function generateDraft({
    batch,
    ordinal,
    total,
    requestedTags,
    sourcePath,
    sourceLabel,
    sourceExcerpt,
  }) {
    const model = process.env.OPENAI_MODEL ?? "gpt-5.4-mini"
    const tagLine = requestedTags.length > 0 ? requestedTags.join(", ") : "(none requested)"
    const sourceFileName = path.basename(sourcePath)

    const response = await client.responses.parse({
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
                `Batch: ${batch}`,
                `Job: ${ordinal} of ${total}`,
                `Requested tags: ${tagLine}`,
                `Source file: ${sourceFileName}`,
                `Required citation.source: ${sourceFileName}`,
                `Required citation.title fallback: ${sourceLabel}`,
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
                sourceExcerpt,
              ].join("\n"),
            },
          ],
        },
      ],
      text: {
        format: zodTextFormat(generatedQuestionContentSchema, "generated_question"),
      },
    })

    if (response.output_parsed) {
      return generatedQuestionContentSchema.parse(response.output_parsed)
    }

    const refusal = extractRefusal(response)
    if (refusal) {
      throw new Error(`Model refusal: ${refusal}`)
    }

    throw new Error("Model returned no parseable output.")
  }
}
