import OpenAI from "openai"
import { zodTextFormat } from "openai/helpers/zod"
import fs from "node:fs/promises"
import path from "node:path"
import { z } from "zod"

import { isQuestionAnswerable, normalizeTagSlug, questionSchema, type Question } from "@cah/domain"

import { loadEnvironment } from "./generate/src/index.js"
import { resolveGenerationApiKey, resolveGenerationModel, resolveGenerationProvider } from "./generate/src/provider.js"

const repoRoot = process.cwd()
const questionsDir = path.join(repoRoot, "questions")
const reportDir = path.join(repoRoot, "reports", "published-answerability-repair")
const latestReportPath = path.join(reportDir, "latest.json")
const resultsPath = path.join(reportDir, "results.json")
const defaultConcurrency = Number.parseInt(process.env.CAH_PUBLISHED_REPAIR_CONCURRENCY ?? "2", 10)
const defaultRetryLimit = Number.parseInt(process.env.CAH_PUBLISHED_REPAIR_RETRY_LIMIT ?? "2", 10)
const defaultRetryBaseDelayMs = Number.parseInt(process.env.CAH_PUBLISHED_REPAIR_RETRY_BASE_DELAY_MS ?? "2000", 10)

const acceptedCurricula = [
  "General Paediatrics",
  "Paediatric Sub-specialties",
  "Paediatric Surgery",
  "Emergency Paediatrics",
  "Adolescent Medicine",
  "Community-based Paediatrics",
] as const

const optionKeySchema = z.enum(["A", "B", "C", "D", "E"])
const curriculumRepairSchema = z.enum(acceptedCurricula)
const difficultyRepairSchema = z.enum(["Basic", "Intermediate", "Hard"]).nullable()

const evidenceSourceSchema = z.object({
  title: z.string().min(1),
  url: z.string().min(1),
  organization: z.string().min(1),
  sourceType: z.enum([
    "australian_guideline",
    "australian_health",
    "australian_specialty",
    "international_guideline",
    "other_reputable",
  ]),
  supports: z.string().min(1),
})

const repairedOptionSchema = z.object({
  key: optionKeySchema,
  text: z.string().min(1),
  isCorrect: z.boolean(),
})

const repairedOptionExplanationsSchema = z.object({
  A: z.string().min(1),
  B: z.string().min(1),
  C: z.string().min(1),
  D: z.string().min(1),
  E: z.string().min(1),
})

const repairOutputSchema = z
  .object({
    repairStatus: z.enum(["repaired", "unrepairable"]),
    method: z.enum(["selected_existing_option", "normalized_existing_question", "rewritten_to_complete_sba"]),
    stem: z.string().nullable(),
    options: z.array(repairedOptionSchema).length(5).nullable(),
    explanation: z.string().nullable(),
    optionExplanations: repairedOptionExplanationsSchema.nullable(),
    rationale: z.string().nullable(),
    citations: z.array(evidenceSourceSchema),
    curriculum: curriculumRepairSchema.nullable(),
    tags: z.array(z.string().min(1)),
    difficulty: difficultyRepairSchema,
    ausScore: z.number().int().min(1).max(5).nullable(),
    confidence: z.number().min(0).max(1),
    notes: z.string().nullable(),
    unrepairableReason: z.string().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.repairStatus === "unrepairable") {
      if (!value.unrepairableReason?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["unrepairableReason"],
          message: "Unrepairable outputs must include a reason.",
        })
      }
      return
    }

    if (!value.stem?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["stem"], message: "Repaired output needs a stem." })
    }
    if (!value.options) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["options"], message: "Repaired output needs options." })
    } else {
      const keys = value.options.map((option) => option.key)
      const expectedKeys = optionKeySchema.options
      if (keys.some((key, index) => key !== expectedKeys[index])) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["options"],
          message: "Options must be ordered A-E.",
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
    }
    if (!value.explanation?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["explanation"],
        message: "Repaired output needs an explanation.",
      })
    }
    if (!value.optionExplanations) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["optionExplanations"],
        message: "Repaired output needs option explanations.",
      })
    }
    if (value.citations.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["citations"],
        message: "Repaired output needs at least one source.",
      })
    }
    if (!value.curriculum) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["curriculum"],
        message: "Repaired output needs a classified curriculum.",
      })
    }
    if (value.tags.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tags"], message: "Repaired output needs tags." })
    }
  })

type RepairOutput = z.infer<typeof repairOutputSchema>

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
      curriculum: string
      sourceCount: number
    }
  | {
      id: string
      status: "skipped_already_answerable"
    }
  | {
      id: string
      status: "unrepairable"
      reason: string
      confidence: number
      sourceCount: number
    }
  | {
      id: string
      status: "failed"
      error: string
    }

function toJson(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`
}

async function readJson<T>(filePath: string) {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T
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
      if (!Number.isInteger(parsed) || parsed <= 0) throw new Error("Invalid value for --limit")
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
      if (!isRetryableGenerationError(error) || attempt > defaultRetryLimit) throw error
      const backoffMs = Math.max(250, defaultRetryBaseDelayMs) * 2 ** (attempt - 1)
      const jitterMs = Math.floor(Math.random() * 300)
      await sleep(backoffMs + jitterMs)
    }
  }
}

function extractRefusal(response: Awaited<ReturnType<OpenAI["responses"]["parse"]>>) {
  const messages: string[] = []

  for (const item of response.output) {
    if (item.type !== "message") continue
    for (const content of item.content) {
      if (content.type === "refusal") messages.push(content.refusal)
    }
  }

  return messages.join("\n").trim()
}

function getOpenAIClient() {
  const provider = resolveGenerationProvider()
  if (provider !== "openai") {
    throw new Error("Published browse-only repair requires GENERATE_API_PROVIDER=openai because it uses OpenAI web search.")
  }

  return {
    provider,
    model: resolveGenerationModel(),
    client: new OpenAI({ apiKey: resolveGenerationApiKey() }),
  }
}

function stripMarkdown(value: string) {
  return value
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1")
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
}

function stripOptionTerminalPeriod(value: string) {
  return stripMarkdown(value).replace(/[.。]+$/u, "").trim()
}

function normalizeStem(value: string) {
  const stripped = stripMarkdown(value)
  return stripped.endsWith("?") ? stripped : `${stripped.replace(/[.:;]+$/u, "").trim()}?`
}

function normalizeOptionExplanations(value: NonNullable<RepairOutput["optionExplanations"]>) {
  return Object.fromEntries(
    optionKeySchema.options.map((key) => [key, stripMarkdown(value[key])]),
  ) as Record<string, string>
}

function normalizeTags(rawTags: string[], curriculum: (typeof acceptedCurricula)[number]) {
  const curriculumTag = normalizeTagSlug(`cah-exam-blueprint/cah-kat/${curriculum}`)
  const tags = rawTags
    .map((tag) => normalizeTagSlug(tag))
    .filter(Boolean)
    .filter((tag) => !tag.startsWith("published-answerability-repair/"))
  return Array.from(new Set(["cah-exam-blueprint/cah-kat", curriculumTag, ...tags])).sort((left, right) =>
    left.localeCompare(right),
  )
}

function toQuestionCitations(sources: RepairOutput["citations"]): Question["citations"] {
  return sources.map((source) => ({
    type: "external" as const,
    source: source.organization,
    url: new URL(source.url).toString(),
    title: source.title,
  }))
}

function validateLearnerFacingText(question: Question) {
  const bannedPatterns = [
    /\bsource pack\b/i,
    /\bprovided excerpts?\b/i,
    /\bprovided notes\b/i,
    /\baccording to the notes\b/i,
    /\bsource material\b/i,
    /\bstrict_internal\b/i,
    /\bthis batch\b|\bthe batch\b|\bbatch outcome\b|\bwithin this batch\b/i,
    /\bdraft writer\b/i,
    /\bquestion-bank style\b/i,
    /\bquality assurance\b/i,
    /\bpublication governance\b/i,
    /\bcitation governance\b/i,
  ]
  const text = [
    question.stem,
    question.explanation ?? "",
    question.rationale ?? "",
    ...question.options.map((option) => option.text),
    ...Object.values(question.optionExplanations ?? {}),
  ].join("\n")
  const matched = bannedPatterns.find((pattern) => pattern.test(text))
  if (matched) throw new Error(`Learner-facing text still contains forbidden wording: ${matched}`)
}

function assertPublishableRepair(question: Question) {
  if (question.status !== "published") throw new Error(`Expected published status but found ${question.status}`)
  if (question.questionType !== "SBA") throw new Error(`Expected SBA question type but found ${question.questionType}`)
  if (question.curriculum === "Unclassified") throw new Error("Curriculum must not be Unclassified")
  if (question.options.length !== 5) throw new Error(`Expected 5 options but found ${question.options.length}`)
  if (question.options.some((option, index) => option.key !== optionKeySchema.options[index])) {
    throw new Error("Options must be ordered A-E")
  }
  if (!isQuestionAnswerable(question)) throw new Error("Question is still not answerable")
  if (!question.explanation?.trim()) throw new Error("Missing explanation")
  if (question.citations.length === 0) throw new Error("Missing citations")
  if (question.tags.length === 0) throw new Error("Missing tags")
  for (const key of optionKeySchema.options) {
    if (!question.optionExplanations?.[key]?.trim()) throw new Error(`Missing option explanation for ${key}`)
  }
  validateLearnerFacingText(question)
}

function buildPrompt(question: Question) {
  const currentOptions = question.options.map((option) => ({
    key: option.key,
    text: option.text,
    isCorrect: option.isCorrect,
  }))
  const source = question.source ?? {}

  return {
    system: [
      "You repair incomplete Australian paediatrics single-best-answer revision questions.",
      "You must search the web before repairing the item.",
      "Prefer Australian paediatric sources first: Royal Children's Hospital Melbourne Clinical Practice Guidelines, Australian Immunisation Handbook, ASCIA, state health guidance, or other Australian specialty guidance.",
      "Use international reputable guidance only if Australian sources do not answer the clinical point.",
      "The repaired item is education-only and must be clinically safe, evidence-aligned, and learner-facing.",
      "Do not mention web searching, sources, evidence gathering, old exam imports, or the repair process in learner-facing fields.",
      "If the item is a low-information fragment, repair it only when a safe clinically relevant interpretation is possible; otherwise mark it unrepairable.",
      "Every repaired item must have exactly five options A-E, exactly one best answer, a complete explanation, option-specific explanations, Australian-first citations where possible, curriculum, and tags.",
      "Do not invent URLs. Cite only sources you found with web search.",
    ].join(" "),
    user: [
      "Repair this published CAH QBank browse-only question so it becomes practice-ready.",
      "",
      `Question id: ${question.id}`,
      `Current curriculum: ${question.curriculum}`,
      `Current tags: ${JSON.stringify(question.tags)}`,
      `Current source file metadata: ${String((source as Record<string, unknown>).file ?? "")}`,
      `Current stem:\n${question.stem}`,
      `Current options:\n${JSON.stringify(currentOptions, null, 2)}`,
      "",
      "Requirements:",
      "- If existing options are usable and exactly one is best, preserve the clinical concept and select the correct existing option.",
      "- If the stem/options are malformed, rewrite into a complete clinically relevant SBA using the safest interpretation.",
      "- If fewer/more than five options are present, normalize to exactly five A-E options.",
      "- Use plain text only, no markdown.",
      "- Option text must not end with a full stop.",
      "- Return a classified curriculum from the allowed list, not Unclassified.",
      "- Include source URLs and titles that support the chosen correct answer.",
      "- Set confidence lower for fragment repairs or uncertain interpretations.",
    ].join("\n"),
  }
}

async function generateRepair(task: RepairTask, generation: ReturnType<typeof getOpenAIClient>) {
  const prompt = buildPrompt(task.question)

  const response = await withGenerationRetries(() =>
    generation.client.responses.parse({
      model: generation.model,
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
      tools: [
        {
          type: "web_search_preview",
          search_context_size: "medium",
          user_location: {
            type: "approximate",
            country: "AU",
            timezone: "Australia/Sydney",
          },
        },
      ],
      include: ["web_search_call.action.sources"],
      text: {
        format: zodTextFormat(repairOutputSchema, "published_question_repair"),
      },
    }),
  )

  if (response.output_parsed) return repairOutputSchema.parse(response.output_parsed)

  const refusal = extractRefusal(response)
  if (refusal) throw new Error(`Model refusal: ${refusal}`)
  throw new Error("Model returned no parseable repair output.")
}

function applyRepair(question: Question, output: RepairOutput, generation: ReturnType<typeof getOpenAIClient>) {
  if (output.repairStatus === "unrepairable") return null
  if (!output.stem || !output.options || !output.explanation || !output.optionExplanations || !output.curriculum) {
    throw new Error("Repair output was marked repaired but missing required fields.")
  }

  const repairedAt = new Date().toISOString()
  const normalizedOptions = output.options.map((option, index) => ({
    key: optionKeySchema.options[index],
    text: stripOptionTerminalPeriod(option.text),
    isCorrect: option.isCorrect,
  }))

  const updated = questionSchema.parse({
    ...question,
    stem: normalizeStem(output.stem),
    questionType: "SBA",
    options: normalizedOptions,
    explanation: stripMarkdown(output.explanation),
    rationale: output.rationale?.trim() ? stripMarkdown(output.rationale) : question.rationale ?? null,
    optionExplanations: normalizeOptionExplanations(output.optionExplanations),
    citations: toQuestionCitations(output.citations),
    tags: normalizeTags(output.tags, output.curriculum),
    curriculum: output.curriculum,
    difficulty: output.difficulty ?? question.difficulty ?? null,
    ausScore: output.ausScore ?? question.ausScore ?? null,
    source: {
      ...(question.source ?? {}),
      answerRecovery: {
        repairedAt,
        provider: generation.provider,
        model: generation.model,
        method: output.method,
        confidence: output.confidence,
        evidenceSources: output.citations,
        notes: output.notes,
        preRepair: {
          stem: question.stem,
          options: question.options,
          explanation: question.explanation,
          citations: question.citations,
          tags: question.tags,
          curriculum: question.curriculum,
          rationale: question.rationale,
          optionExplanations: question.optionExplanations,
        },
      },
    },
  })

  assertPublishableRepair(updated)
  return updated
}

async function repairQuestion(task: RepairTask, generation: ReturnType<typeof getOpenAIClient>): Promise<RepairResult> {
  if (isQuestionAnswerable(task.question)) return { id: task.question.id, status: "skipped_already_answerable" }

  const output = await generateRepair(task, generation)
  if (output.repairStatus === "unrepairable") {
    return {
      id: task.question.id,
      status: "unrepairable",
      reason: output.unrepairableReason ?? "No reason provided.",
      confidence: output.confidence,
      sourceCount: output.citations.length,
    }
  }

  const updated = applyRepair(task.question, output, generation)
  if (!updated) throw new Error("Repair output unexpectedly produced no updated question.")
  await fs.writeFile(task.filePath, toJson(updated), "utf8")

  return {
    id: updated.id,
    status: "repaired",
    method: output.method,
    confidence: output.confidence,
    curriculum: updated.curriculum,
    sourceCount: updated.citations.length,
  }
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length)
  let cursor = 0

  async function runWorker() {
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

async function collectTasks(args: ScriptArgs) {
  const entries = (await fs.readdir(questionsDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))

  const tasks: RepairTask[] = []
  for (const name of entries) {
    const filePath = path.join(questionsDir, name)
    const question = questionSchema.parse(await readJson<unknown>(filePath))
    if (question.status !== "published") continue
    if (args.ids && !args.ids.has(question.id)) continue
    if (isQuestionAnswerable(question)) continue
    tasks.push({ question, filePath })
    if (args.limit !== null && tasks.length >= args.limit) break
  }
  return tasks
}

async function main() {
  loadEnvironment()
  const args = parseArgs(process.argv.slice(2))
  const tasks = await collectTasks(args)
  const generation = getOpenAIClient()

  await fs.mkdir(reportDir, { recursive: true })
  await fs.writeFile(
    path.join(reportDir, "manifest.json"),
    toJson({
      generatedAt: new Date().toISOString(),
      targetCount: tasks.length,
      ids: tasks.map((task) => task.question.id),
    }),
    "utf8",
  )

  const results = await mapWithConcurrency(tasks, defaultConcurrency, async (task, index) => {
    try {
      const result = await repairQuestion(task, generation)
      if ((index + 1) % 5 === 0 || index === tasks.length - 1) {
        console.log(JSON.stringify({ progress: index + 1, total: tasks.length, id: task.question.id, status: result.status }))
      }
      return result
    } catch (error) {
      const failure: RepairResult = {
        id: task.question.id,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      }
      console.error(JSON.stringify(failure))
      if ((index + 1) % 5 === 0 || index === tasks.length - 1) {
        console.log(JSON.stringify({ progress: index + 1, total: tasks.length, id: task.question.id, status: "failed" }))
      }
      return failure
    }
  })

  const summary = {
    repairedAt: new Date().toISOString(),
    targetCount: tasks.length,
    repairedCount: results.filter((result) => result.status === "repaired").length,
    skippedAlreadyAnswerableCount: results.filter((result) => result.status === "skipped_already_answerable").length,
    unrepairableCount: results.filter((result) => result.status === "unrepairable").length,
    failedCount: results.filter((result) => result.status === "failed").length,
    methodCounts: results.reduce<Record<string, number>>((acc, result) => {
      if (result.status === "repaired") acc[result.method] = (acc[result.method] ?? 0) + 1
      return acc
    }, {}),
    confidence: {
      min:
        results.filter((result) => result.status === "repaired").length === 0
          ? null
          : Math.min(...results.filter((result): result is Extract<RepairResult, { status: "repaired" }> => result.status === "repaired").map((result) => result.confidence)),
      max:
        results.filter((result) => result.status === "repaired").length === 0
          ? null
          : Math.max(...results.filter((result): result is Extract<RepairResult, { status: "repaired" }> => result.status === "repaired").map((result) => result.confidence)),
    },
    results,
  }

  await fs.writeFile(resultsPath, toJson(results), "utf8")
  await fs.writeFile(latestReportPath, toJson(summary), "utf8")
  console.log(toJson(summary))

  if (summary.failedCount > 0 || summary.unrepairableCount > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
