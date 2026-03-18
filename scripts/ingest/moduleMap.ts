import fs from "node:fs";
import path from "node:path";

import { parse } from "csv-parse/sync";
import { SUBJECT_CONFIG } from "@cah-qbank/domain";

export type ModuleRecord = {
  code: string;
  title: string;
  displayName: string;
};

export type ContentRootResolution = {
  resolvedPath: string;
  source: "env" | "repo-default" | "downloads-fallback" | "fallback-missing";
  checked: Array<{
    source: "env" | "repo-default" | "downloads-fallback";
    path: string;
    hasQuestions: boolean;
    hasNotes: boolean;
    hasBlueprint: boolean;
  }>;
};

export function resolveQuestionSourceDir(contentRoot = resolveContentRoot()) {
  return path.join(contentRoot, SUBJECT_CONFIG.defaultQuestionSourceDir);
}

export function resolveLegacyQuestionSourceDir(contentRoot = resolveContentRoot()) {
  return path.join(contentRoot, SUBJECT_CONFIG.questionDocsDirName);
}

export function resolveNotesSourceDir(contentRoot = resolveContentRoot()) {
  return path.join(contentRoot, SUBJECT_CONFIG.defaultNotesSourceDir);
}

export function resolveLegacyNotesSourceDir(contentRoot = resolveContentRoot()) {
  return path.join(contentRoot, SUBJECT_CONFIG.notesDirName);
}

export function resolveMetadataDir(contentRoot = resolveContentRoot()) {
  return path.join(contentRoot, SUBJECT_CONFIG.metadataDirName);
}

export function resolveBlueprintCsvPath(contentRoot = resolveContentRoot()) {
  return path.join(contentRoot, SUBJECT_CONFIG.defaultBlueprintFile);
}

export function resolveModuleCsvPath(contentRoot = resolveContentRoot()) {
  return path.join(contentRoot, SUBJECT_CONFIG.defaultModuleMapFile);
}

function hasQuestions(rootPath: string) {
  return fs.existsSync(resolveQuestionSourceDir(rootPath)) || fs.existsSync(resolveLegacyQuestionSourceDir(rootPath));
}

function hasNotes(rootPath: string) {
  return fs.existsSync(resolveNotesSourceDir(rootPath)) || fs.existsSync(resolveLegacyNotesSourceDir(rootPath));
}

function hasBlueprint(rootPath: string) {
  return fs.existsSync(resolveBlueprintCsvPath(rootPath));
}

export function resolveContentRootWithDiagnostics(): ContentRootResolution {
  const envPath = process.env.CONTENT_ROOT ? path.resolve(process.env.CONTENT_ROOT) : null;
  const repoDefault = path.resolve(SUBJECT_CONFIG.contentRootRelative);
  const downloadsFallback = path.resolve(process.env.HOME ?? "", "Downloads", SUBJECT_CONFIG.downloadsFallbackDirName);

  const candidates: Array<{ source: "env" | "repo-default" | "downloads-fallback"; path: string }> = [];
  if (envPath) candidates.push({ source: "env", path: envPath });
  candidates.push({ source: "repo-default", path: repoDefault });
  candidates.push({ source: "downloads-fallback", path: downloadsFallback });

  const checked = candidates.map((candidate) => ({
    source: candidate.source,
    path: candidate.path,
    hasQuestions: hasQuestions(candidate.path),
    hasNotes: hasNotes(candidate.path),
    hasBlueprint: hasBlueprint(candidate.path),
  }));

  const ready = checked.find((candidate) => candidate.hasQuestions || candidate.hasNotes || candidate.hasBlueprint);
  if (ready) {
    return { resolvedPath: ready.path, source: ready.source, checked };
  }

  return {
    resolvedPath: envPath ?? repoDefault,
    source: "fallback-missing",
    checked,
  };
}

export function resolveContentRoot() {
  return resolveContentRootWithDiagnostics().resolvedPath;
}

export function loadModuleMap(csvPath = resolveModuleCsvPath()): ModuleRecord[] {
  if (!fs.existsSync(csvPath)) {
    return [];
  }

  const raw = fs.readFileSync(csvPath, "utf8");
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Array<Record<string, string>>;

  return rows
    .map((row) => {
      const code = (row.code ?? row.moduleCode ?? row.Topic ?? "").trim();
      const title = (row.title ?? row.Title ?? row.moduleTitle ?? "").trim();
      if (!code || !title) return null;
      return { code, title, displayName: `${code} — ${title}` };
    })
    .filter((record): record is ModuleRecord => Boolean(record));
}
