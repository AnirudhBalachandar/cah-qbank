import fs from "node:fs/promises";
import path from "node:path";

import dotenv from "dotenv";

import { SUBJECT_CONFIG } from "@cah-qbank/domain";
import { resolveBlueprintCsvPath, resolveContentRoot, resolveMetadataDir, resolveNotesSourceDir, resolveQuestionSourceDir } from "./moduleMap";

dotenv.config();

type Bucket = "questions" | "notes" | "blueprint" | "reference";

type Args = {
  sourceFolder: string;
  dryRun: boolean;
  refresh: boolean;
};

function parseArgs(argv: string[]): Args {
  let sourceFolder = "";
  let dryRun = false;
  let refresh = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--refresh") {
      refresh = true;
      continue;
    }
    if (arg === "--source-folder") {
      sourceFolder = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg.startsWith("--source-folder=")) {
      sourceFolder = arg.slice("--source-folder=".length);
      continue;
    }
  }

  if (!sourceFolder) {
    throw new Error("Missing required --source-folder /absolute/path/to/folder");
  }

  return {
    sourceFolder: path.resolve(sourceFolder),
    dryRun,
    refresh,
  };
}

async function walkFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(current: string) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        out.push(fullPath);
      }
    }
  }
  await walk(root);
  return out.sort();
}

function classifyFile(relativePath: string): Bucket {
  const lower = relativePath.toLowerCase();
  if (/(blueprint|curriculum|exam[_ -]?map|exam[_ -]?breakdown)/.test(lower)) {
    return "blueprint";
  }
  if (/(mcq|emq|sba|question|questions|quiz|qbank|past[_ -]?paper|exam)/.test(lower)) {
    return "questions";
  }
  if (/(note|notes|lecture|tutorial|summary|review|guideline|slides?)/.test(lower)) {
    return "notes";
  }
  return "reference";
}

async function ensureDir(dirPath: string, refresh: boolean) {
  if (refresh) {
    await fs.rm(dirPath, { recursive: true, force: true });
  }
  await fs.mkdir(dirPath, { recursive: true });
}

async function copyPreservingRelative(sourceRoot: string, sourceFile: string, targetRoot: string) {
  const relative = path.relative(sourceRoot, sourceFile);
  const targetPath = path.join(targetRoot, relative);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.copyFile(sourceFile, targetPath);
  return targetPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const contentRoot = resolveContentRoot();
  const questionDir = resolveQuestionSourceDir(contentRoot);
  const notesDir = resolveNotesSourceDir(contentRoot);
  const metadataDir = resolveMetadataDir(contentRoot);
  const blueprintCsvPath = resolveBlueprintCsvPath(contentRoot);
  const reportPath = path.resolve("scripts/ingest/reports/corpus_prepare_latest.json");

  const files = await walkFiles(args.sourceFolder);
  const report = {
    sourceFolder: args.sourceFolder,
    contentRoot,
    dryRun: args.dryRun,
    refresh: args.refresh,
    discoveredFiles: files.length,
    copied: { questions: 0, notes: 0, blueprint: 0, reference: 0 },
    files: [] as Array<{ source: string; bucket: Bucket; target: string | null }>,
  };

  if (!args.dryRun) {
    await ensureDir(questionDir, args.refresh);
    await ensureDir(notesDir, args.refresh);
    await ensureDir(metadataDir, false);
  }

  for (const sourceFile of files) {
    const relativeSource = path.relative(args.sourceFolder, sourceFile).replace(/\\/g, "/");
    const bucket = classifyFile(relativeSource);
    let target: string | null = null;

    if (!args.dryRun) {
      if (bucket === "questions") {
        target = await copyPreservingRelative(args.sourceFolder, sourceFile, questionDir);
      } else if (bucket === "notes" || bucket === "reference") {
        target = await copyPreservingRelative(args.sourceFolder, sourceFile, notesDir);
      } else if (bucket === "blueprint") {
        const extension = path.extname(sourceFile).toLowerCase();
        target = extension === ".csv"
          ? blueprintCsvPath
          : path.join(metadataDir, path.basename(sourceFile));
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(sourceFile, target);
      }
    }

    report.copied[bucket] += 1;
    report.files.push({
      source: relativeSource,
      bucket,
      target: target ? path.relative(contentRoot, target).replace(/\\/g, "/") : null,
    });
  }

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`Prepared CAH corpus structure under ${path.relative(process.cwd(), contentRoot) || SUBJECT_CONFIG.contentRootRelative}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
