import fs from "node:fs";
import path from "node:path";

import mammoth from "mammoth";

import { prisma } from "../lib/prisma";

type QuestionRow = {
  id: string;
  stem: string;
  options: unknown;
  source: unknown;
  createdBy: "import" | "ai" | "manual";
  questionTags: Array<{ tag: { id: string; name: string; kind: "topic" | "module" | "meta" | "ranZcogDomain"; parentId: string | null } }>;
};

type LectureDoc = {
  lectureNo: string;
  files: string[];
  tokenCounts: Map<string, number>;
  vector: Map<string, number>;
  norm: number;
};

type SimilarityCandidate = {
  lectureNo: string;
  score: number;
};

type AssignmentMethod = "source-file" | "similarity" | "manual-override";

type Assignment = {
  questionId: string;
  lectureNo: string;
  lectureTagId: string;
  method: AssignmentMethod;
  sourceFile: string;
  similarityTop: SimilarityCandidate[];
};

type Report = {
  generatedAt: string;
  lectureDir: string;
  dryRun: boolean;
  totals: {
    questionsScanned: number;
    lectureDocs: number;
    assignments: number;
    manualOverrideAssignments: number;
    sourceFileAssignments: number;
    similarityAssignments: number;
    lowConfidenceAssignments: number;
    unresolvedOverrides: number;
  };
  distribution: Array<{ lecture: string; count: number }>;
  lowConfidenceExamples: Array<{
    questionId: string;
    sourceFile: string;
    lectureNo: string;
    method: AssignmentMethod;
    topScores: SimilarityCandidate[];
  }>;
  unassigned: Array<{ questionId: string; sourceFile: string }>;
  unresolvedOverrideExamples: Array<{ questionId: string; requestedLectureNo: string }>;
};

type ScoredLecture = {
  lectureNo: string;
  score: number;
};

const ROOT_TAG_NAME = "Lecture Videos";
const LEGACY_ROOT_NAMES = new Set(["Lecture", ROOT_TAG_NAME]);
const DEFAULT_LECTURE_DIR = path.resolve("tmp/lecture_notes/mcq_docx/mcq_docx");
const DEFAULT_OVERRIDES_FILE = path.resolve("docs/audits/lecture-tagging-overrides.json");
const LOW_CONFIDENCE_THRESHOLD = 0.1;
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "have",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "this",
  "to",
  "was",
  "were",
  "with",
  "what",
  "which",
  "question",
  "questions",
  "answer",
  "answers",
  "rationale",
  "lecture",
  "lectures",
  "mcq",
  "set",
  "option",
  "options",
  "correct",
  "incorrect",
  "following",
  "true",
  "false",
  "none",
  "all",
  "patient",
  "women",
  "woman",
]);

function parseArgs(argv: string[]) {
  const args = {
    dryRun: false,
    lectureDir: DEFAULT_LECTURE_DIR,
    overridesFile: DEFAULT_OVERRIDES_FILE,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i];
    if (part === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (part === "--lecture-dir") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error("Missing value for --lecture-dir");
      }
      args.lectureDir = path.resolve(next);
      i += 1;
      continue;
    }
    if (part === "--overrides-file") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error("Missing value for --overrides-file");
      }
      args.overridesFile = path.resolve(next);
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${part}`);
  }

  return args;
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function asOptionText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  const chunks: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const key = typeof row.key === "string" ? row.key.trim() : "";
    const text = typeof row.text === "string" ? row.text.trim() : "";
    if (key && text) {
      chunks.push(`${key} ${text}`);
    }
  }
  return chunks.join(" ");
}

function tokenize(text: string) {
  const matches = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return matches.filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function normalizeLectureNo(raw: string) {
  const numeric = Number.parseInt(raw, 10);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return String(numeric).padStart(2, "0");
}

function extractLectureNoFromNoteFile(fileName: string) {
  const match = fileName.match(/^0*(\d{1,3})_/);
  if (!match) return null;
  return normalizeLectureNo(match[1]);
}

function extractLectureNoFromSourceFile(sourceFile: string) {
  const match = sourceFile.match(/(?:^|\/)L(\d{2,3})_/i);
  if (!match) return null;
  return normalizeLectureNo(match[1]);
}

function toTokenCounts(tokens: string[]) {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

function dotProduct(a: Map<string, number>, b: Map<string, number>) {
  let total = 0;
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const [key, value] of smaller) {
    const other = larger.get(key);
    if (!other) continue;
    total += value * other;
  }
  return total;
}

function vectorNorm(vector: Map<string, number>) {
  let sumSquares = 0;
  for (const value of vector.values()) {
    sumSquares += value * value;
  }
  return Math.sqrt(sumSquares);
}

function buildWeightedVector(tokenCounts: Map<string, number>, idfByToken: Map<string, number>) {
  const vector = new Map<string, number>();
  for (const [token, count] of tokenCounts) {
    const idf = idfByToken.get(token);
    if (!idf) continue;
    vector.set(token, count * idf);
  }
  return vector;
}

async function loadLectureDocs(lectureDir: string) {
  if (!fs.existsSync(lectureDir)) {
    throw new Error(`Lecture directory not found: ${lectureDir}`);
  }

  const entries = await fs.promises.readdir(lectureDir);
  const docxFiles = entries
    .filter((name) => name.toLowerCase().endsWith(".docx"))
    .filter((name) => !name.startsWith("._"))
    .sort((a, b) => a.localeCompare(b));

  const grouped = new Map<string, { files: string[]; tokens: string[] }>();

  for (const fileName of docxFiles) {
    const lectureNo = extractLectureNoFromNoteFile(fileName);
    if (!lectureNo) continue;

    const fullPath = path.join(lectureDir, fileName);
    const raw = await mammoth.extractRawText({ path: fullPath });
    const titleHint = fileName
      .replace(/\.docx$/i, "")
      .replace(/^\d+_\d+[-_]?/, "")
      .replace(/[-_]+/g, " ");
    const tokens = tokenize(`${titleHint}\n${raw.value}`);

    const existing = grouped.get(lectureNo) ?? { files: [], tokens: [] };
    existing.files.push(fileName);
    existing.tokens.push(...tokens);
    grouped.set(lectureNo, existing);
  }

  const lectureDocs: LectureDoc[] = [];
  for (const [lectureNo, groupedDoc] of Array.from(grouped.entries()).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    lectureDocs.push({
      lectureNo,
      files: groupedDoc.files,
      tokenCounts: toTokenCounts(groupedDoc.tokens),
      vector: new Map(),
      norm: 0,
    });
  }

  if (lectureDocs.length === 0) {
    throw new Error(`No lecture DOCX files found in ${lectureDir}`);
  }

  const documentFrequency = new Map<string, number>();
  for (const lectureDoc of lectureDocs) {
    const seen = new Set<string>();
    for (const token of lectureDoc.tokenCounts.keys()) {
      if (seen.has(token)) continue;
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
      seen.add(token);
    }
  }

  const totalDocuments = lectureDocs.length;
  const idfByToken = new Map<string, number>();
  for (const [token, df] of documentFrequency.entries()) {
    const idf = Math.log((1 + totalDocuments) / (1 + df)) + 1;
    idfByToken.set(token, idf);
  }

  for (const lectureDoc of lectureDocs) {
    lectureDoc.vector = buildWeightedVector(lectureDoc.tokenCounts, idfByToken);
    lectureDoc.norm = vectorNorm(lectureDoc.vector);
  }

  return { lectureDocs, idfByToken };
}

function scoreLectureCandidates(
  queryText: string,
  lectureDocs: LectureDoc[],
  idfByToken: Map<string, number>,
) {
  const tokens = tokenize(queryText);
  const queryVector = buildWeightedVector(toTokenCounts(tokens), idfByToken);
  const queryNorm = vectorNorm(queryVector);
  if (queryNorm === 0) return [] as ScoredLecture[];

  const scores: ScoredLecture[] = [];
  for (const lectureDoc of lectureDocs) {
    if (lectureDoc.norm === 0) continue;
    const dot = dotProduct(queryVector, lectureDoc.vector);
    const score = dot / (queryNorm * lectureDoc.norm);
    scores.push({
      lectureNo: lectureDoc.lectureNo,
      score,
    });
  }

  return scores.sort((a, b) => b.score - a.score || Number(a.lectureNo) - Number(b.lectureNo));
}

async function findOrCreateTag(name: string, kind: "topic" | "module" | "meta" | "ranZcogDomain", parentId: string | null) {
  const existing = await prisma.tag.findFirst({
    where: {
      name,
      kind,
      parentId,
    },
    select: { id: true },
  });

  if (existing) return existing.id;

  const created = await prisma.tag.create({
    data: {
      name,
      kind,
      parentId,
    },
    select: { id: true },
  });

  return created.id;
}

function collectDescendants(rootIds: string[], allTags: Array<{ id: string; parentId: string | null }>) {
  const childrenByParent = new Map<string, string[]>();
  for (const tag of allTags) {
    if (!tag.parentId) continue;
    const list = childrenByParent.get(tag.parentId) ?? [];
    list.push(tag.id);
    childrenByParent.set(tag.parentId, list);
  }

  const output = new Set<string>();
  const queue = [...rootIds];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    if (output.has(current)) continue;
    output.add(current);
    const children = childrenByParent.get(current) ?? [];
    queue.push(...children);
  }
  return output;
}

function lectureTagName(lectureNo: string) {
  return `Lecture ${lectureNo}`;
}

function loadManualOverrides(overridesFile: string) {
  if (!fs.existsSync(overridesFile)) {
    return new Map<string, string>();
  }

  const raw = fs.readFileSync(overridesFile, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const output = new Map<string, string>();

  for (const [questionId, requestedLecture] of Object.entries(parsed)) {
    if (typeof requestedLecture !== "string") continue;
    const normalized = normalizeLectureNo(requestedLecture);
    if (!normalized) continue;
    output.set(questionId, normalized);
  }

  return output;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { lectureDocs, idfByToken } = await loadLectureDocs(args.lectureDir);
  const manualOverrides = loadManualOverrides(args.overridesFile);
  const lectureNumbersFromNotes = new Set(lectureDocs.map((doc) => doc.lectureNo));

  const questions = await prisma.question.findMany({
    where: {
      status: "published",
      type: { in: ["SBA", "EMQ_STEM"] },
    },
    select: {
      id: true,
      stem: true,
      options: true,
      source: true,
      createdBy: true,
      questionTags: {
        select: {
          tag: {
            select: {
              id: true,
              name: true,
              kind: true,
              parentId: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  }) as QuestionRow[];

  const lectureNumbersFromSource = new Set<string>();
  for (const question of questions) {
    const sourceFile = typeof asObject(question.source).file === "string" ? String(asObject(question.source).file) : "";
    const lectureNo = extractLectureNoFromSourceFile(sourceFile);
    if (lectureNo) lectureNumbersFromSource.add(lectureNo);
  }

  const allLectureNumbers = new Set<string>([...lectureNumbersFromNotes, ...lectureNumbersFromSource]);
  const sortedLectureNumbers = Array.from(allLectureNumbers).sort((a, b) => Number(a) - Number(b));

  const lectureRootId = await findOrCreateTag(ROOT_TAG_NAME, "topic", null);
  const lectureTagIdByNumber = new Map<string, string>();
  for (const lectureNo of sortedLectureNumbers) {
    const tagId = await findOrCreateTag(lectureTagName(lectureNo), "topic", lectureRootId);
    lectureTagIdByNumber.set(lectureNo, tagId);
  }

  const assignments: Assignment[] = [];
  const unassigned: Array<{ questionId: string; sourceFile: string }> = [];
  const unresolvedOverrideExamples: Array<{ questionId: string; requestedLectureNo: string }> = [];

  for (const question of questions) {
    const source = asObject(question.source);
    const sourceFile = typeof source.file === "string" ? source.file : "";
    const manualLectureNo = manualOverrides.get(question.id);

    if (manualLectureNo) {
      const manualLectureTagId = lectureTagIdByNumber.get(manualLectureNo);
      if (manualLectureTagId) {
        assignments.push({
          questionId: question.id,
          lectureNo: manualLectureNo,
          lectureTagId: manualLectureTagId,
          method: "manual-override",
          sourceFile,
          similarityTop: [],
        });
        continue;
      }

      unresolvedOverrideExamples.push({
        questionId: question.id,
        requestedLectureNo: manualLectureNo,
      });
    }

    const sourceLectureNo = extractLectureNoFromSourceFile(sourceFile);
    if (sourceLectureNo && lectureTagIdByNumber.has(sourceLectureNo)) {
      assignments.push({
        questionId: question.id,
        lectureNo: sourceLectureNo,
        lectureTagId: lectureTagIdByNumber.get(sourceLectureNo) as string,
        method: "source-file",
        sourceFile,
        similarityTop: [],
      });
      continue;
    }

    const existingTagHints = question.questionTags
      .map((row) => row.tag)
      .filter((tag) => tag.kind === "topic" || tag.kind === "module")
      .map((tag) => tag.name)
      .join(" ");
    const queryText = `${question.stem}\n${asOptionText(question.options)}\n${existingTagHints}`;
    const scored = scoreLectureCandidates(queryText, lectureDocs, idfByToken);
    const top = scored[0];

    if (!top || !lectureTagIdByNumber.has(top.lectureNo)) {
      unassigned.push({
        questionId: question.id,
        sourceFile,
      });
      continue;
    }

    assignments.push({
      questionId: question.id,
      lectureNo: top.lectureNo,
      lectureTagId: lectureTagIdByNumber.get(top.lectureNo) as string,
      method: "similarity",
      sourceFile,
      similarityTop: scored.slice(0, 3).map((row) => ({
        lectureNo: row.lectureNo,
        score: Number(row.score.toFixed(6)),
      })),
    });
  }

  const allTags = await prisma.tag.findMany({
    select: {
      id: true,
      name: true,
      kind: true,
      parentId: true,
    },
  });

  const legacyRoots = allTags
    .filter((tag) => tag.kind === "topic" && LEGACY_ROOT_NAMES.has(tag.name))
    .map((tag) => tag.id);
  const lectureNumericRoots = allTags
    .filter((tag) => tag.kind === "topic" && /^Lecture\s+\d+$/i.test(tag.name) && tag.parentId === null)
    .map((tag) => tag.id);

  const removableLectureTagIds = collectDescendants(
    Array.from(new Set([...legacyRoots, ...lectureNumericRoots])),
    allTags.map((tag) => ({ id: tag.id, parentId: tag.parentId })),
  );

  if (!args.dryRun) {
    const questionIds = assignments.map((row) => row.questionId);
    if (questionIds.length > 0 && removableLectureTagIds.size > 0) {
      await prisma.questionTag.deleteMany({
        where: {
          questionId: { in: questionIds },
          tagId: { in: Array.from(removableLectureTagIds) },
        },
      });
    }

    if (assignments.length > 0) {
      await prisma.questionTag.createMany({
        data: assignments.map((row) => ({
          questionId: row.questionId,
          tagId: row.lectureTagId,
        })),
        skipDuplicates: true,
      });
    }
  }

  const distributionMap = new Map<string, number>();
  let manualOverrideAssignments = 0;
  let sourceFileAssignments = 0;
  let similarityAssignments = 0;
  let lowConfidenceAssignments = 0;
  const lowConfidenceExamples: Report["lowConfidenceExamples"] = [];

  for (const assignment of assignments) {
    distributionMap.set(assignment.lectureNo, (distributionMap.get(assignment.lectureNo) ?? 0) + 1);
    if (assignment.method === "manual-override") {
      manualOverrideAssignments += 1;
    } else if (assignment.method === "source-file") {
      sourceFileAssignments += 1;
    } else {
      similarityAssignments += 1;
      const topScore = assignment.similarityTop[0]?.score ?? 0;
      if (topScore < LOW_CONFIDENCE_THRESHOLD) {
        lowConfidenceAssignments += 1;
        if (lowConfidenceExamples.length < 80) {
          lowConfidenceExamples.push({
            questionId: assignment.questionId,
            sourceFile: assignment.sourceFile,
            lectureNo: assignment.lectureNo,
            method: assignment.method,
            topScores: assignment.similarityTop,
          });
        }
      }
    }
  }

  const report: Report = {
    generatedAt: new Date().toISOString(),
    lectureDir: args.lectureDir,
    dryRun: args.dryRun,
    totals: {
      questionsScanned: questions.length,
      lectureDocs: lectureDocs.length,
      assignments: assignments.length,
      manualOverrideAssignments,
      sourceFileAssignments,
      similarityAssignments,
      lowConfidenceAssignments,
      unresolvedOverrides: unresolvedOverrideExamples.length,
    },
    distribution: Array.from(distributionMap.entries())
      .map(([lecture, count]) => ({ lecture, count }))
      .sort((a, b) => Number(a.lecture) - Number(b.lecture)),
    lowConfidenceExamples,
    unassigned: unassigned.slice(0, 100),
    unresolvedOverrideExamples: unresolvedOverrideExamples.slice(0, 100),
  };

  const reportDir = path.resolve("docs/audits");
  await fs.promises.mkdir(reportDir, { recursive: true });
  const jsonPath = path.join(reportDir, "lecture-tagging-latest.json");
  await fs.promises.writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");

  const mdLines: string[] = [];
  mdLines.push("# Lecture Video Tagging Audit");
  mdLines.push("");
  mdLines.push(`Generated: ${report.generatedAt}`);
  mdLines.push(`Dry run: ${report.dryRun ? "yes" : "no"}`);
  mdLines.push(`Lecture corpus dir: ${report.lectureDir}`);
  mdLines.push("");
  mdLines.push("## Totals");
  mdLines.push(`- Questions scanned: ${report.totals.questionsScanned}`);
  mdLines.push(`- Lecture docs: ${report.totals.lectureDocs}`);
  mdLines.push(`- Assignments applied: ${report.totals.assignments}`);
  mdLines.push(`- Manual overrides applied: ${report.totals.manualOverrideAssignments}`);
  mdLines.push(`- Source-file assignments: ${report.totals.sourceFileAssignments}`);
  mdLines.push(`- Similarity assignments: ${report.totals.similarityAssignments}`);
  mdLines.push(`- Low-confidence similarity assignments (< ${LOW_CONFIDENCE_THRESHOLD}): ${report.totals.lowConfidenceAssignments}`);
  mdLines.push(`- Unresolved overrides: ${report.totals.unresolvedOverrides}`);
  mdLines.push(`- Unassigned (truncated): ${report.unassigned.length}`);
  mdLines.push("");
  mdLines.push("## Distribution by lecture");
  for (const row of report.distribution) {
    mdLines.push(`- Lecture ${row.lecture}: ${row.count}`);
  }
  mdLines.push("");
  mdLines.push("## Low-confidence examples (top 80)");
  for (const item of report.lowConfidenceExamples) {
    const top = item.topScores.map((score) => `${score.lectureNo}:${score.score}`).join(", ");
    mdLines.push(`- q=${item.questionId} | source=${item.sourceFile || "(none)"} | assigned=${item.lectureNo} | scores=${top}`);
  }
  mdLines.push("");
  mdLines.push("## Unassigned examples (top 100)");
  for (const item of report.unassigned) {
    mdLines.push(`- q=${item.questionId} | source=${item.sourceFile || "(none)"}`);
  }
  mdLines.push("");
  mdLines.push("## Unresolved overrides (top 100)");
  for (const item of report.unresolvedOverrideExamples) {
    mdLines.push(`- q=${item.questionId} | requested lecture=${item.requestedLectureNo}`);
  }
  mdLines.push("");
  mdLines.push("Machine-readable report:");
  mdLines.push("- `docs/audits/lecture-tagging-latest.json`");

  const mdPath = path.join(reportDir, "lecture-tagging-latest.md");
  await fs.promises.writeFile(mdPath, `${mdLines.join("\n")}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        dryRun: report.dryRun,
        questionsScanned: report.totals.questionsScanned,
        assignments: report.totals.assignments,
        manualOverrideAssignments: report.totals.manualOverrideAssignments,
        sourceFileAssignments: report.totals.sourceFileAssignments,
        similarityAssignments: report.totals.similarityAssignments,
        lowConfidenceAssignments: report.totals.lowConfidenceAssignments,
        unresolvedOverrides: report.totals.unresolvedOverrides,
        unassigned: report.unassigned.length,
        reportJson: "docs/audits/lecture-tagging-latest.json",
        reportMd: "docs/audits/lecture-tagging-latest.md",
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
