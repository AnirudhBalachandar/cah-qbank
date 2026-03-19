import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { parse as parseCsv } from "csv-parse/sync";

import type { QuestionOption } from "../../../app/src/lib/types";

export type ManifestRow = {
  globalId: string;
  sourceFile: string;
  questionNumberInFile: string;
  explanationSource: string;
  stream: string;
  topic: string;
  tags: string[];
  tagsRaw: string;
  correctOption: string | null;
  correctText: string | null;
};

export type ExplanationRow = {
  globalId: string;
  explanationSource: string;
  explanation: string;
};

export type MarkdownQuestionContext = {
  globalId: string;
  sourceFile: string;
  questionNumberInFile: string;
  stem: string;
  options: QuestionOption[];
  correctOption: string | null;
  correctText: string | null;
  optionExplanations: Record<string, string>;
  optionCrossCheckTableMarkdown: string | null;
  optionCrossCheckRows: number;
};

type RawCsvRow = Record<string, unknown>;

const BROKEN_CITATION_LINE_PATTERNS = [
  /^\s*-\s*\[[^\]]*$/i,
  /^\s*-\s*\[\d+\]\s*#?\s*$/i,
  /^\s*-\s*\[[^\]]+\]\s*\.*\s*$/i,
  /^\s*\[[^\]]+\]\s*#?\s*$/i,
];

type ParsedExplanationHeading = {
  kind:
    | "explanation"
    | "core"
    | "decision"
    | "option-by-option"
    | "option-cross-check"
    | "five-second-exam-rule"
    | "common-exam-traps"
    | "other";
  label: string;
  remainder: string;
};

type ParsedExplanationSection = {
  heading: ParsedExplanationHeading;
  lines: string[];
};

function parseExplanationHeading(line: string): ParsedExplanationHeading | null {
  const trimmed = line.trim();

  const explanationMatch = trimmed.match(/^explanation\s*:\s*(.*)$/i);
  if (explanationMatch) {
    return { kind: "explanation", label: "Explanation", remainder: explanationMatch[1]?.trim() ?? "" };
  }

  const whyCorrectMatch = trimmed.match(/^why(?:\s+this\s+is)?\s+correct\s*:\s*(.*)$/i)
    ?? trimmed.match(/^why\s+it(?:'|’)?s\s+correct\s*:\s*(.*)$/i);
  if (whyCorrectMatch) {
    return { kind: "explanation", label: "Explanation", remainder: whyCorrectMatch[1]?.trim() ?? "" };
  }

  const coreIdeaMatch = trimmed.match(/^core idea(?:\s*\(.*\))?\s*:\s*(.*)$/i);
  if (coreIdeaMatch) {
    return { kind: "core", label: "Core idea", remainder: coreIdeaMatch[1]?.trim() ?? "" };
  }

  const coreConceptMatch = trimmed.match(/^core concept(?:\s*\(.*\))?\s*:\s*(.*)$/i);
  if (coreConceptMatch) {
    return { kind: "core", label: "Core idea", remainder: coreConceptMatch[1]?.trim() ?? "" };
  }

  const decisionMatch = trimmed.match(/^decision approach(?:\s*\(.*\))?\s*:\s*(.*)$/i);
  if (decisionMatch) {
    return { kind: "decision", label: "Decision approach", remainder: decisionMatch[1]?.trim() ?? "" };
  }

  const optionCrossCheckMatch = trimmed.match(/^option cross-check\s*:\s*(.*)$/i);
  if (optionCrossCheckMatch) {
    return { kind: "option-cross-check", label: "Option cross-check", remainder: optionCrossCheckMatch[1]?.trim() ?? "" };
  }

  const optionByOptionMatch = trimmed.match(/^option-by-option(?:\s+explanation)?\s*:\s*(.*)$/i);
  if (optionByOptionMatch) {
    return { kind: "option-by-option", label: "Option-by-option", remainder: optionByOptionMatch[1]?.trim() ?? "" };
  }

  const fiveSecondRuleMatch = trimmed.match(/^5-second exam rule\s*:\s*(.*)$/i);
  if (fiveSecondRuleMatch) {
    return { kind: "five-second-exam-rule", label: "5-second exam rule", remainder: fiveSecondRuleMatch[1]?.trim() ?? "" };
  }

  const commonTrapsMatch = trimmed.match(/^common exam traps?\s*:\s*(.*)$/i);
  if (commonTrapsMatch) {
    return { kind: "common-exam-traps", label: "Common exam traps", remainder: commonTrapsMatch[1]?.trim() ?? "" };
  }

  return null;
}

function parseStructuredExplanationSections(text: string): ParsedExplanationSection[] {
  const lines = text.split("\n");
  const sections: ParsedExplanationSection[] = [];
  let current: ParsedExplanationSection = {
    heading: {
      kind: "other",
      label: "Explanation",
      remainder: "",
    },
    lines: [],
  };

  const pushCurrent = () => {
    const body = current.lines.join("\n").trim();
    if (!body) return;
    sections.push({
      heading: current.heading,
      lines: body.split("\n"),
    });
  };

  let foundStructuredHeading = false;

  for (const rawLine of lines) {
    const heading = parseExplanationHeading(rawLine);
    if (heading) {
      foundStructuredHeading = true;
      pushCurrent();
      current = {
        heading,
        lines: heading.remainder ? [heading.remainder] : [],
      };
      continue;
    }
    current.lines.push(rawLine);
  }

  pushCurrent();

  return foundStructuredHeading ? sections : [];
}

function normalizeAndReorderExplanationSections(
  text: string,
  optionCrossCheckTableMarkdown: string | null = null,
) {
  const sections = parseStructuredExplanationSections(text);
  const normalizedOptionCrossCheckTable = optionCrossCheckTableMarkdown?.trim() || null;

  if (sections.length === 0) {
    if (!normalizedOptionCrossCheckTable) {
      return text;
    }

    const trimmedText = text.trim();
    if (!trimmedText) {
      return `Option cross-check:\n${normalizedOptionCrossCheckTable}`;
    }

    return `${trimmedText}\n\nOption cross-check:\n${normalizedOptionCrossCheckTable}`;
  }

  let filtered = sections.filter((section) => section.heading.kind !== "decision");
  if (normalizedOptionCrossCheckTable) {
    filtered = filtered.filter((section) => section.heading.kind !== "option-cross-check");
    filtered.push({
      heading: {
        kind: "option-cross-check",
        label: "Option cross-check",
        remainder: "",
      },
      lines: normalizedOptionCrossCheckTable.split("\n"),
    });
  }

  if (filtered.length === 0) {
    if (normalizedOptionCrossCheckTable) {
      return `Option cross-check:\n${normalizedOptionCrossCheckTable}`;
    }
    return text;
  }

  const order: Record<ParsedExplanationHeading["kind"], number> = {
    explanation: 0,
    "option-by-option": 1,
    "option-cross-check": 2,
    core: 3,
    "five-second-exam-rule": 4,
    "common-exam-traps": 5,
    decision: 6,
    other: 7,
  };

  const sorted = filtered
    .map((section, index) => ({ section, index }))
    .sort((a, b) => {
      const byPriority = order[a.section.heading.kind] - order[b.section.heading.kind];
      if (byPriority !== 0) return byPriority;
      return a.index - b.index;
    })
    .map((entry) => entry.section);

  return sorted
    .map((section) => {
      const body = section.lines.join("\n").trim();
      if (!body) return null;
      return `${section.heading.label}:\n${body}`;
    })
    .filter((value): value is string => Boolean(value))
    .join("\n\n")
    .trim();
}

export function normalizeForMatch(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u2018\u2019\u0060\u00B4]/g, "'")
    .replace(/[\u201C\u201D]/g, "\"")
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeStemForMatch(stem: string) {
  return normalizeForMatch(stem);
}

export function normalizeOptionTextForMatch(text: string) {
  return normalizeForMatch(text);
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableString(value: unknown) {
  const normalized = asString(value);
  return normalized.length > 0 ? normalized : null;
}

function parseCsvRows(filePath: string) {
  const text = fs.readFileSync(filePath, "utf8");
  return parseCsv(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as RawCsvRow[];
}

function normalizeGlobalId(rawValue: string) {
  if (!rawValue) {
    return "";
  }
  const asNumber = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(asNumber)) {
    return rawValue;
  }
  return String(asNumber);
}

function parseTags(rawTags: string) {
  return rawTags
    .split("|")
    .map((piece) => piece.trim())
    .filter(Boolean);
}

export function readManifestRows(filePath: string): ManifestRow[] {
  return parseCsvRows(filePath).map((row) => {
    const tagsRaw = asString(row.tags);
    return {
      globalId: normalizeGlobalId(asString(row.global_id)),
      sourceFile: asString(row.source_file),
      questionNumberInFile: asString(row.question_number_in_file).toUpperCase(),
      explanationSource: asString(row.explanation_source),
      stream: asString(row.stream),
      topic: asString(row.topic),
      tags: parseTags(tagsRaw),
      tagsRaw,
      correctOption: asNullableString(row.correct_option)?.toUpperCase() ?? null,
      correctText: asNullableString(row.correct_text),
    };
  });
}

export function readExplanationRows(filePath: string): ExplanationRow[] {
  return parseCsvRows(filePath).map((row) => ({
    globalId: normalizeGlobalId(asString(row.global_id)),
    explanationSource: asString(row.explanation_source),
    explanation: asString(row.explanation),
  }));
}

function cleanMarkdownInline(rawValue: string) {
  return rawValue
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/`/g, "")
    .trim();
}

type OptionCrossCheckParseResult = {
  optionExplanations: Record<string, string>;
  tableMarkdown: string | null;
  rowCount: number;
};

function parseOptionByOption(block: string) {
  const optionExplanations: Record<string, string> = {};
  const sectionMatch = block.match(/\*\*Option-by-option(?:\s+explanation)?\*\*([\s\S]*?)(?=\n\*\*[^*]+\*\*|$)/i);
  if (!sectionMatch) {
    return optionExplanations;
  }

  const lines = sectionMatch[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let currentKey: string | null = null;

  const append = (key: string, value: string) => {
    const normalized = cleanMarkdownInline(value);
    if (!normalized) {
      return;
    }
    optionExplanations[key] = optionExplanations[key]
      ? `${optionExplanations[key]} ${normalized}`.trim()
      : normalized;
  };

  for (const rawLine of lines) {
    const line = rawLine
      .replace(/^[-*]\s+/, "")
      .replace(/^\d+\.\s+/, "")
      .trim();

    const strongHeading = line.match(/^\*\*([A-Z])(?:[\).])?\s*(.*?)\*\*$/i);
    if (strongHeading) {
      currentKey = strongHeading[1].toUpperCase();
      if (strongHeading[2]?.trim()) {
        append(currentKey, strongHeading[2].trim());
      }
      continue;
    }

    const strongWithText = line.match(/^\*\*([A-Z])(?:[\).])?\s*(.*?)\*\*\s*(.*)$/i);
    if (strongWithText) {
      currentKey = strongWithText[1].toUpperCase();
      const value = [strongWithText[2], strongWithText[3]].filter(Boolean).join(" ").trim();
      if (value) {
        append(currentKey, value);
      }
      continue;
    }

    const plainHeading = line.match(/^([A-Z])(?:[\).])\s*(.*)$/i);
    if (plainHeading) {
      currentKey = plainHeading[1].toUpperCase();
      if (plainHeading[2]?.trim()) {
        append(currentKey, plainHeading[2].trim());
      }
      continue;
    }

    if (currentKey) {
      append(currentKey, line);
    }
  }

  return optionExplanations;
}

function parseOptionCrossCheck(block: string): OptionCrossCheckParseResult {
  const optionExplanations: Record<string, string> = {};
  const emptyResult: OptionCrossCheckParseResult = {
    optionExplanations,
    tableMarkdown: null,
    rowCount: 0,
  };

  const sectionMatch = block.match(/\*\*Option cross-check\*\*([\s\S]*)$/i);
  if (!sectionMatch) {
    return emptyResult;
  }

  const section = sectionMatch[1];
  const tableLines = section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"));

  if (tableLines.length < 3) {
    return emptyResult;
  }

  const tableMarkdown = tableLines.join("\n");
  const dataLines = tableLines.slice(2);
  let rowCount = 0;
  for (const line of dataLines) {
    const inner = line.replace(/^\|/, "").replace(/\|$/, "");
    const cells = inner.split("|").map((cell) => cell.trim());
    if (cells.length < 4) {
      continue;
    }

    const keyMatch = cells[0].match(/([A-Z])/i);
    if (!keyMatch) {
      continue;
    }

    const key = keyMatch[1].toUpperCase();
    rowCount += 1;
    const whyNotCell = cleanMarkdownInline(cells[3]);
    if (!whyNotCell) {
      continue;
    }
    optionExplanations[key] = whyNotCell;
  }

  return {
    optionExplanations,
    tableMarkdown,
    rowCount,
  };
}

export function parseExplanationMarkdownFile(filePath: string): MarkdownQuestionContext[] {
  const text = fs.readFileSync(filePath, "utf8");
  const blocks = text.split(/\n---\s*\n/g);

  const contexts: MarkdownQuestionContext[] = [];
  for (const block of blocks) {
    const headerMatch = block.match(/###\s+Q(\d{4})\s+[—-]\s+(.+?)\s+\(Q(\d+[A-Za-z]?)\)/);
    if (!headerMatch) {
      continue;
    }

    const globalId = normalizeGlobalId(headerMatch[1]);
    const sourceFile = headerMatch[2].trim();
    const questionNumberInFile = headerMatch[3].trim().toUpperCase();

    const stemMatch = block.match(/\*\*Stem\*\*:\s*([\s\S]*?)\n\s*\n\*\*Options\*\*/i);
    const optionsSectionMatch = block.match(/\*\*Options\*\*([\s\S]*?)\n\s*\n\*\*Correct answer\*\*/i);
    const correctMatch = block.match(/\*\*Correct answer\*\*:\s*\*\*([A-Z])\*\*\s+[—-]\s+\*(.+?)\*/i);

    const stem = stemMatch
      ? stemMatch[1].replace(/\r/g, "").replace(/\n+/g, " ").trim()
      : "";

    const options: QuestionOption[] = [];
    if (optionsSectionMatch) {
      const section = optionsSectionMatch[1];
      for (const match of section.matchAll(/^\s*-\s+\*\*([A-Z])\*\*\.\s+(.+)$/gim)) {
        options.push({
          key: match[1].toUpperCase(),
          text: match[2].trim(),
        });
      }
    }

    const optionCrossCheck = parseOptionCrossCheck(block);
    const optionByOption = parseOptionByOption(block);
    const combinedOptionExplanations = {
      ...optionCrossCheck.optionExplanations,
      ...optionByOption,
    };

    contexts.push({
      globalId,
      sourceFile,
      questionNumberInFile,
      stem,
      options,
      correctOption: correctMatch?.[1]?.toUpperCase() ?? null,
      correctText: correctMatch?.[2]?.trim() ?? null,
      optionExplanations: combinedOptionExplanations,
      optionCrossCheckTableMarkdown: optionCrossCheck.tableMarkdown,
      optionCrossCheckRows: optionCrossCheck.rowCount,
    });
  }

  return contexts;
}

export function parseAllMarkdownQuestionContexts(explanationsMarkdownDir: string) {
  const files = fs
    .readdirSync(explanationsMarkdownDir)
    .filter((name) => name.toLowerCase().endsWith(".md"))
    .sort((a, b) => a.localeCompare(b));

  const contexts: MarkdownQuestionContext[] = [];
  for (const fileName of files) {
    const filePath = path.join(explanationsMarkdownDir, fileName);
    contexts.push(...parseExplanationMarkdownFile(filePath));
  }

  return contexts;
}

export function sanitizeExplanationMarkdown(
  rawText: string,
  options?: { optionCrossCheckTableMarkdown?: string | null },
) {
  const normalized = rawText
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00A0/g, " ");

  const cleanedLines: string[] = [];
  for (const line of normalized.split("\n")) {
    const trimmedLine = line.trimEnd();
    if (BROKEN_CITATION_LINE_PATTERNS.some((pattern) => pattern.test(trimmedLine))) {
      continue;
    }
    cleanedLines.push(trimmedLine);
  }

  const compacted: string[] = [];
  let previousBlank = false;
  for (const line of cleanedLines) {
    const isBlank = line.trim().length === 0;
    if (isBlank && previousBlank) {
      continue;
    }
    compacted.push(line);
    previousBlank = isBlank;
  }

  return normalizeAndReorderExplanationSections(
    compacted.join("\n").trim(),
    options?.optionCrossCheckTableMarkdown ?? null,
  );
}

export function hasDecisionApproachSection(text: string) {
  return /(^|\n)\s*decision approach(?:\s*\(.*\))?\s*:/i.test(text);
}

function normalizeOptionsForFingerprint(options: QuestionOption[]) {
  return options
    .map((option) => ({
      key: option.key.toUpperCase().trim(),
      text: normalizeOptionTextForMatch(option.text),
    }))
    .filter((option) => option.key.length > 0 && option.text.length > 0)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((option) => `${option.key}:${option.text}`)
    .join("|");
}

export function buildDeterministicStemOptionCorrectKey(input: {
  stem: string;
  options: QuestionOption[];
  correctOption: string | null;
  correctText: string | null;
}) {
  const stemPart = normalizeStemForMatch(input.stem);
  const optionsPart = normalizeOptionsForFingerprint(input.options);
  const correctOptionPart = input.correctOption?.toUpperCase().trim() ?? "";
  const correctTextPart = normalizeOptionTextForMatch(input.correctText ?? "");
  return `${stemPart}::${optionsPart}::${correctOptionPart}::${correctTextPart}`;
}

export function buildOptionCorrectKey(input: {
  options: QuestionOption[];
  correctOption: string | null;
  correctText: string | null;
}) {
  const optionsPart = normalizeOptionsForFingerprint(input.options);
  const correctOptionPart = input.correctOption?.toUpperCase().trim() ?? "";
  const correctTextPart = normalizeOptionTextForMatch(input.correctText ?? "");
  return `${optionsPart}::${correctOptionPart}::${correctTextPart}`;
}

export function buildOptionCorrectKeyWithoutText(input: {
  options: QuestionOption[];
  correctOption: string | null;
}) {
  const optionsPart = normalizeOptionsForFingerprint(input.options);
  const correctOptionPart = input.correctOption?.toUpperCase().trim() ?? "";
  return `${optionsPart}::${correctOptionPart}`;
}

export function buildStemCorrectKey(input: {
  stem: string;
  correctOption: string | null;
}) {
  const stemPart = normalizeStemForMatch(input.stem);
  const correctOptionPart = input.correctOption?.toUpperCase().trim() ?? "";
  return `${stemPart}::${correctOptionPart}`;
}

export function sha256Hex(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
