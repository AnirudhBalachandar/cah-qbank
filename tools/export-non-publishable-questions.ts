import fs from "node:fs/promises"
import path from "node:path"

import { isQuestionAnswerable, questionSchema, type Question } from "@cah/domain"

const repoRoot = process.cwd()
const draftsDir = path.join(repoRoot, "drafts")
const archivedStyleBlockedDir = path.join(draftsDir, "_archived_style_blocked")
const outDir = path.join(repoRoot, "reports", "non-publishable-question-export")
const outPath = path.join(outDir, "non-publishable-questions-for-chatgpt-2026-04-25.json")

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

const archivedStyleBlockedReasons = new Map<string, string>([
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

type NonPublishableQuestionExportItem = {
  id: string
  sourcePath: string
  currentLocation: "drafts" | "drafts/_archived_style_blocked"
  nonPublishableReasons: string[]
  chatgptTask: string
  originalQuestion: Question
  fixedQuestion: null
}

function toJson(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`
}

async function listJsonFiles(dirPath: string) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(dirPath, entry.name))
      .sort((left, right) => left.localeCompare(right))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }
}

async function readQuestion(filePath: string) {
  const raw = JSON.parse(await fs.readFile(filePath, "utf8"))
  return questionSchema.parse(raw)
}

function questionTextForStyleScan(question: Question) {
  return [
    question.stem,
    question.explanation ?? "",
    question.rationale ?? "",
    ...question.options.map((option) => option.text),
    ...Object.values(question.optionExplanations ?? {}),
  ].join("\n")
}

function deriveNonPublishableReasons(question: Question) {
  const reasons: string[] = []

  if (!isQuestionAnswerable(question)) reasons.push("not_answerable")
  if (!question.explanation?.trim()) reasons.push("missing_explanation")
  if (question.citations.length === 0) reasons.push("missing_citations")
  if (question.tags.length === 0) reasons.push("missing_tags")
  if (question.curriculum === "Unclassified") reasons.push("unclassified_curriculum")
  if (question.options.length !== 5) reasons.push("not_five_options")
  if (!question.stem.trim().endsWith("?")) reasons.push("stem_does_not_end_with_question_mark")

  const optionKeys = question.options.map((option) => option.key)
  const missingOptionExplanations = optionKeys.filter((key) => !question.optionExplanations?.[key]?.trim())
  if (missingOptionExplanations.length > 0) {
    reasons.push(`missing_option_explanations:${missingOptionExplanations.join(",")}`)
  }

  const optionsWithTerminalPeriods = question.options
    .filter((option) => option.text.trim().endsWith("."))
    .map((option) => option.key)
  if (optionsWithTerminalPeriods.length > 0) {
    reasons.push(`option_text_has_terminal_period:${optionsWithTerminalPeriods.join(",")}`)
  }

  const styleText = questionTextForStyleScan(question)
  if (bannedLearnerFacingPhrases.some((pattern) => pattern.test(styleText))) {
    reasons.push("learner_facing_source_or_drafting_process_language")
  }

  return reasons
}

function itemFor({
  question,
  filePath,
  currentLocation,
  extraReasons,
}: {
  question: Question
  filePath: string
  currentLocation: "drafts" | "drafts/_archived_style_blocked"
  extraReasons: string[]
}): NonPublishableQuestionExportItem {
  const nonPublishableReasons = Array.from(new Set([...extraReasons, ...deriveNonPublishableReasons(question)]))
  return {
    id: question.id,
    sourcePath: path.relative(repoRoot, filePath),
    currentLocation,
    nonPublishableReasons,
    chatgptTask:
      "Create a publishable CAH QBank single-best-answer clinical question. Preserve the id, status, citations, tags, curriculum, sourceFingerprint, createdAt, and createdBy unless a field is impossible to preserve. Return the corrected question in fixedQuestion using the same JSON shape as originalQuestion. The fixed question must have exactly five options A-E, exactly one correct option, a learner-facing clinical stem ending in a question mark, non-empty explanation, optionExplanations for A-E, no source/drafting/batch/process wording, no markdown, and no terminal periods in option text.",
    originalQuestion: question,
    fixedQuestion: null,
  }
}

async function main() {
  const activeDraftFiles = await listJsonFiles(draftsDir)
  const archivedFiles = await listJsonFiles(archivedStyleBlockedDir)
  const items: NonPublishableQuestionExportItem[] = []
  let activeDraftsReadyForPublication = 0

  for (const filePath of activeDraftFiles) {
    const question = await readQuestion(filePath)
    const reasons = deriveNonPublishableReasons(question)
    if (reasons.length === 0) {
      activeDraftsReadyForPublication += 1
      continue
    }

    items.push(
      itemFor({
        question,
        filePath,
        currentLocation: "drafts",
        extraReasons: [],
      }),
    )
  }

  for (const filePath of archivedFiles) {
    const question = await readQuestion(filePath)
    items.push(
      itemFor({
        question,
        filePath,
        currentLocation: "drafts/_archived_style_blocked",
        extraReasons: [
          "archived_style_blocked",
          archivedStyleBlockedReasons.get(question.id) ?? "Archived style-blocked draft.",
        ],
      }),
    )
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    outputPath: path.relative(repoRoot, outPath),
    activeDraftsScanned: activeDraftFiles.length,
    activeDraftsReadyForPublication,
    activeDraftsNonPublishable: items.filter((item) => item.currentLocation === "drafts").length,
    archivedStyleBlockedIncluded: items.filter((item) => item.currentLocation === "drafts/_archived_style_blocked").length,
    totalExportedForChatgptRepair: items.length,
    reasonCounts: items.reduce<Record<string, number>>((acc, item) => {
      for (const reason of item.nonPublishableReasons) {
        acc[reason] = (acc[reason] ?? 0) + 1
      }
      return acc
    }, {}),
  }

  const exportPayload = {
    schemaVersion: 1,
    purpose:
      "Handoff file for repairing CAH QBank question JSON records that are not currently in the active publishable-ready draft set.",
    instructionsForChatGPT:
      "Work through items one at a time. For each item, fill fixedQuestion with a corrected complete question JSON object. Do not remove items. Do not change originalQuestion. Keep fixedQuestion null for any item that should remain excluded instead of repaired.",
    publishableReadyDefinition: [
      "Schema-valid CAH QBank question JSON.",
      "Exactly five options with keys A-E.",
      "Exactly one option has isCorrect true.",
      "Clinical learner-facing stem ending in a question mark.",
      "Non-empty explanation.",
      "optionExplanations includes non-empty entries for A-E.",
      "Non-empty citations and tags.",
      "Curriculum is not Unclassified.",
      "No source, drafting, batch, evidence-governance, or process wording in learner-facing fields.",
      "No markdown formatting in learner-facing fields.",
      "No terminal periods in option text.",
    ],
    summary,
    questions: items,
  }

  await fs.mkdir(outDir, { recursive: true })
  await fs.writeFile(outPath, toJson(exportPayload), "utf8")
  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
