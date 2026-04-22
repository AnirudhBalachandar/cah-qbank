import fs from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"

import {
  Question,
  findCurriculumByLabel,
  humanizeTagSlug,
  questionSchema,
  slugifyTagSegment,
} from "@cah/domain"

const repoRoot = process.cwd()
const questionsDir = path.join(repoRoot, "questions")
const draftsDir = path.join(repoRoot, "drafts")
const backupCandidates = [
  process.env.CAH_BACKUP_DIR,
  path.resolve(repoRoot, "backups", "qbank-state", "2026-04-22"),
].filter((candidate): candidate is string => Boolean(candidate))

type LegacyQuestion = {
  id: string
  stem: string
  type: string
  options: Array<{ key: string; text: string }>
  correctKey: string | null
  explanation: string | null
  rationale: string | null
  citations: Array<Record<string, unknown>> | null
  whyOthersWrong: Record<string, string> | null
  moduleCode: string | null
  difficulty: "Basic" | "Intermediate" | "Hard" | null
  ausScore: number | null
  createdBy: "ai" | "import" | "manual"
  createdAt: string
  sourceFingerprint: string
  source: Record<string, unknown>
  status: "published" | "draft"
}

type LegacyTag = {
  id: string
  name: string
  parentId: string | null
}

type LegacyQuestionTagLink = {
  questionId: string
  tagId: string
}

function toJsonDiff(input: unknown) {
  return JSON.stringify(input, null, 2)
}

async function loadJson<T>(filePath: string) {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T
}

function assertNever(message: string): never {
  throw new Error(message)
}

function buildTagSlugs(tags: LegacyTag[]) {
  const tagById = new Map(tags.map((tag) => [tag.id, tag]))
  const slugById = new Map<string, string>()

  function resolveTagSlug(tagId: string): string {
    const cached = slugById.get(tagId)
    if (cached) return cached

    const tag = tagById.get(tagId)
    if (!tag) {
      return assertNever(`Missing tag ${tagId}`)
    }

    const segment = slugifyTagSegment(tag.name)
    const slug = tag.parentId ? `${resolveTagSlug(tag.parentId)}/${segment}` : segment
    slugById.set(tagId, slug)
    return slug
  }

  for (const tag of tags) {
    resolveTagSlug(tag.id)
  }

  return { tagById, slugById }
}

function normalizeCitations(citations: LegacyQuestion["citations"]) {
  return (citations ?? []).map((citation) => ({
    type:
      citation.type === "internal" || citation.type === "external"
        ? citation.type
        : ("internal" as const),
    ...(typeof citation.source === "string" ? { source: citation.source } : {}),
    ...(typeof citation.title === "string" ? { title: citation.title } : {}),
    ...(typeof citation.url === "string" ? { url: citation.url } : {}),
    ...(typeof citation.page === "number" ? { page: citation.page } : {}),
  }))
}

function resolveBackupRoot() {
  const match = backupCandidates.find((candidate) =>
    ["questions.json", "tags.json", "question-tag-links.json"].every((fileName) =>
      existsSync(path.join(candidate, fileName)),
    ),
  )

  if (match) {
    return match
  }

  throw new Error(
    `Could not locate the backup snapshot. Set CAH_BACKUP_DIR to one of the expected snapshot folders.\nChecked:\n${backupCandidates.join("\n")}`,
  )
}

function resolveCurriculum(params: {
  tagSlugs: string[]
  question: LegacyQuestion
}) {
  const matchedFromTags = Array.from(
    new Set(
      params.tagSlugs
        .map((slug) => humanizeTagSlug(slug))
        .map((value) => findCurriculumByLabel(value))
        .filter((value): value is Question["curriculum"] => Boolean(value) && value !== "Unclassified"),
    ),
  )

  if (matchedFromTags.length === 1) {
    return matchedFromTags[0]
  }

  const originalTags = Array.isArray(params.question.source?.originalTags)
    ? params.question.source.originalTags.filter((value): value is string => typeof value === "string")
    : []
  const matchedFromSource = originalTags
    .map((tag) => findCurriculumByLabel(tag))
    .find((value): value is Question["curriculum"] => Boolean(value) && value !== "Unclassified")

  if (matchedFromSource) {
    return matchedFromSource
  }

  return "Unclassified"
}

function mapLegacyQuestion(params: {
  question: LegacyQuestion
  tagSlugs: string[]
}) {
  const { question, tagSlugs } = params
  const correctKey = question.correctKey?.trim().toUpperCase() ?? null

  const mapped: Question = {
    id: question.id,
    stem: question.stem,
    questionType: "SBA",
    options: (question.options ?? []).map((option) => ({
      key: option.key,
      text: option.text,
      isCorrect: correctKey ? option.key.trim().toUpperCase() === correctKey : null,
    })),
    explanation: question.explanation ?? null,
    citations: normalizeCitations(question.citations),
    tags: tagSlugs,
    curriculum: resolveCurriculum({ tagSlugs, question }),
    status: question.status,
    createdBy: question.createdBy,
    createdAt: question.createdAt,
    sourceFingerprint: question.sourceFingerprint,
    rationale: question.rationale ?? null,
    optionExplanations: question.whyOthersWrong ?? {},
    moduleCode: question.moduleCode ?? null,
    difficulty: question.difficulty ?? null,
    ausScore: question.ausScore ?? null,
    source: question.source ?? {},
  }

  const parsed = questionSchema.safeParse(mapped)
  if (!parsed.success) {
    throw new Error(
      `Question ${question.id} failed validation:\n${toJsonDiff(parsed.error.flatten())}\nMapped:\n${toJsonDiff(
        mapped,
      )}`,
    )
  }

  return parsed.data
}

async function writeQuestionFile(question: Question) {
  const targetDir = question.status === "published" ? questionsDir : draftsDir
  await fs.mkdir(targetDir, { recursive: true })
  const filePath = path.join(targetDir, `${question.id}.json`)
  await fs.writeFile(filePath, `${toJsonDiff(question)}\n`, "utf8")
}

async function main() {
  const backupRoot = resolveBackupRoot()
  const [questions, tags, links] = await Promise.all([
    loadJson<LegacyQuestion[]>(path.join(backupRoot, "questions.json")),
    loadJson<LegacyTag[]>(path.join(backupRoot, "tags.json")),
    loadJson<LegacyQuestionTagLink[]>(path.join(backupRoot, "question-tag-links.json")),
  ])

  await fs.rm(questionsDir, { recursive: true, force: true })
  await fs.rm(draftsDir, { recursive: true, force: true })

  const { slugById } = buildTagSlugs(tags)
  const linksByQuestion = new Map<string, string[]>()
  for (const link of links) {
    const slug = slugById.get(link.tagId)
    if (!slug) continue
    const current = linksByQuestion.get(link.questionId) ?? []
    current.push(slug)
    linksByQuestion.set(link.questionId, current)
  }

  let publishedCount = 0
  let draftCount = 0

  for (const question of questions) {
    const tagSlugs = Array.from(new Set(linksByQuestion.get(question.id) ?? []))
    const mapped = mapLegacyQuestion({ question, tagSlugs })
    await writeQuestionFile(mapped)
    if (mapped.status === "published") publishedCount += 1
    if (mapped.status === "draft") draftCount += 1
  }

  if (publishedCount !== 1107 || draftCount !== 976) {
    throw new Error(`Unexpected output counts. published=${publishedCount} draft=${draftCount}`)
  }

  console.log(
    JSON.stringify(
      {
        backupRoot,
        publishedCount,
        draftCount,
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
