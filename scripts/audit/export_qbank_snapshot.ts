import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

import { PrismaClient, type CreatedBy, type QuestionStatus, type QuestionType } from "../../app/src/lib/generated/prisma";

type JsonValue =
  | null
  | string
  | number
  | boolean
  | JsonValue[]
  | { [key: string]: JsonValue };

type ExportQuestion = {
  id: string;
  type: QuestionType;
  stem: string;
  options: JsonValue;
  correctKey: string | null;
  explanation: string | null;
  rationale: string | null;
  whyOthersWrong: JsonValue;
  citations: JsonValue;
  difficulty: string | null;
  ausScore: number | null;
  moduleCode: string | null;
  createdBy: CreatedBy;
  status: QuestionStatus;
  source: JsonValue;
  sourceFingerprint: string;
  createdAt: string;
};

type ExportTag = {
  id: string;
  name: string;
  kind: string;
  parentId: string | null;
  createdAt: string;
};

type ExportQuestionTagLink = {
  questionId: string;
  tagId: string;
};

type ManifestSummary = {
  totalQuestions: number;
  totalTags: number;
  totalQuestionTagLinks: number;
  questionsByStatus: Record<string, number>;
  questionsByType: Record<string, number>;
  questionsByCreatedBy: Record<string, number>;
  notebookLmTaggedQuestions: number;
  notebookLmByStatus: Record<string, number>;
  curriculumCounts: Record<string, number>;
};

function parseArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function currentDateStamp() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function stableNormalize(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => stableNormalize(item));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return Object.fromEntries(entries.map(([key, item]) => [key, stableNormalize(item)]));
  }

  return String(value);
}

function stableStringify(value: unknown) {
  return JSON.stringify(stableNormalize(value), null, 2) + "\n";
}

function sha256(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function countBy<T extends string>(values: T[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function tryGitCommit() {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function hasAncestorName(
  tagId: string | null,
  tagById: Map<string, ExportTag>,
  ancestorName: string,
) {
  let currentId = tagId;
  while (currentId) {
    const currentTag = tagById.get(currentId);
    if (!currentTag) {
      return false;
    }
    if (currentTag.name === ancestorName) {
      return true;
    }
    currentId = currentTag.parentId;
  }
  return false;
}

async function main() {
  const outDir =
    parseArg("--out-dir") ??
    path.join(process.cwd(), "backups", "qbank-state", currentDateStamp());

  const prisma = new PrismaClient();

  try {
    const [questionsRaw, tagsRaw, questionTagLinksRaw] = await Promise.all([
      prisma.question.findMany({
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
      prisma.tag.findMany({
        orderBy: [{ kind: "asc" }, { name: "asc" }, { id: "asc" }],
      }),
      prisma.questionTag.findMany({
        orderBy: [{ questionId: "asc" }, { tagId: "asc" }],
      }),
    ]);

    const questions: ExportQuestion[] = questionsRaw.map((question) => ({
      id: question.id,
      type: question.type,
      stem: question.stem,
      options: stableNormalize(question.options),
      correctKey: question.correctKey,
      explanation: question.explanation,
      rationale: question.rationale,
      whyOthersWrong: stableNormalize(question.whyOthersWrong),
      citations: stableNormalize(question.citations),
      difficulty: question.difficulty,
      ausScore: question.ausScore,
      moduleCode: question.moduleCode,
      createdBy: question.createdBy,
      status: question.status,
      source: stableNormalize(question.source),
      sourceFingerprint: question.sourceFingerprint,
      createdAt: question.createdAt.toISOString(),
    }));

    const tags: ExportTag[] = tagsRaw.map((tag) => ({
      id: tag.id,
      name: tag.name,
      kind: tag.kind,
      parentId: tag.parentId,
      createdAt: tag.createdAt.toISOString(),
    }));

    const questionTagLinks: ExportQuestionTagLink[] = questionTagLinksRaw.map((link) => ({
      questionId: link.questionId,
      tagId: link.tagId,
    }));

    const tagById = new Map(tags.map((tag) => [tag.id, tag]));
    const notebookLmTag = tags.find((tag) => tag.name === "notebookLM");
    const notebookLmQuestionIds = new Set(
      notebookLmTag
        ? questionTagLinks
            .filter((link) => link.tagId === notebookLmTag.id)
            .map((link) => link.questionId)
        : [],
    );

    const notebookLmByStatus = countBy(
      questions
        .filter((question) => notebookLmQuestionIds.has(question.id))
        .map((question) => question.status),
    );

    const curriculumRoots = [
      "General Paediatrics",
      "Paediatric Sub-specialties",
      "Paediatric Surgery",
      "Emergency Paediatrics",
      "Adolescent Medicine",
      "Community-based Paediatrics",
    ];

    const curriculumCounts = Object.fromEntries(
      curriculumRoots.map((root) => {
        const curriculumTag =
          tags.find(
            (tag) =>
              tag.name === root &&
              hasAncestorName(tag.parentId, tagById, "CAH KAT"),
          ) ?? tags.find((tag) => tag.name === root);
        if (!curriculumTag) {
          return [root, 0];
        }
        const questionIds = new Set(
          questionTagLinks
            .filter((link) => link.tagId === curriculumTag.id)
            .map((link) => link.questionId),
        );
        return [root, questionIds.size];
      }),
    );

    const summary: ManifestSummary = {
      totalQuestions: questions.length,
      totalTags: tags.length,
      totalQuestionTagLinks: questionTagLinks.length,
      questionsByStatus: countBy(questions.map((question) => question.status)),
      questionsByType: countBy(questions.map((question) => question.type)),
      questionsByCreatedBy: countBy(questions.map((question) => question.createdBy)),
      notebookLmTaggedQuestions: notebookLmQuestionIds.size,
      notebookLmByStatus,
      curriculumCounts,
    };

    await mkdir(outDir, { recursive: true });

    const files = [
      {
        name: "questions.json",
        content: stableStringify(questions),
      },
      {
        name: "tags.json",
        content: stableStringify(tags),
      },
      {
        name: "question-tag-links.json",
        content: stableStringify(questionTagLinks),
      },
      {
        name: "summary.json",
        content: stableStringify(summary),
      },
    ] as const;

    const manifestFiles: Record<
      string,
      { sha256: string; bytes: number; records?: number }
    > = {};

    for (const file of files) {
      await writeFile(path.join(outDir, file.name), file.content, "utf8");
      const records =
        file.name === "questions.json"
          ? questions.length
          : file.name === "tags.json"
            ? tags.length
            : file.name === "question-tag-links.json"
              ? questionTagLinks.length
              : undefined;
      manifestFiles[file.name] = {
        sha256: sha256(file.content),
        bytes: Buffer.byteLength(file.content, "utf8"),
        ...(records === undefined ? {} : { records }),
      };
    }

    const manifest = {
      exportedAt: new Date().toISOString(),
      gitCommit: tryGitCommit(),
      databaseProvider: "postgresql",
      outputDirectory: outDir,
      summary,
      files: manifestFiles,
      notes: [
        "This snapshot is a GitHub-safe qbank domain backup of questions and tags.",
        "It intentionally excludes local corpus files in content/ and runtime workflow/orchestration state.",
      ],
      tagHierarchySample: tags
        .filter((tag) => curriculumRoots.includes(tag.name) || tag.name === "notebookLM" || tag.name === "CAH KAT")
        .map((tag) => ({
          id: tag.id,
          name: tag.name,
          kind: tag.kind,
          parentId: tag.parentId,
          parentName: tag.parentId ? tagById.get(tag.parentId)?.name ?? null : null,
        })),
    };

    const manifestContent = stableStringify(manifest);
    await writeFile(path.join(outDir, "manifest.json"), manifestContent, "utf8");

    console.log(
      JSON.stringify(
        {
          outputDirectory: outDir,
          summary,
          manifestSha256: sha256(manifestContent),
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
