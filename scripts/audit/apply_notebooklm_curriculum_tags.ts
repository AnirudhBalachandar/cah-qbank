import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";

import { prisma } from "../lib/prisma";
import { loadExamBlueprint } from "../lib/exam-blueprint";
import { matchBlueprintRow } from "./exam_blueprint_matcher";

dotenv.config();

type Args = {
  dryRun: boolean;
  contentRoot: string | null;
};

type SupportedTagKind = "topic" | "module" | "meta" | "ranZcogDomain";

type NotebookLmReviewRow = {
  questionId: string;
  reason: string;
  lectureTitle: string;
  stem: string;
  topScores: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    dryRun: false,
    contentRoot: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (arg === "--content-root") {
      args.contentRoot = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function normalizeText(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function includesAny(haystack: string, needles: string[]) {
  return needles.some((needle) => haystack.includes(needle));
}

function extractLeadingLectureNumber(text: string) {
  const match = text.match(/^(\d{1,5})\b/);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : null;
}

function asOptions(value: unknown): Array<{ text?: string | null }> {
  return Array.isArray(value)
    ? value.map((item) =>
        typeof item === "object" && item !== null
          ? { text: typeof (item as Record<string, unknown>).text === "string" ? String((item as Record<string, unknown>).text) : null }
          : { text: null },
      )
    : [];
}

function asSourceObject(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function classifyNotebookLmLectureFallback(lectureTitle: string | null, quizTitle: string | null) {
  const haystack = normalizeText([lectureTitle ?? "", quizTitle ?? ""].join(" "));
  if (!haystack) return null;
  const lectureNumber = extractLeadingLectureNumber(haystack);

  if (lectureNumber === 41) {
    return "Emergency Paediatrics";
  }

  if (lectureNumber === 65 || lectureNumber === 66 || lectureNumber === 69) {
    return "Paediatric Sub-specialties";
  }

  if (
    includesAny(haystack, [
      "adolescent",
      "puberty",
      "sexual",
      "chronic illness",
      "sleep disorders",
      "sleep an",
      "brain and",
      "basic fac",
    ])
  ) {
    return "Adolescent Medicine";
  }

  if (
    includesAny(haystack, [
      "car reporting",
      "atsi",
      "immunisation",
      "adhd",
      "autism",
      "developmental delay",
      "diagnostic assessmen",
      "obesity",
    ])
  ) {
    return "Community-based Paediatrics";
  }

  if (
    includesAny(haystack, [
      "surgery",
      "fracture",
      "child with limp",
      "limp",
      "burns",
      "burns ",
      "dentistry",
      "inguinoscrot",
      "penile",
      "congenital surgical",
      "head neck",
      "head neck",
    ])
  ) {
    return "Paediatric Surgery";
  }

  if (
    includesAny(haystack, [
      "brue",
      "pain manag",
      "pain mana",
      "what not to miss",
      "bronchiolitis and cr",
      "bronchiolitis and croup",
    ])
  ) {
    return "Emergency Paediatrics";
  }

  if (
    includesAny(haystack, [
      "ent",
      "asthma",
      "cf lecture",
      "cystic fibrosis",
      "respiratory",
      "allergy",
      "ophthalmology",
      "common eye problems",
      "ophalmology",
      "renal",
      "cardiology",
      "heart rhythm",
      "heart tube",
      "dermatology",
      "dysmorphic",
      "haematology",
      "haematology",
      "neurology",
      "oncology",
      "rheumatology",
      "medical student lect",
      "id paeds infections",
      "gi what not to miss",
    ])
  ) {
    return "Paediatric Sub-specialties";
  }

  if (
    includesAny(haystack, [
      "common problems",
      "vitamin d",
      "medical imaging",
      "diarrhoea assessment",
      "diarrhea assessment",
      "principles of paedia",
    ])
  ) {
    return "General Paediatrics";
  }

  return null;
}

async function findOrCreateTag(name: string, kind: SupportedTagKind, parentId: string | null, dryRun: boolean) {
  const existing = await prisma.tag.findFirst({
    where: { name, kind, parentId },
    select: { id: true },
  });
  if (existing) return existing.id;
  if (dryRun) return `dry:${kind}:${parentId ?? "root"}:${name}`;
  const created = await prisma.tag.create({
    data: { name, kind, parentId },
    select: { id: true },
  });
  return created.id;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const blueprint = loadExamBlueprint(args.contentRoot ? path.resolve(args.contentRoot) : undefined);
  if (blueprint.rows.length === 0) {
    throw new Error(`No exam blueprint rows found at ${blueprint.blueprintPath}.`);
  }

  const notebookLmQuestions = await prisma.question.findMany({
    where: { questionTags: { some: { tag: { name: "notebookLM" } } } },
    select: {
      id: true,
      stem: true,
      options: true,
      moduleCode: true,
      source: true,
      questionTags: { select: { tag: { select: { id: true, name: true, parentId: true } } } },
    },
  });

  const rootId = await findOrCreateTag(blueprint.rootName, "topic", null, args.dryRun);
  const disciplineName = blueprint.disciplines[0]?.name ?? "CAH KAT";
  const disciplineId = await findOrCreateTag(disciplineName, "topic", rootId, args.dryRun);

  const curriculumIdByName = new Map<string, string>();
  for (const row of blueprint.rows) {
    curriculumIdByName.set(
      row.curriculumArea,
      await findOrCreateTag(row.curriculumArea, "topic", disciplineId, args.dryRun),
    );
  }

  const applied: Array<{
    questionId: string;
    curriculumArea: string;
    matchedBy: "blueprint_matcher" | "lecture_title_fallback";
  }> = [];
  const manualReview: NotebookLmReviewRow[] = [];
  const areaCounts: Record<string, number> = {};
  let matchedByBlueprint = 0;
  let matchedByFallback = 0;

  for (const question of notebookLmQuestions) {
    const source = asSourceObject(question.source);
    const lectureTitle = typeof source.lectureTitle === "string" ? source.lectureTitle : "";
    const quizTitle = typeof source.quizTitle === "string" ? source.quizTitle : "";

    const match = matchBlueprintRow(blueprint.rows, {
      stem: question.stem,
      options: asOptions(question.options),
      moduleCode: question.moduleCode,
      sourceFile: lectureTitle,
      sectionTitle: quizTitle,
      tagNames: question.questionTags.map((entry) => entry.tag.name),
    });

    const curriculumArea = match.row?.curriculumArea ?? classifyNotebookLmLectureFallback(lectureTitle, quizTitle);
    const matchedBy = match.row ? "blueprint_matcher" : curriculumArea ? "lecture_title_fallback" : null;

    if (!curriculumArea || !matchedBy) {
      manualReview.push({
        questionId: question.id,
        reason: match.reason,
        lectureTitle,
        stem: question.stem,
        topScores: match.scores
          .filter((score) => score.score > 0)
          .slice(0, 3)
          .map((score) => `${score.curriculumArea}:${score.score}`)
          .join(" | "),
      });
      continue;
    }

    applied.push({
      questionId: question.id,
      curriculumArea,
      matchedBy,
    });

    areaCounts[curriculumArea] = (areaCounts[curriculumArea] ?? 0) + 1;
    if (matchedBy === "blueprint_matcher") matchedByBlueprint += 1;
    if (matchedBy === "lecture_title_fallback") matchedByFallback += 1;
  }

  if (!args.dryRun && applied.length > 0) {
    for (const item of applied) {
      await prisma.questionTag.createMany({
        data: [
          { questionId: item.questionId, tagId: disciplineId },
          { questionId: item.questionId, tagId: curriculumIdByName.get(item.curriculumArea)! },
        ],
        skipDuplicates: true,
      });
    }
  }

  const report = {
    dryRun: args.dryRun,
    totalNotebookLmQuestions: notebookLmQuestions.length,
    appliedCount: applied.length,
    unmatchedCount: manualReview.length,
    matchedByBlueprint,
    matchedByFallback,
    curriculumAreaCounts: areaCounts,
    blueprintPath: blueprint.blueprintPath,
  };

  const jsonPath = path.resolve("scripts/ingest/reports/notebooklm_curriculum_tagging_report.json");
  const csvPath = path.resolve("scripts/ingest/reports/notebooklm_curriculum_tagging_manual_review.csv");
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    csvPath,
    [
      "questionId,reason,lectureTitle,stem,topScores",
      ...manualReview.map((row) =>
        [row.questionId, row.reason, row.lectureTitle, row.stem, row.topScores]
          .map((value) => `\"${String(value).replace(/\"/g, '""')}\"`)
          .join(","),
      ),
    ].join("\n") + "\n",
    "utf8",
  );

  console.log(JSON.stringify(report, null, 2));
}

if (path.basename(process.argv[1] ?? "") === "apply_notebooklm_curriculum_tags.ts") {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
