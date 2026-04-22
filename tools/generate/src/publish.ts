import fs from "node:fs/promises"
import path from "node:path"

import { questionSchema } from "@cah/domain"

export async function promoteDraft({
  repoRoot,
  id,
  reviewedBy = "local-admin",
}: {
  repoRoot: string
  id: string
  reviewedBy?: string
}) {
  const draftsDir = path.join(repoRoot, "drafts")
  const questionsDir = path.join(repoRoot, "questions")
  const draftPath = path.join(draftsDir, `${id}.json`)
  const publishedPath = path.join(questionsDir, `${id}.json`)

  const raw = JSON.parse(await fs.readFile(draftPath, "utf8"))
  const draft = questionSchema.parse(raw)

  if (draft.status !== "draft") {
    throw new Error(`Draft ${id} is already ${draft.status}`)
  }

  try {
    await fs.access(publishedPath)
    throw new Error(`Published question already exists: ${publishedPath}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error
    }
  }

  await fs.mkdir(questionsDir, { recursive: true })

  const promotedAt = new Date().toISOString()
  const promoted = questionSchema.parse({
    ...draft,
    status: "published",
    createdBy: draft.createdBy,
    source: {
      ...(draft.source ?? {}),
      review: {
        reviewedBy,
        reviewedAt: promotedAt,
        decision: "publish",
        promotedAt,
        promotedFromCreatedBy: draft.createdBy,
      },
    },
  })

  await fs.rename(draftPath, publishedPath)
  try {
    await fs.writeFile(publishedPath, `${JSON.stringify(promoted, null, 2)}\n`, "utf8")
  } catch (error) {
    await fs.rename(publishedPath, draftPath).catch(() => undefined)
    throw error
  }

  return {
    id,
    draftPath,
    publishedPath,
    promotedAt,
    createdBy: promoted.createdBy,
    review: {
      reviewedBy,
      reviewedAt: promotedAt,
      decision: "publish",
    },
  }
}
