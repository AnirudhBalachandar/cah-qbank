import OpenAI from "openai"
import { zodResponseFormat, zodTextFormat } from "openai/helpers/zod"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { z } from "zod"

import { questionSchema, type Question } from "@cah/domain"

import { loadEnvironment } from "./generate/src/index.js"
import {
  DEFAULT_OPENROUTER_BASE_URL,
  resolveGenerationApiKey,
  resolveGenerationModel,
  resolveGenerationProvider,
  resolveOpenRouterHeaders,
} from "./generate/src/provider.js"

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, "..")
const draftsDir = path.join(repoRoot, "drafts")
const archiveDir = path.join(draftsDir, "_archived_style_blocked")
const reportDir = path.join(repoRoot, "reports", "draft-style-polish")
const reportPath = path.join(reportDir, "latest.json")
const defaultConcurrency = Number.parseInt(process.env.CAH_STYLE_CONCURRENCY ?? "4", 10)
const defaultRetryLimit = Number.parseInt(process.env.CAH_STYLE_RETRY_LIMIT ?? "2", 10)
const defaultRetryBaseDelayMs = Number.parseInt(process.env.CAH_STYLE_RETRY_BASE_DELAY_MS ?? "1500", 10)

const bannedLearnerFacingPhrases = [
  /\bsource pack\b/i,
  /\bprovided excerpts?\b/i,
  /\bprovided notes\b/i,
  /\baccording to the notes\b/i,
  /\bsource material\b/i,
  /\bstrict_internal\b/i,
  /\bthis batch\b|\bthe batch\b|\bbatch outcome\b|\bkeep the batch\b|\bwithin this batch\b/i,
  /\bdraft writer\b/i,
  /\bquestion-bank style\b/i,
]

const archiveReasons = new Map<string, string>([
  ["38a5cc37-7c71-47d8-91c5-39f592cffa38", "Source-sufficiency process artifact, not a clinical qbank item."],
  ["7d1767a1-8ee3-402f-a7c2-65c1ace362ce", "Source-sufficiency process artifact, not a clinical qbank item."],
  ["c5051ef7-0875-475a-955d-8dbdc9f823a7", "Source-sufficiency process artifact, not a clinical qbank item."],
  ["c65da458-d917-4b9a-8527-4d50a2264bfc", "Drafting-process artifact, not a clinical qbank item."],
  ["d7150f2b-ecac-4fd6-8a0b-6c27b71f0686", "Drafting-process artifact, not a clinical qbank item."],
  ["25a9fac0-146d-4b3d-ae9f-2504332a6e15", "Source-governance process artifact, not a clinical qbank item."],
  ["7a11500f-d836-4e73-91b1-34736ceb2b11", "Source-governance process artifact, not a clinical qbank item."],
  ["9298bcbb-bcbf-4506-ac07-a925c22f9918", "Publication-governance process artifact, not a clinical qbank item."],
  ["c7d73df5-06a0-468e-acd4-faf745a81dc4", "Question-authoring process artifact, not a clinical qbank item."],
  ["e3b9f760-894b-4c16-93c5-1e9ce5f54f6c", "Citation-governance process artifact, not a clinical qbank item."],
  ["eefa99f5-b215-48fb-9a61-2b92472a26b5", "Source-governance process artifact, not a clinical qbank item."],
  ["40c00f41-db14-4a64-a4f9-65357c38994f", "Batch-governance artifact, not a clinical qbank item."],
  ["454afcd7-daf6-4f25-bb16-a4dc93cabfaf", "Batch-governance artifact, not a clinical qbank item."],
  ["47a03b84-c983-42aa-adb6-37c04c554d37", "Batch-governance artifact, not a clinical qbank item."],
  ["65da72ce-8a8b-442c-8c9e-ebe0756e2d99", "Broken repair-message artifact with unrecoverable source content."],
])

const polishedOptionSchema = z.object({
  key: z.enum(["A", "B", "C", "D", "E"]),
  text: z.string().min(1),
  isCorrect: z.boolean(),
})

const polishedOptionExplanationsSchema = z.object({
  A: z.string().min(1),
  B: z.string().min(1),
  C: z.string().min(1),
  D: z.string().min(1),
  E: z.string().min(1),
})

const polishedOutputSchema = z
  .object({
    stem: z.string().min(1),
    options: z.array(polishedOptionSchema).length(5),
    explanation: z.string().min(1),
    rationale: z.string().nullable(),
    optionExplanations: polishedOptionExplanationsSchema,
  })
  .superRefine((value, ctx) => {
    const expectedKeys = ["A", "B", "C", "D", "E"]
    const actualKeys = value.options.map((option) => option.key)
    if (actualKeys.some((key, index) => key !== expectedKeys[index])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Options must be exactly A-E in order.",
      })
    }

    const correctCount = value.options.filter((option) => option.isCorrect).length
    if (correctCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Exactly one option must be correct.",
      })
    }
  })

type PolishedOutput = z.infer<typeof polishedOutputSchema>

type ScriptArgs = {
  ids: Set<string> | null
  limit: number | null
}

type PolishResult =
  | { id: string; status: "polished"; originalOptionCount: number }
  | { id: string; status: "archived"; reason: string }
  | { id: string; status: "failed"; error: string }

function toJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

async function readJson<T>(filePath: string) {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function normalizeSentence(value: string) {
  return collapseWhitespace(
    value
      .replace(/(?<!\\)\$([^$\n]+)\$/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/`([^`]+)`/g, "$1"),
  )
}

function stripTrailingOptionPunctuation(value: string) {
  return normalizeSentence(value).replace(/[.。]+$/u, "").trim()
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseArgs(argv: string[]): ScriptArgs {
  let ids: Set<string> | null = null
  let limit: number | null = null

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg) continue

    if (arg === "--ids") {
      const raw = argv[index + 1]
      if (!raw?.trim()) throw new Error("Missing value for --ids")
      ids = new Set(
        raw
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean),
      )
      index += 1
      continue
    }

    if (arg === "--limit") {
      const raw = argv[index + 1]
      const parsed = Number.parseInt(raw ?? "", 10)
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error("Invalid value for --limit")
      }
      limit = parsed
      index += 1
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return { ids, limit }
}

function isRetryableGenerationError(error: unknown) {
  const status = typeof error === "object" && error !== null && "status" in error ? Number((error as { status?: unknown }).status) : NaN
  const message =
    typeof error === "object" && error !== null && "message" in error ? String((error as { message?: unknown }).message ?? "") : ""

  if ([408, 409, 429].includes(status)) return true
  if (status >= 500 && status <= 599) return true
  return /rate-limit|rate limit|temporarily|timeout|overloaded/i.test(message)
}

async function withGenerationRetries<T>(work: () => Promise<T>) {
  let attempt = 0
  while (true) {
    try {
      return await work()
    } catch (error) {
      attempt += 1
      if (!isRetryableGenerationError(error) || attempt > defaultRetryLimit) {
        throw error
      }

      const backoffMs = Math.max(250, defaultRetryBaseDelayMs) * 2 ** (attempt - 1)
      const jitterMs = Math.floor(Math.random() * 250)
      await sleep(backoffMs + jitterMs)
    }
  }
}

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

function shouldArchiveQuestion(question: Question) {
  return archiveReasons.get(question.id) ?? null
}

function buildPrompt(question: Question) {
  const correctOption = question.options.find((option) => option.isCorrect) ?? null
  const reducedQuestion = {
    stem: question.stem,
    options: question.options,
    explanation: question.explanation,
    rationale: question.rationale,
    optionExplanations: question.optionExplanations,
    curriculum: question.curriculum,
    citations: question.citations,
  }

  return {
    system: [
      "You standardize Australian paediatric single-best-answer draft questions into a consistent learner-facing house style.",
      "Preserve the same clinical concept and the same correct-answer concept as the current draft.",
      "Non-negotiable style rules:",
      "1. Output exactly one learner-facing SBA question.",
      "2. Use one clear sentence-case stem ending with a question mark.",
      "3. Do not mention notes, source packs, excerpts, batches, drafting, evidence modes, or missing context.",
      "4. Return exactly 5 answer options labelled A-E in order, with exactly one correct option.",
      "5. Make options concise, parallel in form, and without trailing full stops.",
      "6. Write a short explanation in plain declarative prose that starts by naming the correct answer or concept directly.",
      "7. Do not use the literal prefixes 'Correct because' or 'Incorrect because' in the main explanation.",
      "8. Provide option explanations for all 5 options.",
      "9. The correct option explanation must start with 'Correct because'.",
      "10. Each incorrect option explanation must start with 'Incorrect because'.",
      "11. Keep the item educational and clinically grounded; do not add new external references.",
      "12. If the current draft has only 4 options, add one plausible distractor to make 5 while preserving the same correct-answer concept.",
      "13. Keep Australian spelling where relevant.",
    ].join(" "),
    user: [
      `Current correct option: ${correctOption ? `${correctOption.key} = ${correctOption.text}` : "unknown"}`,
      "Rewrite the following draft into the required house style and return only the structured final copy fields.",
      toJson(reducedQuestion),
    ].join("\n\n"),
  }
}

async function generateWithOpenAI({
  client,
  model,
  question,
}: {
  client: OpenAI
  model: string
  question: Question
}) {
  const prompt = buildPrompt(question)

  const response = await withGenerationRetries(() =>
    client.responses.parse({
      model,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: prompt.system }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: prompt.user }],
        },
      ],
      text: {
        format: zodTextFormat(polishedOutputSchema, "polished_question"),
      },
    }),
  )

  if (response.output_parsed) {
    return polishedOutputSchema.parse(response.output_parsed)
  }

  const refusal = extractRefusal(response)
  if (refusal) {
    throw new Error(`Model refusal: ${refusal}`)
  }

  throw new Error("Model returned no parseable polish output.")
}

async function generateWithOpenRouter({
  client,
  model,
  question,
}: {
  client: OpenAI
  model: string
  question: Question
}) {
  const prompt = buildPrompt(question)

  const response = await withGenerationRetries(() =>
    client.chat.completions.parse({
      model,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      response_format: zodResponseFormat(polishedOutputSchema, "polished_question"),
    }),
  )

  const parsed = response.choices[0]?.message.parsed
  if (parsed) {
    return polishedOutputSchema.parse(parsed)
  }

  const refusal = extractChatRefusal(response)
  if (refusal) {
    throw new Error(`Model refusal: ${refusal}`)
  }

  throw new Error("Model returned no parseable polish output.")
}

function normalizePolishedOutput(output: PolishedOutput) {
  const options = output.options.map((option) => ({
    key: option.key,
    text: stripTrailingOptionPunctuation(option.text),
    isCorrect: option.isCorrect,
  }))

  const explanation = normalizeSentence(output.explanation)
    .replace(/\bCorrect because\b/g, "This is because")
    .replace(/\bIncorrect because\b/g, "This is because")
  const rationale = output.rationale ? normalizeSentence(output.rationale) : null
  const optionExplanations = Object.fromEntries(
    Object.entries(output.optionExplanations).map(([key, value]) => {
      const normalized = normalizeSentence(value)
      return [key, normalized]
    }),
  ) as PolishedOutput["optionExplanations"]

  const normalized = polishedOutputSchema.parse({
    stem: normalizeSentence(output.stem),
    options,
    explanation,
    rationale,
    optionExplanations,
  })

  return normalized
}

function collectStyleViolations(output: PolishedOutput) {
  const violations: string[] = []

  if (!output.stem.endsWith("?")) {
    violations.push("Stem must end with a question mark.")
  }

  if (/\bCorrect because\b|\bIncorrect because\b/.test(output.explanation)) {
    violations.push("Main explanation must not contain option-explanation prefixes.")
  }

  for (const option of output.options) {
    if (/[.。]$/.test(option.text)) {
      violations.push(`Option ${option.key} ends with terminal punctuation.`)
    }
  }

  for (const pattern of bannedLearnerFacingPhrases) {
    if (
      pattern.test(output.stem) ||
      pattern.test(output.explanation) ||
      pattern.test(output.rationale ?? "") ||
      Object.values(output.optionExplanations).some((value) => pattern.test(value))
    ) {
      violations.push(`Learner-facing copy still contains banned phrase: ${pattern}`)
    }
  }

  for (const option of output.options) {
    const explanation = output.optionExplanations[option.key]
    const expectedPrefix = option.isCorrect ? "Correct because" : "Incorrect because"
    if (!explanation.startsWith(expectedPrefix)) {
      violations.push(`Option explanation ${option.key} must start with '${expectedPrefix}'.`)
    }
  }

  return violations
}

async function polishQuestion(question: Question, generation: ReturnType<typeof getOpenAIClient>) {
  let lastViolation = "Unknown style validation failure."

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const generated =
      generation.provider === "openrouter"
        ? await generateWithOpenRouter({ client: generation.client, model: generation.model, question })
        : await generateWithOpenAI({ client: generation.client, model: generation.model, question })

    const normalized = normalizePolishedOutput(generated)
    const violations = collectStyleViolations(normalized)
    if (violations.length === 0) {
      const polishedAt = new Date().toISOString()
      return questionSchema.parse({
        ...question,
        stem: normalized.stem,
        questionType: "SBA",
        options: normalized.options,
        explanation: normalized.explanation,
        rationale: normalized.rationale,
        optionExplanations: normalized.optionExplanations,
        source: {
          ...(question.source ?? {}),
          stylePolish: {
            polishedAt,
            provider: generation.provider,
            model: generation.model,
            originalOptionCount: question.options.length,
            houseStyleVersion: "2026-04-23-v1",
          },
        },
      })
    }

    lastViolation = violations.join(" ")
  }

  throw new Error(lastViolation)
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length)
  let cursor = 0

  const runWorker = async () => {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      const item = items[index]
      if (!item) return
      results[index] = await worker(item, index)
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => runWorker()))
  return results
}

async function main() {
  loadEnvironment()
  const args = parseArgs(process.argv.slice(2))
  await fs.mkdir(archiveDir, { recursive: true })
  await fs.mkdir(reportDir, { recursive: true })

  const entries = await fs.readdir(draftsDir, { withFileTypes: true })
  const fileNames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))

  const questions: Question[] = []
  const archivedResults: PolishResult[] = []

  for (const fileName of fileNames) {
    const filePath = path.join(draftsDir, fileName)
    const raw = await readJson<unknown>(filePath)
    const question = questionSchema.parse(raw)
    if (args.ids && !args.ids.has(question.id)) continue

    const archiveReason = shouldArchiveQuestion(question)
    if (archiveReason) {
      const archivedAt = new Date().toISOString()
      const archivedQuestion = questionSchema.parse({
        ...question,
        source: {
          ...(question.source ?? {}),
          stylePolishArchive: {
            archivedAt,
            reason: archiveReason,
          },
        },
      })
      await fs.writeFile(path.join(archiveDir, `${question.id}.json`), `${toJson(archivedQuestion)}\n`, "utf8")
      await fs.rm(filePath, { force: true })
      archivedResults.push({ id: question.id, status: "archived", reason: archiveReason })
      continue
    }

    questions.push(question)
    if (args.limit !== null && questions.length >= args.limit) break
  }

  const generation = getOpenAIClient()
  const polishedResults = await mapWithConcurrency(questions, defaultConcurrency, async (question, index) => {
    const filePath = path.join(draftsDir, `${question.id}.json`)

    try {
      const polished = await polishQuestion(question, generation)
      await fs.writeFile(filePath, `${toJson(polished)}\n`, "utf8")
      if ((index + 1) % 25 === 0 || index === questions.length - 1) {
        console.log(JSON.stringify({ progress: index + 1, total: questions.length }))
      }
      return { id: question.id, status: "polished", originalOptionCount: question.options.length } as PolishResult
    } catch (error) {
      const failure = {
        id: question.id,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      } as PolishResult
      console.error(JSON.stringify(failure))
      if ((index + 1) % 25 === 0 || index === questions.length - 1) {
        console.log(JSON.stringify({ progress: index + 1, total: questions.length }))
      }
      return failure
    }
  })

  const results = [...archivedResults, ...polishedResults]
  const polished = results.filter((result): result is Extract<PolishResult, { status: "polished" }> => result.status === "polished")
  const archived = results.filter((result): result is Extract<PolishResult, { status: "archived" }> => result.status === "archived")
  const failed = results.filter((result): result is Extract<PolishResult, { status: "failed" }> => result.status === "failed")

  const summary = {
    polishedAt: new Date().toISOString(),
    provider: generation.provider,
    model: generation.model,
    polishedCount: polished.length,
    archivedCount: archived.length,
    failedCount: failed.length,
    optionConversions: {
      from4to5: polished.filter((result) => result.originalOptionCount === 4).length,
      from5to5: polished.filter((result) => result.originalOptionCount === 5).length,
    },
    archived,
    failed,
  }

  await fs.writeFile(reportPath, `${toJson(summary)}\n`, "utf8")
  console.log(toJson(summary))

  if (failed.length > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
