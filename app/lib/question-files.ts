import fs from "node:fs/promises"
import path from "node:path"

import { Question, humanizeTagSlug, questionSchema } from "@cah/domain"

const repoRoot = path.resolve(process.cwd(), "..")
const questionsDir = path.join(repoRoot, "questions")

export type TagDescriptor = {
  slug: string
  name: string
  kind: "curriculum" | "topic" | "meta"
  parentSlug: string | null
}

async function listQuestionFiles() {
  const entries = await fs.readdir(questionsDir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(questionsDir, entry.name))
    .sort((a, b) => a.localeCompare(b))
}

export async function loadPublishedQuestions() {
  const files = await listQuestionFiles()
  const questions: Question[] = []

  for (const filePath of files) {
    const raw = JSON.parse(await fs.readFile(filePath, "utf8"))
    const parsed = questionSchema.parse(raw)
    if (parsed.status === "published") {
      questions.push(parsed)
    }
  }

  return questions
}

function inferTagKind(slug: string): TagDescriptor["kind"] {
  if (slug === "notebooklm") {
    return "meta"
  }

  const label = humanizeTagSlug(slug)
  if (
    [
      "General Paediatrics",
      "Paediatric Sub Specialties",
      "Paediatric Surgery",
      "Emergency Paediatrics",
      "Adolescent Medicine",
      "Community Based Paediatrics",
    ].includes(label)
  ) {
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
