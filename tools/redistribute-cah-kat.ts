import fs from "node:fs/promises"
import path from "node:path"

import { curriculumSchema, isQuestionAnswerable, normalizeTagSlug, questionSchema, type Curriculum } from "../packages/domain/src/question.ts"

type QuestionRecord = {
  path: string
  data: ReturnType<typeof questionSchema.parse>
}

const repoRoot = process.cwd()
const questionsDir = path.join(repoRoot, "questions")
const cahKatRootTag = "cah-exam-blueprint/cah-kat"

const blueprintUnits = new Map<Curriculum, number>([
  ["General Paediatrics", 16],
  ["Paediatric Sub-specialties", 12],
  ["Paediatric Surgery", 10],
  ["Emergency Paediatrics", 10],
  ["Adolescent Medicine", 6],
  ["Community-based Paediatrics", 6],
])

const targetCurricula: Curriculum[] = ["General Paediatrics", "Emergency Paediatrics", "Adolescent Medicine"]

const keywordRules: Record<(typeof targetCurricula)[number], RegExp[]> = {
  "Emergency Paediatrics": [
    /\b(ed|emergency|resusc|trauma|anaphyl|status epileptic|burn|poison|ingestion|collapse|shock|cpr|airway|triage|sepsis|dehydration)\b/i,
    /\bacute\b/i,
  ],
  "Adolescent Medicine": [
    /\b(adolescent|teen|puberty|menarche|contracep|sti|sexual|self harm|suicid|eating disorder|substance|alcohol|vaping|consent)\b/i,
  ],
  "General Paediatrics": [
    /\b(newborn|infant|toddler|growth|development|feeding|immuni|vaccin|fever|otitis|asthma|bronchiolitis|gastro|constipation|eczema|jaundice)\b/i,
  ],
}

function slugForCurriculum(curriculum: Curriculum) {
  return normalizeTagSlug(curriculum)
}

function isBlueprintLeafTag(tag: string) {
  return tag.startsWith(`${cahKatRootTag}/`)
}

function computeTargets(total: number) {
  const exact = Array.from(blueprintUnits.entries()).map(([curriculum, units]) => {
    const raw = (total * units) / 60
    return { curriculum, floor: Math.floor(raw), remainder: raw - Math.floor(raw) }
  })

  const targets = new Map<Curriculum, number>(exact.map((item) => [item.curriculum, item.floor]))
  let remainder = total - exact.reduce((sum, item) => sum + item.floor, 0)

  const ranked = [...exact].sort((a, b) => (b.remainder - a.remainder) || (a.curriculum.localeCompare(b.curriculum)))
  for (const item of ranked) {
    if (remainder <= 0) break
    targets.set(item.curriculum, (targets.get(item.curriculum) ?? 0) + 1)
    remainder -= 1
  }

  return targets
}

function scoreFor(question: ReturnType<typeof questionSchema.parse>, curriculum: (typeof targetCurricula)[number]) {
  const text = `${question.stem}\n${(question.explanation ?? "")}\n${question.tags.join(" ")}`
  const rules = keywordRules[curriculum]
  let score = 0
  for (let i = 0; i < rules.length; i += 1) {
    if (rules[i].test(text)) score += 3 - i
  }
  if (curriculum === "General Paediatrics") {
    score += 0.5 // default fallback target for ambiguous items
  }
  return score
}

function updateBlueprintTags(tags: string[], curriculum: Curriculum) {
  const nextLeaf = `${cahKatRootTag}/${slugForCurriculum(curriculum)}`
  const retained = tags.filter((tag) => !isBlueprintLeafTag(tag))
  const finalTags = new Set<string>(retained)
  finalTags.add(cahKatRootTag)
  finalTags.add(nextLeaf)
  return [...finalTags]
}

async function main() {
  const write = process.argv.includes("--write")
  const files = (await fs.readdir(questionsDir)).filter((name) => name.endsWith(".json")).sort()

  const records: QuestionRecord[] = []
  for (const file of files) {
    const filePath = path.join(questionsDir, file)
    const data = questionSchema.parse(JSON.parse(await fs.readFile(filePath, "utf8")))
    records.push({ path: filePath, data })
  }

  const candidates = records.filter(({ data }) =>
    data.status === "published" &&
    isQuestionAnswerable(data) &&
    data.tags.includes(cahKatRootTag) &&
    data.curriculum !== "Unclassified",
  )

  const current = new Map<Curriculum, number>()
  for (const { data } of candidates) {
    current.set(data.curriculum, (current.get(data.curriculum) ?? 0) + 1)
  }

  const targets = computeTargets(candidates.length)
  const deltas = new Map<Curriculum, number>()
  for (const curriculum of curriculumSchema.options) {
    if (curriculum === "Unclassified") continue
    deltas.set(curriculum, (targets.get(curriculum) ?? 0) - (current.get(curriculum) ?? 0))
  }

  const movable = candidates.filter(({ data }) => (deltas.get(data.curriculum) ?? 0) < 0)
  const sourceQuota = new Map<Curriculum, number>()
  for (const curriculum of curriculumSchema.options) {
    if (curriculum === "Unclassified") continue
    const delta = deltas.get(curriculum) ?? 0
    if (delta < 0) {
      sourceQuota.set(curriculum, Math.abs(delta))
    }
  }

  const assignments = new Map<string, Curriculum>()
  const remaining = new Map<Curriculum, number>()
  for (const curriculum of targetCurricula) {
    remaining.set(curriculum, Math.max(0, deltas.get(curriculum) ?? 0))
  }

  const scored = movable.map((record) => {
    const scores = targetCurricula.map((curriculum) => ({ curriculum, score: scoreFor(record.data, curriculum) }))
      .sort((a, b) => b.score - a.score)
    return {
      ...record,
      ranked: scores,
      spread: scores[0].score - scores[1].score,
    }
  }).sort((a, b) => b.spread - a.spread || b.ranked[0].score - a.ranked[0].score || a.data.id.localeCompare(b.data.id))

  for (const item of scored) {
    const source = item.data.curriculum
    const sourceRemaining = sourceQuota.get(source) ?? 0
    if (sourceRemaining <= 0) continue

    for (const pref of item.ranked) {
      const need = remaining.get(pref.curriculum) ?? 0
      if (need > 0) {
        assignments.set(item.data.id, pref.curriculum)
        remaining.set(pref.curriculum, need - 1)
        sourceQuota.set(source, sourceRemaining - 1)
        break
      }
    }
  }

  const stillNeeded = Array.from(remaining.entries()).filter(([, n]) => n > 0)
  if (stillNeeded.length > 0) {
    const unused = scored.filter((item) => !assignments.has(item.data.id) && (sourceQuota.get(item.data.curriculum) ?? 0) > 0)
    let index = 0
    for (const [curriculum, need] of stillNeeded) {
      for (let n = 0; n < need; n += 1) {
        const item = unused[index]
        if (!item) throw new Error(`Insufficient candidates while filling ${curriculum}`)
        assignments.set(item.data.id, curriculum)
        const source = item.data.curriculum
        sourceQuota.set(source, (sourceQuota.get(source) ?? 1) - 1)
        index += 1
      }
    }
  }

  let changed = 0
  for (const record of records) {
    const nextCurriculum = assignments.get(record.data.id)
    if (!nextCurriculum) continue

    if (record.data.curriculum === nextCurriculum) continue
    record.data.curriculum = nextCurriculum
    record.data.tags = updateBlueprintTags(record.data.tags, nextCurriculum)
    changed += 1

    if (write) {
      await fs.writeFile(record.path, `${JSON.stringify(record.data, null, 2)}\n`, "utf8")
    }
  }

  const projected = new Map<Curriculum, number>()
  for (const { data } of records) {
    if (!(data.status === "published" && isQuestionAnswerable(data) && data.tags.includes(cahKatRootTag))) continue
    projected.set(data.curriculum, (projected.get(data.curriculum) ?? 0) + 1)
  }

  console.log(JSON.stringify({
    totalAnswerableCahKat: candidates.length,
    changedQuestions: changed,
    current: Object.fromEntries(current.entries()),
    targets: Object.fromEntries(targets.entries()),
    projected: Object.fromEntries(projected.entries()),
    remainingNeed: Object.fromEntries(remaining.entries()),
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
