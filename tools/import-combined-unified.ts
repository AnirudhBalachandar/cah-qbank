import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

import { normalizeTagSlug, questionSchema, type Question, type QuestionOption } from "@cah/domain"

const repoRoot = process.cwd()
const draftsDir = path.join(repoRoot, "drafts")
const manifestDir = path.join(draftsDir, "_imports", "combined-canvas-notebooklm-v1")
const manifestPath = path.join(manifestDir, "manifest.json")

const defaultInputPath =
  "/Users/anirudhbalachandar/canvas_practice_quiz_extractor/combined_canvas_notebooklm_unified_export/combined_canvas_notebooklm_questions.json"
const importNamespace = "combined-canvas-notebooklm-v1"
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

type CombinedExport = {
  exported_at?: string
  total_quiz_count?: number
  total_question_count?: number
  total_option_row_count?: number
  sources?: unknown
  questions: CombinedQuestion[]
}

type CombinedQuestion = {
  combined_question_id: string
  source_system: string
  source_collection: string
  source_quiz_identifier: string
  source_question_identifier: string
  quiz_title: string
  quiz_question_count: number | null
  question_index: number
  question_type: string
  question_text: string
  question_text_html: string
  stimulus_text: string
  instructions: string
  hint: string
  answer_field: string
  label: string
  text_field: string
  points_possible: number | null
  option_count: number | null
  correct_option_count: number | null
  correct_option_texts: string[]
  options: CombinedOption[]
  figure_count: number | null
  figure_refs: unknown[]
  table_count: number | null
  table_refs: unknown[]
  question_assets: unknown[]
  source_mode: string
  source_url: string
  started_via: string
  source_file: string
  source_zip: string
  quiz_dir: string
  quiz_markdown_path: string
  metadata_path: string
  raw_dom_path: string
}

type CombinedOption = {
  option_index: number
  label: string
  text: string
  text_html: string
  is_correct: boolean | null
  rationale: string
  is_selected_if_visible: boolean | null
  asset_refs: unknown[]
}

type ImportManifest = {
  importKind: string
  inputPath: string
  importedAt: string
  questionCount: number
  sourceCounts: Record<string, number>
  syntheticOptionQuestions: number
  ids: string[]
}

function toJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function hashBuffer(input: string) {
  return createHash("sha1").update(importNamespace).update("\u0000").update(input).digest()
}

function deterministicUuid(input: string) {
  const bytes = Uint8Array.from(hashBuffer(input).subarray(0, 16))
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Buffer.from(bytes).toString("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

function buildSourceFingerprint(input: string) {
  return `combined-import-${hashBuffer(input).toString("hex").slice(0, 24)}`
}

function trimToNull(value: string | null | undefined) {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function normalizeWhitespace(value: string) {
  return value.replace(/\r\n/g, "\n").trim()
}

function buildSequentialKey(index: number) {
  if (index < alphabet.length) return alphabet[index] ?? `Option ${index + 1}`
  return `Option ${index + 1}`
}

function buildOptionKey(index: number) {
  return buildSequentialKey(index)
}

function buildOptions(question: CombinedQuestion) {
  if (question.options.length >= 2) {
    const normalizedOptions = question.options.map((option, index) => ({
      key: buildOptionKey(index),
      text: trimToNull(option.text) ?? trimToNull(option.text_html) ?? `[Imported option ${index + 1}]`,
      isCorrect: typeof option.is_correct === "boolean" ? option.is_correct : null,
      rationale: trimToNull(option.rationale),
    }))

    return {
      options: normalizedOptions satisfies Array<QuestionOption & { rationale: string | null }>,
      usedSyntheticOptions: false,
    }
  }

  const questionType = trimToNull(question.question_type) ?? "Unspecified"
  return {
    options: [
      {
        key: "A",
        text: `Imported ${questionType} content preserved in the stem and source metadata.`,
        isCorrect: null,
        rationale: null,
      },
      {
        key: "B",
        text: "Manual conversion is required before this item can be used as a standard SBA question.",
        isCorrect: null,
        rationale: null,
      },
    ] satisfies Array<QuestionOption & { rationale: string | null }>,
    usedSyntheticOptions: true,
  }
}

function buildOptionExplanations(options: Array<QuestionOption & { rationale: string | null }>) {
  return Object.fromEntries(
    options
      .filter((option): option is QuestionOption & { rationale: string } => typeof option.rationale === "string")
      .map((option) => [option.key, option.rationale]),
  )
}

function buildExplanation(question: CombinedQuestion, options: Array<QuestionOption & { rationale: string | null }>) {
  const correctRationales = options
    .filter((option) => option.isCorrect === true && typeof option.rationale === "string")
    .map((option) => option.rationale)

  if (correctRationales.length > 0) {
    return correctRationales.join("\n\n")
  }

  const correctTexts = question.correct_option_texts.map((value) => value.trim()).filter(Boolean)
  if (correctTexts.length > 0) {
    return `Correct option text in imported source: ${correctTexts.join(" | ")}`
  }

  return null
}

function buildStem(question: CombinedQuestion, usedSyntheticOptions: boolean) {
  const blocks: string[] = []
  const normalizedType = trimToNull(question.question_type)
  const normalizedStimulus = trimToNull(question.stimulus_text)
  const normalizedQuestionText = trimToNull(question.question_text)
  const normalizedInstructions = trimToNull(question.instructions)
  const normalizedAnswerField = trimToNull(question.answer_field)
  const normalizedLabel = trimToNull(question.label)
  const normalizedTextField = trimToNull(question.text_field)

  if (normalizedType && normalizedType.toLowerCase() !== "multiple choice") {
    blocks.push(`Imported source question type: ${normalizedType}`)
  }
  if (normalizedStimulus) {
    blocks.push(`Stimulus:\n${normalizeWhitespace(normalizedStimulus)}`)
  }
  if (normalizedQuestionText) {
    blocks.push(normalizeWhitespace(normalizedQuestionText))
  }
  if (normalizedInstructions) {
    blocks.push(`Instructions:\n${normalizeWhitespace(normalizedInstructions)}`)
  }
  if (normalizedAnswerField) {
    blocks.push(`Answer field:\n${normalizeWhitespace(normalizedAnswerField)}`)
  }
  if (normalizedLabel) {
    blocks.push(`Source label: ${normalizedLabel}`)
  }
  if (normalizedTextField) {
    blocks.push(`Supplementary text:\n${normalizeWhitespace(normalizedTextField)}`)
  }
  if (usedSyntheticOptions) {
    blocks.push("Imported as a draft placeholder because the source question did not expose SBA-compatible answer options.")
  }

  const stem = blocks.join("\n\n").trim()
  if (!stem) {
    throw new Error(`Question ${question.combined_question_id} produced an empty stem.`)
  }
  return stem
}

function buildCitations(question: CombinedQuestion): Question["citations"] {
  const citations: Question["citations"] = []

  if (trimToNull(question.source_url)) {
    citations.push({
      type: "external",
      url: question.source_url,
      title: question.quiz_title,
    })
  }

  const fileSource = trimToNull(question.source_file)
  const zipSource = trimToNull(question.source_zip)
  const fileOrZip = fileSource ?? zipSource
  if (fileOrZip) {
    citations.push({
      type: "external",
      source: path.basename(fileOrZip),
      title: question.quiz_title,
    })
  }

  return citations
}

function buildTags(question: CombinedQuestion, usedSyntheticOptions: boolean) {
  const tags = [
    "combined-import",
    `combined-import/import-set/${importNamespace}`,
    `combined-import/source-system/${question.source_system}`,
    `combined-import/source-collection/${question.source_collection}`,
    `combined-import/quiz/${question.quiz_title}`,
    `combined-import/question-type/${trimToNull(question.question_type) ?? "unspecified"}`,
    question.source_system === "notebooklm" ? "notebooklm" : "canvas-practice-quiz",
    usedSyntheticOptions ? "combined-import/requires-manual-conversion" : null,
  ]

  return Array.from(
    new Set(
      tags
        .filter((value): value is string => Boolean(value))
        .map((value) => normalizeTagSlug(value))
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right))
}

function buildSource(question: CombinedQuestion, inputPath: string, usedSyntheticOptions: boolean) {
  return {
    importKind: "combined_canvas_notebooklm_unified",
    importNamespace,
    importedFrom: inputPath,
    sourceSystem: question.source_system,
    sourceCollection: question.source_collection,
    sourceQuizIdentifier: question.source_quiz_identifier,
    sourceQuestionIdentifier: question.source_question_identifier,
    quizTitle: question.quiz_title,
    quizQuestionCount: question.quiz_question_count,
    questionIndex: question.question_index,
    originalQuestionType: question.question_type,
    originalOptionCount: question.option_count,
    originalCorrectOptionCount: question.correct_option_count,
    originalCorrectOptionTexts: question.correct_option_texts,
    pointsPossible: question.points_possible,
    sourceMode: question.source_mode,
    sourceUrl: question.source_url,
    startedVia: question.started_via,
    sourceFile: question.source_file,
    sourceZip: question.source_zip,
    quizDir: question.quiz_dir,
    quizMarkdownPath: question.quiz_markdown_path,
    metadataPath: question.metadata_path,
    rawDomPath: question.raw_dom_path,
    questionTextHtml: question.question_text_html,
    stimulusText: question.stimulus_text,
    instructions: question.instructions,
    hint: question.hint,
    answerField: question.answer_field,
    label: question.label,
    textField: question.text_field,
    figureRefs: question.figure_refs,
    tableRefs: question.table_refs,
    questionAssets: question.question_assets,
    usedSyntheticOptions,
    combinedRecord: question,
  }
}

function buildQuestion(question: CombinedQuestion, inputPath: string, createdAt: string) {
  const { options, usedSyntheticOptions } = buildOptions(question)
  const draft: Question = {
    id: deterministicUuid(question.combined_question_id),
    stem: buildStem(question, usedSyntheticOptions),
    questionType: "SBA",
    options: options.map(({ rationale: _rationale, ...option }) => option),
    explanation: buildExplanation(question, options),
    citations: buildCitations(question),
    tags: buildTags(question, usedSyntheticOptions),
    curriculum: "Unclassified",
    status: "draft",
    createdBy: "import",
    createdAt,
    sourceFingerprint: buildSourceFingerprint(question.combined_question_id),
    rationale: trimToNull(question.hint),
    optionExplanations: buildOptionExplanations(options),
    moduleCode: null,
    difficulty: null,
    ausScore: null,
    source: buildSource(question, inputPath, usedSyntheticOptions),
  }

  return questionSchema.parse(draft)
}

async function readJson<T>(filePath: string) {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T
}

async function writeQuestionFile(question: Question) {
  const filePath = path.join(draftsDir, `${question.id}.json`)
  await fs.writeFile(filePath, `${toJson(question)}\n`, "utf8")
  return filePath
}

function parseArgs(argv: string[]) {
  let inputPath = process.env.CAH_IMPORT_INPUT ?? defaultInputPath

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg) continue
    if (arg === "--input") {
      const next = argv[index + 1]
      if (!next) {
        throw new Error("Missing value for --input")
      }
      inputPath = next
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return {
    inputPath: path.resolve(inputPath),
  }
}

async function loadPreviousManifest() {
  try {
    return await readJson<ImportManifest>(manifestPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null
    }
    throw error
  }
}

async function main() {
  const { inputPath } = parseArgs(process.argv.slice(2))
  const createdAt = new Date().toISOString()
  const payload = await readJson<CombinedExport>(inputPath)
  const previousManifest = await loadPreviousManifest()

  await fs.mkdir(draftsDir, { recursive: true })
  await fs.mkdir(manifestDir, { recursive: true })

  const importedIds: string[] = []
  const sourceCounts = new Map<string, number>()
  let syntheticOptionQuestions = 0

  for (const sourceQuestion of payload.questions) {
    const question = buildQuestion(sourceQuestion, inputPath, createdAt)
    await writeQuestionFile(question)
    importedIds.push(question.id)
    sourceCounts.set(sourceQuestion.source_system, (sourceCounts.get(sourceQuestion.source_system) ?? 0) + 1)
    if (question.tags.includes("combined-import/requires-manual-conversion")) {
      syntheticOptionQuestions += 1
    }
  }

  const currentIdSet = new Set(importedIds)
  for (const id of previousManifest?.ids ?? []) {
    if (currentIdSet.has(id)) continue
    await fs.rm(path.join(draftsDir, `${id}.json`), { force: true })
  }

  const manifest: ImportManifest = {
    importKind: "combined_canvas_notebooklm_unified",
    inputPath,
    importedAt: createdAt,
    questionCount: importedIds.length,
    sourceCounts: Object.fromEntries(Array.from(sourceCounts.entries()).sort((a, b) => a[0].localeCompare(b[0]))),
    syntheticOptionQuestions,
    ids: importedIds.sort((a, b) => a.localeCompare(b)),
  }

  await fs.writeFile(manifestPath, `${toJson(manifest)}\n`, "utf8")

  console.log(
    JSON.stringify(
      {
        inputPath,
        importedCount: importedIds.length,
        sourceCounts: manifest.sourceCounts,
        syntheticOptionQuestions,
        manifestPath,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
