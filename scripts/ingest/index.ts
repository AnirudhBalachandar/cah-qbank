import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";
import { SUBJECT_CONFIG } from "@cah-qbank/domain";

import { prisma } from "../lib/prisma";
import { inferModuleClassification, type ModuleCode } from "./moduleClassifier";
import {
  loadModuleMap,
  resolveContentRootWithDiagnostics,
  resolveLegacyQuestionSourceDir,
  resolveQuestionSourceDir,
} from "./moduleMap";
import { normalizeSourceFilePath, parseDocxFile } from "./parsers/docxParser";

dotenv.config();

type IngestStats = {
  filesScanned: number;
  questionsImported: number;
  questionsUpdated: number;
  questionsDeleted: number;
  questionsSkipped: number;
  missingAnswerCount: number;
  emqSetsImported: number;
  emqSetsDeleted: number;
  warnings: string[];
  contentRoot: string;
  contentRootSource: string;
  files: Array<{
    file: string;
    parsedQuestions: number;
    parsedEmqSets: number;
    imported: number;
    updated: number;
    deletedQuestions: number;
    deletedEmqSets: number;
    skipped: number;
    missingAnswers: number;
    warningCount: number;
  }>;
};

const MODULE_CODE_RE = new RegExp(`^${SUBJECT_CONFIG.moduleCodePrefix}\\s*(\\d{2})$`, "i");

function hashValue(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function sourceFileFromPayload(source: unknown) {
  if (typeof source !== "object" || source === null) {
    return null;
  }

  const record = source as Record<string, unknown>;
  return typeof record.file === "string" ? record.file : null;
}

async function findDocxFiles(root: string): Promise<string[]> {
  const output: string[] = [];
  async function walk(dir: string) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".docx")) {
        output.push(fullPath);
      }
    }
  }
  await walk(root);
  return output.sort();
}

async function findOrCreateTag(name: string, kind: "topic" | "module" | "meta" | "ranZcogDomain", parentId: string | null) {
  const existing = await prisma.tag.findFirst({ where: { name, kind, parentId }, select: { id: true } });
  if (existing) return existing.id;
  const created = await prisma.tag.create({ data: { name, kind, parentId }, select: { id: true } });
  return created.id;
}

async function upsertTagPath(parts: string[], kind: "topic" | "module" | "meta" | "ranZcogDomain" = "topic") {
  let parentId: string | null = null;
  let leafId: string | null = null;
  for (const part of parts) {
    leafId = await findOrCreateTag(part, kind, parentId);
    parentId = leafId;
  }
  return leafId;
}

async function ensureModules() {
  const modules = loadModuleMap();
  const moduleTagIdByCode = new Map<string, string>();
  for (const module of modules) {
    const id = await findOrCreateTag(module.displayName, "module", null);
    moduleTagIdByCode.set(module.code.toUpperCase(), id);
  }
  return { modules, moduleTagIdByCode };
}

function normalizeModuleCode(rawCode: string | null | undefined): ModuleCode | null {
  if (!rawCode) return null;
  const match = rawCode.match(MODULE_CODE_RE);
  if (!match) return null;
  return `${SUBJECT_CONFIG.moduleCodePrefix} ${match[1]}`;
}

async function resolveModuleTagId(moduleTagIdByCode: Map<string, string>, moduleCode: string) {
  const normalizedCode = moduleCode.toUpperCase();
  const fromMap = moduleTagIdByCode.get(normalizedCode);
  if (fromMap) return fromMap;

  const moduleTag = await prisma.tag.findFirst({
    where: { kind: "module", name: { startsWith: normalizedCode } },
    select: { id: true },
  });

  if (moduleTag) {
    moduleTagIdByCode.set(normalizedCode, moduleTag.id);
    return moduleTag.id;
  }
  return null;
}

async function getQuestionSourceRoots(contentRoot: string) {
  const roots = [resolveQuestionSourceDir(contentRoot), resolveLegacyQuestionSourceDir(contentRoot)];
  const existingRoots: string[] = [];
  for (const root of roots) {
    if (fs.existsSync(root)) existingRoots.push(root);
  }
  return Array.from(new Set(existingRoots));
}

async function pruneStaleImportsForFile(sourceFile: string, questionFingerprints: Set<string>, emqFingerprints: Set<string>) {
  if (questionFingerprints.size === 0 && emqFingerprints.size === 0) {
    return { deletedQuestions: 0, deletedEmqSets: 0 };
  }

  const [existingQuestions, existingEmqSets] = await Promise.all([
    prisma.question.findMany({
      where: { createdBy: "import" },
      select: { id: true, source: true, sourceFingerprint: true },
    }),
    prisma.emqSet.findMany({
      select: { id: true, source: true, sourceFingerprint: true },
    }),
  ]);

  const staleQuestionIds = existingQuestions
    .filter((question) => sourceFileFromPayload(question.source) === sourceFile && !questionFingerprints.has(question.sourceFingerprint))
    .map((question) => question.id);

  const staleEmqSetIds = existingEmqSets
    .filter((emqSet) => sourceFileFromPayload(emqSet.source) === sourceFile && !emqFingerprints.has(emqSet.sourceFingerprint))
    .map((emqSet) => emqSet.id);

  if (staleQuestionIds.length > 0) {
    await prisma.question.deleteMany({ where: { id: { in: staleQuestionIds } } });
  }

  if (staleEmqSetIds.length > 0) {
    await prisma.emqSet.deleteMany({ where: { id: { in: staleEmqSetIds } } });
  }

  return {
    deletedQuestions: staleQuestionIds.length,
    deletedEmqSets: staleEmqSetIds.length,
  };
}

async function ingest() {
  const contentResolution = resolveContentRootWithDiagnostics();
  const contentRoot = contentResolution.resolvedPath;
  const sourceRoots = await getQuestionSourceRoots(contentRoot);
  if (sourceRoots.length === 0) {
    throw new Error(`No question source folders found under ${contentRoot}. Run pnpm corpus:prepare first or add DOCX files to ${SUBJECT_CONFIG.defaultQuestionSourceDir}.`);
  }

  console.log(`Using content root: ${contentRoot} (${contentResolution.source})`);
  console.log(`Question source roots: ${sourceRoots.map((root) => path.relative(contentRoot, root) || ".").join(", ")}`);

  const { moduleTagIdByCode } = await ensureModules();
  const files = (await Promise.all(sourceRoots.map((root) => findDocxFiles(root)))).flat().sort();

  const stats: IngestStats = {
    filesScanned: files.length,
    questionsImported: 0,
    questionsUpdated: 0,
    questionsDeleted: 0,
    questionsSkipped: 0,
    missingAnswerCount: 0,
    emqSetsImported: 0,
    emqSetsDeleted: 0,
    warnings: [],
    contentRoot,
    contentRootSource: contentResolution.source,
    files: [],
  };

  for (const filePath of files) {
    const parsed = await parseDocxFile(filePath, { contentRoot });
    const fileWarningCount = parsed.warnings.length;
    const fileMissingAnswers = parsed.questions.filter((question) => !question.correctKey).length;
    stats.warnings.push(...parsed.warnings);
    stats.missingAnswerCount += fileMissingAnswers;

    const fileStats = {
      file: path.relative(contentRoot, filePath).replace(/\\/g, "/"),
      parsedQuestions: parsed.questions.length,
      parsedEmqSets: parsed.emqSets.length,
      imported: 0,
      updated: 0,
      deletedQuestions: 0,
      deletedEmqSets: 0,
      skipped: 0,
      missingAnswers: fileMissingAnswers,
      warningCount: fileWarningCount,
    };

    const emqIdMap = new Map<string, string>();
    const expectedQuestionFingerprints = new Set<string>();
    const expectedEmqFingerprints = new Set<string>();

    for (const emqSet of parsed.emqSets) {
      const sourceFile = normalizeSourceFilePath(emqSet.source.file, contentRoot);
      const sourcePayload = { ...emqSet.source, file: sourceFile };
      const sourceFingerprint = hashValue(`${sourceFile}::${emqSet.localId}::${emqSet.title ?? ""}::${JSON.stringify(emqSet.optionList)}`);
      expectedEmqFingerprints.add(sourceFingerprint);
      const upserted = await prisma.emqSet.upsert({
        where: { sourceFingerprint },
        create: {
          title: emqSet.title,
          instructions: emqSet.instructions,
          optionList: emqSet.optionList,
          source: sourcePayload,
          sourceFingerprint,
        },
        update: {
          title: emqSet.title,
          instructions: emqSet.instructions,
          optionList: emqSet.optionList,
          source: sourcePayload,
        },
        select: { id: true },
      });
      emqIdMap.set(emqSet.localId, upserted.id);
      stats.emqSetsImported += 1;
    }

    for (const question of parsed.questions) {
      const sourceFile = normalizeSourceFilePath(question.source.file, contentRoot);
      const sourcePayload = { ...question.source, file: sourceFile };
      const sourceFingerprint = hashValue(`${sourceFile}::${question.qNumber}::${question.source.emqSetTitle ?? ""}::${question.source.stemHash}`);
      expectedQuestionFingerprints.add(sourceFingerprint);
      const emqId = question.emqLocalId ? emqIdMap.get(question.emqLocalId) ?? null : null;
      const questionOptions = question.type === "EMQ_STEM" && emqId
        ? parsed.emqSets.find((set) => set.localId === question.emqLocalId)?.optionList ?? []
        : question.options;

      if (question.type === "EMQ_STEM" && questionOptions.length === 0) {
        stats.questionsSkipped += 1;
        fileStats.skipped += 1;
        stats.warnings.push(`${path.basename(filePath)} Q${question.qNumber} skipped: EMQ options unavailable.`);
        continue;
      }

      const existing = await prisma.question.findUnique({ where: { sourceFingerprint }, select: { id: true } });
      const explicitModuleCode = normalizeModuleCode(question.moduleCode);
      const inferredClassification = inferModuleClassification({
        stem: question.stem,
        sourceFile,
        sectionTitle: question.source.sectionTitle,
        tagPaths: question.tagPaths,
        ranZcogDomains: question.ranZcogDomains,
        metaTags: question.metaTags,
      });

      const moduleCodeSet = new Set<ModuleCode>(inferredClassification.modules);
      if (explicitModuleCode) moduleCodeSet.add(explicitModuleCode);
      const primaryModuleCode = explicitModuleCode ?? inferredClassification.primary;

      const questionRecord = await prisma.question.upsert({
        where: { sourceFingerprint },
        create: {
          type: question.type,
          stem: question.stem,
          options: questionOptions,
          correctKey: question.correctKey,
          explanation: question.explanation,
          rationale: question.rationale,
          difficulty: question.difficulty,
          ausScore: question.ausScore,
          moduleCode: primaryModuleCode,
          createdBy: "import",
          status: "published",
          source: {
            ...sourcePayload,
            importedAt: new Date().toISOString(),
            moduleInference: inferredClassification,
          },
          sourceFingerprint,
          ...(emqId ? { emqLinks: { create: { emqSetId: emqId } } } : {}),
        },
        update: {
          type: question.type,
          stem: question.stem,
          options: questionOptions,
          correctKey: question.correctKey,
          explanation: question.explanation,
          rationale: question.rationale,
          difficulty: question.difficulty,
          ausScore: question.ausScore,
          moduleCode: primaryModuleCode,
          source: {
            ...sourcePayload,
            importedAt: new Date().toISOString(),
            moduleInference: inferredClassification,
          },
        },
        select: { id: true },
      });

      for (const parts of question.tagPaths) {
        const tagId = await upsertTagPath(parts, "topic");
        if (tagId) {
          await prisma.questionTag.upsert({
            where: { questionId_tagId: { questionId: questionRecord.id, tagId } },
            update: {},
            create: { questionId: questionRecord.id, tagId },
          });
        }
      }

      for (const domain of question.ranZcogDomains) {
        const domainId = await upsertTagPath([domain], "ranZcogDomain");
        if (domainId) {
          await prisma.questionTag.upsert({
            where: { questionId_tagId: { questionId: questionRecord.id, tagId: domainId } },
            update: {},
            create: { questionId: questionRecord.id, tagId: domainId },
          });
        }
      }

      for (const metaTag of question.metaTags) {
        const metaId = await upsertTagPath([metaTag], "meta");
        if (metaId) {
          await prisma.questionTag.upsert({
            where: { questionId_tagId: { questionId: questionRecord.id, tagId: metaId } },
            update: {},
            create: { questionId: questionRecord.id, tagId: metaId },
          });
        }
      }

      for (const moduleCode of moduleCodeSet) {
        const moduleTagId = await resolveModuleTagId(moduleTagIdByCode, moduleCode);
        if (moduleTagId) {
          await prisma.questionTag.upsert({
            where: { questionId_tagId: { questionId: questionRecord.id, tagId: moduleTagId } },
            update: {},
            create: { questionId: questionRecord.id, tagId: moduleTagId },
          });
        }
      }

      if (existing) {
        stats.questionsUpdated += 1;
        fileStats.updated += 1;
      } else {
        stats.questionsImported += 1;
        fileStats.imported += 1;
      }
    }

    const normalizedSourceFile = normalizeSourceFilePath(filePath, contentRoot);
    const deleted = await pruneStaleImportsForFile(normalizedSourceFile, expectedQuestionFingerprints, expectedEmqFingerprints);
    stats.questionsDeleted += deleted.deletedQuestions;
    stats.emqSetsDeleted += deleted.deletedEmqSets;
    fileStats.deletedQuestions += deleted.deletedQuestions;
    fileStats.deletedEmqSets += deleted.deletedEmqSets;

    stats.files.push(fileStats);
  }

  const reportPath = path.resolve("scripts/ingest/reports/latest.json");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(stats, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(stats, null, 2));
}

ingest().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
