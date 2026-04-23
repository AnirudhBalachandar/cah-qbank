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
const importRoot = path.join(draftsDir, "_imports", "combined-canvas-notebooklm-v1")
const manifestPath = path.join(importRoot, "manifest.json")
const reportPath = path.join(importRoot, "answer_repair_report.json")
const defaultConcurrency = Number.parseInt(process.env.CAH_REPAIR_CONCURRENCY ?? "4", 10)
const defaultRetryLimit = Number.parseInt(process.env.CAH_REPAIR_RETRY_LIMIT ?? "3", 10)
const defaultRetryBaseDelayMs = Number.parseInt(process.env.CAH_REPAIR_RETRY_BASE_DELAY_MS ?? "1500", 10)

const repairedOptionSchema = z.object({
  key: z.string().min(1),
  text: z.string().min(1),
  isCorrect: z.boolean(),
})

const repairedOptionExplanationSchema = z.object({
  key: z.string().min(1),
  explanation: z.string().min(1),
})

const repairOutputSchema = z
  .object({
    method: z.enum(["selected_existing_option", "rewritten_to_sba"]),
    stem: z.string().min(1),
    options: z.array(repairedOptionSchema).min(2).max(9),
    explanation: z.string().min(1),
    optionExplanations: z.array(repairedOptionExplanationSchema),
    rationale: z.string().nullable(),
    confidence: z.number().min(0).max(1),
    notes: z.string().nullable(),
  })
  .superRefine((value, ctx) => {
    const correctCount = value.options.filter((option) => option.isCorrect).length
    if (correctCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Exactly one option must be marked correct.",
      })
    }
  })

type RepairOutput = z.infer<typeof repairOutputSchema>

type ImportManifest = {
  ids: string[]
}

type RepairTask = {
  question: Question
  filePath: string
}

type ScriptArgs = {
  ids: Set<string> | null
  limit: number | null
}

type RepairResult =
  | {
      id: string
      status: "repaired"
      method: RepairOutput["method"]
      confidence: number
    }
  | {
      id: string
      status: "skipped_already_repaired"
    }
  | {
      id: string
      status: "failed"
      error: string
    }

function toJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

async function readJson<T>(filePath: string) {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

function stripReadinessTags(tags: string[]) {
  return tags.filter((tag) => !tag.startsWith("combined-import/promotion/"))
}

function stripManualConversionTags(tags: string[]) {
  return stripReadinessTags(tags).filter((tag) => tag !== "combined-import/requires-manual-conversion")
}

function normalizeOptionExplanations(result: RepairOutput) {
  const entries = (result.optionExplanations ?? [])
    .filter((entry) => Boolean(entry.key) && Boolean(entry.explanation?.trim()))
    .map((entry) => [entry.key, entry.explanation.trim()] as const)
  return Object.fromEntries(entries)
}

function normalizeComparableText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
}

function createLetterKeys(count: number) {
  return Array.from({ length: count }, (_, index) => String.fromCharCode("A".charCodeAt(0) + index))
}

function isQuestionAnswerable(question: Pick<Question, "options">) {
  return question.options.filter((option) => option.isCorrect === true).length === 1
}

function alreadyRepaired(question: Question) {
  const answerRecovery = (question.source?.answerRecovery as Record<string, unknown> | undefined) ?? null
  return Boolean(answerRecovery) && question.createdBy === "ai" && isQuestionAnswerable(question)
}

function resolveSelectedExistingOptions(task: RepairTask, result: RepairOutput) {
  const repairedCorrect = result.options.find((option) => option.isCorrect)
  if (!repairedCorrect) {
    throw new Error("Repair result did not identify a correct option.")
  }

  let matchedIndex = task.question.options.findIndex((option) => option.key === repairedCorrect.key)
  if (matchedIndex === -1) {
    const comparableText = normalizeComparableText(repairedCorrect.text)
    matchedIndex = task.question.options.findIndex((option) => normalizeComparableText(option.text) === comparableText)
  }
  if (matchedIndex === -1 && result.options.length === task.question.options.length) {
    matchedIndex = result.options.findIndex((option) => option.isCorrect)
  }
  if (matchedIndex === -1 || !task.question.options[matchedIndex]) {
    throw new Error("Could not map selected existing option back to the preserved imported option set.")
  }

  return task.question.options.map((option, index) => ({
    key: option.key,
    text: option.text.trim(),
    isCorrect: index === matchedIndex,
  }))
}

function rewriteOptionsWithCanonicalKeys(result: RepairOutput) {
  const keys = createLetterKeys(result.options.length)
  const optionKeyMap = new Map<string, string>()
  const normalizedOptions = result.options.map((option, index) => {
    const nextKey = keys[index] ?? option.key
    optionKeyMap.set(option.key, nextKey)
    return {
      key: nextKey,
      text: option.text.trim(),
      isCorrect: option.isCorrect,
    }
  })

  const normalizedOptionExplanations = Object.fromEntries(
    (result.optionExplanations ?? [])
      .filter((entry) => Boolean(entry.explanation?.trim()))
      .map((entry) => [optionKeyMap.get(entry.key) ?? entry.key, entry.explanation.trim()]),
  )

  return { normalizedOptions, normalizedOptionExplanations }
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

function buildPrompt(task: RepairTask) {
  const source = (task.question.source ?? {}) as Record<string, unknown>
  const combinedRecord = ((source.combinedRecord as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
  const sourceSystem = String(source.sourceSystem ?? "unknown")
  const originalQuestionType = String(source.originalQuestionType ?? combinedRecord.question_type ?? "").trim() || "Unspecified"
  const promotionStatus = ((source.promotionReadiness as { status?: string } | undefined)?.status ?? "unknown").trim()
  const existingOptions = task.question.options.map((option) => ({
    key: option.key,
    text: option.text,
  }))

  const mode =
    promotionStatus === "manual_conversion_required" || task.question.tags.includes("combined-import/requires-manual-conversion")
      ? "rewrite"
      : originalQuestionType === "Multiple Answer"
        ? "rewrite_or_select"
        : "select_if_possible"

  return {
    system: [
      "You repair imported Australian paediatrics revision questions so they become answerable single-best-answer items.",
      "Your output must be a valid single-best-answer question with exactly one correct option.",
      "Preserve the clinical concept and source wording where possible.",
      "If the imported item already has suitable options, prefer selecting the correct existing option rather than rewriting.",
      "If the imported item is numeric, matching, ordering, fill-in-the-blank, or multi-answer, rewrite it into a faithful single-best-answer item.",
      "If more than one listed option could be medically true, you must rewrite the item so that exactly one option is the best answer.",
      "Never mark multiple options as correct, even if the source phrasing is ambiguous.",
      "Use concise educational explanations and brief option-specific explanations.",
      "Do not mention that you are an AI in the question content.",
      "Keep it education-only and not medical advice.",
      "Use standard medical knowledge when the source lacks explicit answer keys.",
      "Set confidence based on how certain the best answer is.",
    ].join(" "),
    user: [
      `Repair mode: ${mode}`,
      `Source system: ${sourceSystem}`,
      `Current curriculum: ${task.question.curriculum}`,
      `Current createdBy: ${task.question.createdBy}`,
      `Current promotion status: ${promotionStatus}`,
      `Original question type: ${originalQuestionType}`,
      `Quiz title: ${String(source.quizTitle ?? "")}`,
      `Current stem:\n${task.question.stem}`,
      `Current options:\n${toJson(existingOptions)}`,
      `Original combined record:\n${toJson({
        question_text: combinedRecord.question_text,
        question_type: combinedRecord.question_type,
        stimulus_text: combinedRecord.stimulus_text,
        instructions: combinedRecord.instructions,
        options: combinedRecord.options,
        correct_option_texts: combinedRecord.correct_option_texts,
      })}`,
      "Return either:",
      "- method=selected_existing_option when the current options can be preserved and exactly one should be marked correct",
      "- method=rewritten_to_sba when the item must be rewritten into a valid SBA",
      "- if multiple current options would be correct, choose method=rewritten_to_sba",
      "When rewriting, provide 4-5 options whenever feasible.",
      "When preserving existing options, keep the option text unchanged.",
      "Ensure option keys are sequential and match the returned options.",
    ].join("\n\n"),
  }
}

async function generateWithOpenAI({
  client,
  model,
  task,
}: {
  client: OpenAI
  model: string
  task: RepairTask
}) {
  const prompt = buildPrompt(task)

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
        format: zodTextFormat(repairOutputSchema, "repaired_question"),
      },
    }),
  )

  if (response.output_parsed) {
    return repairOutputSchema.parse(response.output_parsed)
  }

  const refusal = extractRefusal(response)
  if (refusal) {
    throw new Error(`Model refusal: ${refusal}`)
  }

  throw new Error("Model returned no parseable repair output.")
}

async function generateWithOpenRouter({
  client,
  model,
  task,
}: {
  client: OpenAI
  model: string
  task: RepairTask
}) {
  const prompt = buildPrompt(task)

  const response = await withGenerationRetries(() =>
    client.chat.completions.parse({
      model,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      response_format: zodResponseFormat(repairOutputSchema, "repaired_question"),
    }),
  )

  const parsed = response.choices[0]?.message.parsed
  if (parsed) {
    return repairOutputSchema.parse(parsed)
  }

  const refusal = extractChatRefusal(response)
  if (refusal) {
    throw new Error(`Model refusal: ${refusal}`)
  }

  throw new Error("Model returned no parseable repair output.")
}

async function repairQuestion(task: RepairTask, generation: ReturnType<typeof getOpenAIClient>): Promise<RepairResult> {
  if (alreadyRepaired(task.question)) {
    return {
      id: task.question.id,
      status: "skipped_already_repaired",
    }
  }

  const { client, model, provider } = generation
  const repairedAt = new Date().toISOString()
  const result =
    provider === "openrouter"
      ? await generateWithOpenRouter({ client, model, task })
      : await generateWithOpenAI({ client, model, task })

  const normalizedOptions =
    result.method === "selected_existing_option"
      ? resolveSelectedExistingOptions(task, result)
      : rewriteOptionsWithCanonicalKeys(result).normalizedOptions
  const normalizedOptionExplanations =
    result.method === "selected_existing_option"
      ? normalizeOptionExplanations(result)
      : rewriteOptionsWithCanonicalKeys(result).normalizedOptionExplanations

  const updated = questionSchema.parse({
    ...task.question,
    stem: result.stem.trim(),
    questionType: "SBA",
    options: normalizedOptions,
    explanation: result.explanation.trim(),
    rationale: result.rationale?.trim() || task.question.rationale || null,
    optionExplanations: normalizedOptionExplanations,
    createdBy: "ai",
    tags: Array.from(
      new Set([
        ...stripManualConversionTags(task.question.tags),
        "combined-import/ai-answer-recovered",
        `combined-import/repair-method/${result.method}`,
      ]),
    ).sort((left, right) => left.localeCompare(right)),
    source: {
      ...(task.question.source ?? {}),
      answerRecovery: {
        repairedAt,
        provider,
        model,
        method: result.method,
        confidence: result.confidence,
        notes: result.notes,
        preRepair: {
          createdBy: task.question.createdBy,
          stem: task.question.stem,
          options: task.question.options,
          explanation: task.question.explanation,
          rationale: task.question.rationale,
          optionExplanations: task.question.optionExplanations,
          promotionStatus:
            ((task.question.source?.promotionReadiness as { status?: string } | undefined)?.status ?? null) as string | null,
        },
      },
    },
  })

  await fs.writeFile(task.filePath, `${toJson(updated)}\n`, "utf8")

  return {
    id: updated.id,
    status: "repaired",
    method: result.method,
    confidence: result.confidence,
  }
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

  const manifest = await readJson<ImportManifest>(manifestPath)
  const tasks: RepairTask[] = []

  for (const id of manifest.ids) {
    if (args.ids && !args.ids.has(id)) continue
    const filePath = path.join(draftsDir, `${id}.json`)
    const raw = await readJson<unknown>(filePath)
    const question = questionSchema.parse(raw)
    const promotionStatus = ((question.source?.promotionReadiness as { status?: string } | undefined)?.status ?? "").trim()
    if (!["ready_for_published_browse_only", "manual_conversion_required"].includes(promotionStatus)) continue
    tasks.push({ question, filePath })
    if (args.limit !== null && tasks.length >= args.limit) break
  }

  const generation = getOpenAIClient()
  const results = await mapWithConcurrency(tasks, defaultConcurrency, async (task, index) => {
    try {
      const result = await repairQuestion(task, generation)
      if ((index + 1) % 25 === 0 || index === tasks.length - 1) {
        console.log(JSON.stringify({ progress: index + 1, total: tasks.length }))
      }
      return result
    } catch (error) {
      const failure: RepairResult = {
        id: task.question.id,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      }
      console.error(JSON.stringify(failure))
      if ((index + 1) % 25 === 0 || index === tasks.length - 1) {
        console.log(JSON.stringify({ progress: index + 1, total: tasks.length }))
      }
      return failure
    }
  })

  const repairedResults = results.filter((result): result is Extract<RepairResult, { status: "repaired" }> => result.status === "repaired")
  const skippedResults = results.filter(
    (result): result is Extract<RepairResult, { status: "skipped_already_repaired" }> =>
      result.status === "skipped_already_repaired",
  )
  const failedResults = results.filter((result): result is Extract<RepairResult, { status: "failed" }> => result.status === "failed")

  const summary = {
    targetCount: tasks.length,
    repairedCount: repairedResults.length,
    skippedAlreadyRepairedCount: skippedResults.length,
    failedCount: failedResults.length,
    methodCounts: Object.fromEntries(
      Array.from(
        repairedResults.reduce((map, result) => {
          map.set(result.method, (map.get(result.method) ?? 0) + 1)
          return map
        }, new Map<string, number>()),
      ).sort((left, right) => left[0].localeCompare(right[0])),
    ),
    confidence: {
      min: repairedResults.length === 0 ? null : Math.min(...repairedResults.map((result) => result.confidence)),
      max: repairedResults.length === 0 ? null : Math.max(...repairedResults.map((result) => result.confidence)),
      average:
        repairedResults.reduce((sum, result) => sum + result.confidence, 0) / (repairedResults.length === 0 ? 1 : repairedResults.length),
    },
    failed: failedResults,
  }

  await fs.writeFile(reportPath, `${toJson(summary)}\n`, "utf8")
  console.log(toJson(summary))

  if (failedResults.length > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
