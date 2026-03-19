import { SUBJECT_CONFIG } from "@cah-qbank/domain";

export type ModuleCode = string;

export type ModuleInferenceInput = {
  stem: string;
  sourceFile: string;
  sectionTitle?: string;
  tagPaths: string[][];
  ranZcogDomains: string[];
  metaTags: string[];
};

export type ModuleClassification = {
  primary: ModuleCode;
  modules: ModuleCode[];
  scores: Record<string, number>;
};

const MODULE_CODE_RE = new RegExp(`\\b${SUBJECT_CONFIG.moduleCodePrefix}\\s*(\\d{1,2})\\b`, "ig");
const LECTURE_RE = /(?:^|[^a-z])(?:lecture|l)\s*0?(\d{1,2})(?:[^a-z]|$)/i;

function normalizeModuleCode(raw: string) {
  const match = raw.match(new RegExp(`${SUBJECT_CONFIG.moduleCodePrefix}\\s*(\\d{1,2})`, "i"));
  if (!match) return null;
  return `${SUBJECT_CONFIG.moduleCodePrefix} ${match[1].padStart(2, "0")}`;
}

function extractModuleCodes(text: string) {
  const out = new Set<string>();
  for (const match of text.matchAll(MODULE_CODE_RE)) {
    out.add(`${SUBJECT_CONFIG.moduleCodePrefix} ${match[1].padStart(2, "0")}`);
  }
  return Array.from(out);
}

function inferLectureModule(text: string) {
  const match = text.match(LECTURE_RE);
  if (!match) return null;
  return `${SUBJECT_CONFIG.moduleCodePrefix} ${match[1].padStart(2, "0")}`;
}

export function inferModuleClassification(input: ModuleInferenceInput): ModuleClassification {
  const candidates = new Map<string, number>();
  const combined = [
    input.stem,
    input.sourceFile,
    input.sectionTitle ?? "",
    input.tagPaths.flat().join(" "),
    input.ranZcogDomains.join(" "),
    input.metaTags.join(" "),
  ].join(" ");

  for (const code of extractModuleCodes(combined)) {
    candidates.set(code, (candidates.get(code) ?? 0) + 5);
  }

  for (const pathParts of input.tagPaths) {
    for (const part of pathParts) {
      const normalized = normalizeModuleCode(part);
      if (normalized) {
        candidates.set(normalized, (candidates.get(normalized) ?? 0) + 8);
      }
    }
  }

  const inferredLecture = inferLectureModule(input.sourceFile) ?? inferLectureModule(input.sectionTitle ?? "");
  if (inferredLecture) {
    candidates.set(inferredLecture, (candidates.get(inferredLecture) ?? 0) + 2);
  }

  const ordered = Array.from(candidates.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const primary = ordered[0]?.[0] ?? `${SUBJECT_CONFIG.moduleCodePrefix} 00`;

  return {
    primary,
    modules: ordered.length > 0 ? ordered.slice(0, 3).map(([code]) => code) : [primary],
    scores: Object.fromEntries(ordered),
  };
}

export function inferModuleCode(input: ModuleInferenceInput): ModuleCode {
  return inferModuleClassification(input).primary;
}
