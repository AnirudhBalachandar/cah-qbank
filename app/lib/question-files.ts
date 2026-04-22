import fs from "node:fs/promises"
import path from "node:path"

import { Question, findCurriculumByLabel, humanizeTagSlug, questionSchema } from "@cah/domain"

const repoRoot = path.resolve(process.cwd(), "..")
const questionsDir = path.join(repoRoot, "questions")
const draftsDir = path.join(repoRoot, "drafts")

export type TagDescriptor = {
  slug: string
  name: string
  kind: "curriculum" | "topic" | "meta"
  parentSlug: string | null
}

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

function inferTagKind(slug: string): TagDescriptor["kind"] {
  if (slug === "notebooklm") {
    return "meta"
  }

  const label = humanizeTagSlug(slug)
  if (findCurriculumByLabel(label) && label !== "Unclassified") {
    return "curriculum"
  }

  return "topic"
}

export function collectTagDescriptors(questions: Question[]) {
  const descriptors = new Map<string, TagDescriptor>()

  for (const question of questions) {
    for (const slug of question.tags) {
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
