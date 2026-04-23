import fs from "node:fs/promises"
import path from "node:path"

import { Question, findCurriculumByLabel, humanizeTagSlug, normalizeTagSlug, questionSchema } from "@cah/domain"

const repoRoot = path.resolve(process.cwd(), "..")
const questionsDir = path.join(repoRoot, "questions")
const draftsDir = path.join(repoRoot, "drafts")

export type TagDescriptor = {
  slug: string
  name: string
  kind: "curriculum" | "topic" | "meta"
  parentSlug: string | null
}

const blueprintNamespace = "cah-exam-blueprint"
const hiddenLearnerFacingTags = new Set([
  blueprintNamespace,
  `${blueprintNamespace}/cah-kat`,
  "notebooklm",
])

async function listQuestionFiles() {
  const directories = [questionsDir, draftsDir]
  const fileGroups = await Promise.all(
    directories.map(async (dirPath) => {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true })
        return entries
          .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
          .map((entry) => path.join(dirPath, entry.name))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return []
        }
        throw error
      }
    }),
  )

  return fileGroups.flat().sort((a, b) => a.localeCompare(b))
}

export async function loadAllQuestions() {
  const files = await listQuestionFiles()
  const questions: Question[] = []

  for (const filePath of files) {
    const raw = JSON.parse(await fs.readFile(filePath, "utf8"))
    const parsed = questionSchema.parse(raw)
    questions.push(parsed)
  }

  return questions
}

export async function loadPublishedQuestions() {
  return (await loadAllQuestions()).filter((question) => question.status === "published")
}

function curriculumSlugFor(curriculum: Question["curriculum"]) {
  if (curriculum === "Unclassified") {
    return null
  }
  return normalizeTagSlug(curriculum)
}

function curriculumForSlug(slug: string) {
  const curriculum = findCurriculumByLabel(humanizeTagSlug(slug))
  return curriculum === "Unclassified" ? null : curriculum
}

function isCurriculumSlug(slug: string) {
  return Boolean(curriculumForSlug(slug))
}

export function projectLearnerTagSlug(rawTag: string) {
  const slug = normalizeTagSlug(rawTag)
  if (!slug) {
    return null
  }
  if (hiddenLearnerFacingTags.has(slug)) {
    return null
  }

  const parts = slug.split("/").filter(Boolean)
  if (parts[0] === blueprintNamespace) {
    if (parts.length <= 2) {
      return null
    }
    return parts.slice(2).join("/") || null
  }

  return slug
}

export function projectLearnerTagSlugs(question: Pick<Question, "curriculum" | "tags">) {
  const slugs = new Set<string>()
  const curriculumSlug = curriculumSlugFor(question.curriculum)

  if (curriculumSlug) {
    slugs.add(curriculumSlug)
  }

  for (const rawTag of question.tags) {
    const projected = projectLearnerTagSlug(rawTag)
    if (!projected || isCurriculumSlug(projected)) {
      continue
    }
    slugs.add(projected)
  }

  return Array.from(slugs).sort((left, right) => left.localeCompare(right))
}

function inferTagKind(slug: string): TagDescriptor["kind"] {
  if (slug.startsWith(blueprintNamespace)) {
    return "meta"
  }

  if (curriculumForSlug(slug)) {
    return "curriculum"
  }

  return "topic"
}

export function collectTagDescriptors(questions: Question[]) {
  const descriptors = new Map<string, TagDescriptor>()

  for (const question of questions) {
    for (const slug of projectLearnerTagSlugs(question)) {
      const parts = slug.split("/").filter(Boolean)
      for (let index = 0; index < parts.length; index += 1) {
        const currentSlug = parts.slice(0, index + 1).join("/")
        if (descriptors.has(currentSlug)) continue

        descriptors.set(currentSlug, {
          slug: currentSlug,
          name: humanizeTagSlug(currentSlug),
          kind: inferTagKind(currentSlug),
          parentSlug: index === 0 ? null : parts.slice(0, index).join("/"),
        })
      }
    }
  }

  return Array.from(descriptors.values()).sort((a, b) => a.slug.localeCompare(b.slug))
}
