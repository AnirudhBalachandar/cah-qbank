import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";

import { prisma } from "../lib/prisma";
import { loadExamBlueprint } from "../lib/exam-blueprint";
import { resolveContentRoot } from "../ingest/moduleMap";
import { matchBlueprintRow } from "./exam_blueprint_matcher";

dotenv.config();

type Args = { dryRun: boolean; strict: boolean };

type ManualReviewRow = { questionId: string; reason: string; matchedDisciplines: string; matchedCurriculumAreas: string };

function parseArgs(argv: string[]): Args {
  return {
    dryRun: argv.includes("--dry-run"),
    strict: argv.includes("--strict"),
  };
}

async function findOrCreateTag(name: string, kind: "topic" | "module" | "meta" | "ranZcogDomain", parentId: string | null, dryRun: boolean) {
  const existing = await prisma.tag.findFirst({ where: { name, kind, parentId }, select: { id: true } });
  if (existing) return existing.id;
  if (dryRun) return `dry:${kind}:${parentId ?? 'root'}:${name}`;
  const created = await prisma.tag.create({ data: { name, kind, parentId }, select: { id: true } });
  return created.id;
}

async function collectSubtreeTagIds(rootId: string): Promise<string[]> {
  const allTags = await prisma.tag.findMany({ select: { id: true, parentId: true } });
  const childrenByParent = new Map<string, string[]>();
  for (const tag of allTags) {
    if (!tag.parentId) continue;
    const existing = childrenByParent.get(tag.parentId) ?? [];
    existing.push(tag.id);
    childrenByParent.set(tag.parentId, existing);
  }
  const collected = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (collected.has(current)) continue;
    collected.add(current);
    for (const child of childrenByParent.get(current) ?? []) {
      stack.push(child);
    }
  }
  return Array.from(collected);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const contentRoot = resolveContentRoot();
  const blueprint = loadExamBlueprint(contentRoot);
  if (blueprint.rows.length === 0) {
    throw new Error(`No exam blueprint rows found at ${blueprint.blueprintPath}. Add metadata/exam_blueprint.csv first.`);
  }

  const questions = await prisma.question.findMany({
    where: { status: { in: ["published", "draft"] } },
    select: {
      id: true,
      stem: true,
      options: true,
      moduleCode: true,
      source: true,
      questionTags: { select: { tag: { select: { name: true } } } },
    },
  });

  const rootId = await findOrCreateTag(blueprint.rootName, "topic", null, args.dryRun);
  const disciplineIdByName = new Map<string, string>();
  for (const discipline of blueprint.disciplines) {
    disciplineIdByName.set(discipline.name, await findOrCreateTag(discipline.name, "topic", rootId, args.dryRun));
  }

  const curriculumIdByName = new Map<string, string>();
  for (const row of blueprint.rows) {
    const parentId = disciplineIdByName.get(row.discipline)!;
    curriculumIdByName.set(row.curriculumArea, await findOrCreateTag(row.curriculumArea, "topic", parentId, args.dryRun));
  }

  const touchedQuestionIds: string[] = [];
  const manualReview: ManualReviewRow[] = [];
  const applied: Array<{ questionId: string; discipline: string; curriculumArea: string }> = [];

  for (const question of questions) {
    const source = typeof question.source === "object" && question.source !== null ? question.source as Record<string, unknown> : {};
    const match = matchBlueprintRow(blueprint.rows, {
      stem: question.stem,
      options: Array.isArray(question.options) ? question.options as Array<{ text?: string | null }> : [],
      moduleCode: question.moduleCode,
      sourceFile: typeof source.file === "string" ? source.file : "",
      sectionTitle: typeof source.sectionTitle === "string" ? source.sectionTitle : "",
      tagNames: question.questionTags.map((entry) => entry.tag.name),
    });

    if (!match.row) {
      manualReview.push({
        questionId: question.id,
        reason: match.reason,
        matchedDisciplines: "",
        matchedCurriculumAreas: match.scores
          .filter((score) => score.score > 0)
          .slice(0, 3)
          .map((score) => `${score.curriculumArea}:${score.score}`)
          .join(" | "),
      });
      continue;
    }

    const row = match.row;
    applied.push({ questionId: question.id, discipline: row.discipline, curriculumArea: row.curriculumArea });
    touchedQuestionIds.push(question.id);
  }

  if (!args.dryRun && touchedQuestionIds.length > 0) {
    const subtreeTagIds = await collectSubtreeTagIds(rootId);
    await prisma.questionTag.deleteMany({ where: { questionId: { in: touchedQuestionIds }, tagId: { in: subtreeTagIds } } });
    for (const item of applied) {
      await prisma.questionTag.createMany({
        data: [
          { questionId: item.questionId, tagId: disciplineIdByName.get(item.discipline)! },
          { questionId: item.questionId, tagId: curriculumIdByName.get(item.curriculumArea)! },
        ],
        skipDuplicates: true,
      });
    }
  }

  const report = {
    blueprintPath: blueprint.blueprintPath,
    dryRun: args.dryRun,
    strict: args.strict,
    totalQuestions: questions.length,
    appliedCount: applied.length,
    manualReviewCount: manualReview.length,
    disciplines: blueprint.disciplines,
  };

  const jsonPath = path.resolve("scripts/ingest/reports/exam_blueprint_apply_latest.json");
  const csvPath = path.resolve("scripts/ingest/reports/exam_blueprint_manual_review.csv");
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    csvPath,
    [
      "questionId,reason,matchedDisciplines,matchedCurriculumAreas",
      ...manualReview.map((row) => [row.questionId, row.reason, row.matchedDisciplines, row.matchedCurriculumAreas].map((value) => `\"${String(value).replace(/\"/g, '""')}\"`).join(",")),
    ].join("\n") + "\n",
    "utf8",
  );

  console.log(JSON.stringify(report, null, 2));
  if (args.strict && manualReview.length > 0) {
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
