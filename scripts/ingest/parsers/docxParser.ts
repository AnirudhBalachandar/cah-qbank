import crypto from "node:crypto";
import path from "node:path";

import mammoth from "mammoth";
import { parse as parseHtml, type HTMLElement } from "node-html-parser";

import type { QuestionOption } from "../../../app/src/lib/types";
import { SUBJECT_CONFIG } from "@cah-qbank/domain";

export type ParsedEmqSet = {
  localId: string;
  title: string | null;
  instructions: string | null;
  optionList: QuestionOption[];
  source: {
    file: string;
    sectionTitle?: string;
    emqSetTitle?: string;
  };
};

export type ParsedQuestion = {
  qNumber: string;
  type: "SBA" | "EMQ_STEM";
  stem: string;
  options: QuestionOption[];
  correctKey: string | null;
  explanation: string | null;
  rationale: string | null;
  difficulty: string | null;
  ausScore: number | null;
  moduleCode: string | null;
  tagPaths: string[][];
  ranZcogDomains: string[];
  metaTags: string[];
  emqLocalId: string | null;
  source: {
    file: string;
    originalQNumber: string;
    sectionTitle?: string;
    emqSetTitle?: string;
    stemHash: string;
    parseNotes?: string[];
  };
};

export type ParsedDocx = {
  file: string;
  questions: ParsedQuestion[];
  emqSets: ParsedEmqSet[];
  warnings: string[];
};

export type ParsedExplanationDocxQuestion = {
  globalId: string;
  stream: string | null;
  topic: string | null;
  stem: string;
  options: QuestionOption[];
  correctOption: string | null;
  correctText: string | null;
  coreIdea: string | null;
  explanationLines: string[];
  decisionLines: string[];
  optionByOptionLines: string[];
  fiveSecondExamRuleLines: string[];
  optionExplanations: Record<string, string>;
  optionCrossCheckTableMarkdown: string | null;
  optionCrossCheckRows: number;
  sourceFile: string;
};

export type ParsedExplanationDocx = {
  file: string;
  questions: ParsedExplanationDocxQuestion[];
  warnings: string[];
};

export type ParseExplanationDocxOptions = {
  mode?: "auto" | "table" | "paragraph";
};

type ParseDocxOptions = {
  contentRoot?: string;
};

type ParsedHtmlListItem = {
  key: string;
  text: string;
  isMarkedCorrect: boolean;
  inlineAnswerKey: string | null;
};

const QUESTION_RE = /^(?:Question\s*)?Q?\s*(\d+[A-Za-z]?)\s*[\).:\-]?\s*(.*)$/i;
const OPTION_RE = /^([A-H])[\).:\-]\s*(.+)$/;
const ANSWER_KEY_HEADER_RE = /^(answer\s*key\b|answers?\s*(?:$|[:\-]|table\b|sheet\b|rationale\b|explanations?\b))/i;
const ANSWER_INSTRUCTION_RE = /^answer\s+questions?\b/i;

export function normalizeLines(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/\u0007/g, "")
    .replace(/\f/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line, index, all) => !(line.length === 0 && all[index - 1]?.length === 0));
}

export function isQuestionHeader(line: string) {
  const match = line.match(QUESTION_RE);
  if (!match) return null;
  if (/^Q?#?\d+\s*[|\t]/i.test(line)) return null;
  return { number: match[1], remainder: match[2]?.trim() ?? "" };
}

export function parseOptionLine(line: string) {
  const match = line.match(OPTION_RE);
  if (!match) return null;
  return {
    key: match[1],
    text: match[2].trim(),
  };
}

function parseAnswerKey(lines: string[]) {
  const map = new Map<string, string>();
  const startIndex = lines.findIndex((line) => ANSWER_KEY_HEADER_RE.test(line) && !ANSWER_INSTRUCTION_RE.test(line));
  if (startIndex === -1) {
    return { map, startIndex: lines.length };
  }

  const nextNonEmptyLine = (fromIndex: number) => {
    for (let index = fromIndex; index < lines.length; index += 1) {
      const line = lines[index]?.trim();
      if (line) {
        return { index, line };
      }
    }
    return null;
  };

  for (let i = startIndex; i < lines.length; i += 1) {
    const line = lines[i];

    const narrative = line.match(/^Q?\s*(\d+[A-Za-z]?)\s*[:\-]\s*([A-H])\b/i);
    if (narrative) {
      map.set(narrative[1].toUpperCase(), narrative[2].toUpperCase());
      continue;
    }

    const compact = line.match(/^Q?\s*(\d+[A-Za-z]?)\s+([A-H])\b/i);
    if (compact) {
      map.set(compact[1].toUpperCase(), compact[2].toUpperCase());
      continue;
    }

    const piped = line.match(/^Q?\s*(\d+[A-Za-z]?)\s*[|]\s*([A-H])\b/i);
    if (piped) {
      map.set(piped[1].toUpperCase(), piped[2].toUpperCase());
      continue;
    }

    const verticalNumber = line.match(/^(\d+[A-Za-z]?)$/);
    if (verticalNumber) {
      const next = nextNonEmptyLine(i + 1);
      const verticalAnswer = next?.line.match(/^([A-H])$/i);
      if (verticalAnswer && next) {
        map.set(verticalNumber[1].toUpperCase(), verticalAnswer[1].toUpperCase());
        i = next.index;
        continue;
      }
    }

    const verticalQNumber = line.match(/^Q?\s*(\d+[A-Za-z]?)$/i);
    if (verticalQNumber) {
      const next = nextNonEmptyLine(i + 1);
      const verticalAnswer = next?.line.match(/^([A-H])$/i);
      if (verticalAnswer && next) {
        map.set(verticalQNumber[1].toUpperCase(), verticalAnswer[1].toUpperCase());
        i = next.index;
      }
    }
  }

  return { map, startIndex };
}

function hashStem(stem: string) {
  return crypto.createHash("sha256").update(stem.toLowerCase().replace(/\s+/g, " ").trim()).digest("hex").slice(0, 20);
}

export function normalizeSourceFilePath(filePath: string, contentRoot?: string) {
  const slashNormalized = filePath.replace(/\\/g, "/");
  if (!contentRoot) {
    return slashNormalized;
  }

  const absoluteFile = path.resolve(filePath);
  const absoluteRoot = path.resolve(contentRoot);
  const relative = path.relative(absoluteRoot, absoluteFile);

  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    return relative.replace(/\\/g, "/");
  }

  return slashNormalized;
}

function parseTagAndMeta(rawTagText: string) {
  const pieces = rawTagText
    .replace(/^Tags?\s*:\s*/i, "")
    .split(/[;•]/)
    .map((piece) => piece.trim())
    .filter(Boolean);

  const tagPaths: string[][] = [];
  const ranZcogDomains: string[] = [];
  const metaTags: string[] = [];
  let difficulty: string | null = null;
  let ausScore: number | null = null;
  let moduleCode: string | null = null;

  for (const piece of pieces) {
    const difficultyMatch = piece.match(/^Difficulty\s*[:=]\s*(.+)$/i);
    if (difficultyMatch) {
      difficulty = difficultyMatch[1].trim();
      continue;
    }

    const ausMatch = piece.match(/^AUS\s*[:=]\s*(\d+)/i);
    if (ausMatch) {
      ausScore = Number(ausMatch[1]);
      continue;
    }

    const ranZcogMatch = piece.match(/^RANZCOG\s*[:=]\s*(.+)$/i);
    if (ranZcogMatch) {
      ranZcogDomains.push(ranZcogMatch[1].trim());
      continue;
    }

    const metaMatch = piece.match(/^Yield\s*[:=]\s*(.+)$/i);
    if (metaMatch) {
      metaTags.push(`Yield: ${metaMatch[1].trim()}`);
      continue;
    }

    const parts = piece
      .split(/[>|]/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length > 0) {
      const moduleRe = new RegExp(`^${SUBJECT_CONFIG.moduleCodePrefix}\\s*\\d{2}$`, "i");
      const maybeModule = parts.find((part) => moduleRe.test(part));
      if (maybeModule) {
        moduleCode = maybeModule.toUpperCase();
      }
      tagPaths.push(parts);
    }
  }

  return {
    tagPaths,
    ranZcogDomains,
    metaTags,
    difficulty,
    ausScore,
    moduleCode,
  };
}

export function parseDocxText(rawText: string, filePath: string, options: ParseDocxOptions = {}): ParsedDocx {
  const lines = normalizeLines(rawText);
  const { map: answerMap, startIndex: answerStart } = parseAnswerKey(lines);
  const sourceFile = normalizeSourceFilePath(filePath, options.contentRoot);

  const questions: ParsedQuestion[] = [];
  const emqSets: ParsedEmqSet[] = [];
  const warnings: string[] = [];

  let currentSection: string | undefined;
  let currentEmq: ParsedEmqSet | null = null;
  let emqOptionMode = false;

  const pushEmqIfNeeded = () => {
    if (!currentEmq) return;
    if (!emqSets.find((item) => item.localId === currentEmq?.localId)) {
      emqSets.push(currentEmq);
    }
  };

  let i = 0;
  while (i < answerStart) {
    const line = lines[i];

    if (/^Section\b/i.test(line)) {
      currentSection = line;
      if (/SBA/i.test(line)) {
        currentEmq = null;
      }
      i += 1;
      continue;
    }

    const emqHeaderMatch = line.match(/^EMQ(?:\s*Set)?\s*([A-Za-z0-9].*)$/i);
    if (emqHeaderMatch) {
      const title = emqHeaderMatch[1].replace(/^[:\-–—]\s*/, "").trim() || null;
      currentEmq = {
        localId: `${path.basename(filePath)}::${title ?? `emq-${emqSets.length + 1}`}`,
        title,
        instructions: null,
        optionList: [],
        source: {
          file: sourceFile,
          sectionTitle: currentSection,
          emqSetTitle: title ?? undefined,
        },
      };
      emqOptionMode = false;
      pushEmqIfNeeded();
      i += 1;
      continue;
    }

    if (currentEmq && !isQuestionHeader(line)) {
      if (/^Options?\s*:?$/i.test(line) || /^Options?\s*:/i.test(line)) {
        emqOptionMode = true;
        const inline = line.split(/:/).slice(1).join(":").trim();
        if (inline) {
          const option = parseOptionLine(inline);
          if (option) currentEmq.optionList.push(option);
        }
        i += 1;
        continue;
      }

      const option = parseOptionLine(line);
      if (option) {
        emqOptionMode = true;
        currentEmq.optionList.push(option);
        i += 1;
        continue;
      }

      if (emqOptionMode && currentEmq.optionList.length > 0 && line && !/^Select\b/i.test(line)) {
        const last = currentEmq.optionList[currentEmq.optionList.length - 1];
        last.text = `${last.text} ${line}`.trim();
        i += 1;
        continue;
      }

      if (!emqOptionMode && line && !/^Select\b/i.test(line)) {
        currentEmq.instructions = [currentEmq.instructions, line].filter(Boolean).join(" ");
      }

      i += 1;
      continue;
    }

    const questionHeader = isQuestionHeader(line);
    if (!questionHeader) {
      i += 1;
      continue;
    }

    const stemParts = questionHeader.remainder ? [questionHeader.remainder] : [];
    const options: QuestionOption[] = [];
    let rawTags = "";

    i += 1;
    while (i < answerStart) {
      const cursor = lines[i];
      if (isQuestionHeader(cursor) || /^Section\b/i.test(cursor) || /^EMQ(?:\s*Set)?\b/i.test(cursor)) {
        break;
      }

      if (/^Tags?\s*:/i.test(cursor)) {
        rawTags = cursor;
        i += 1;
        while (i < answerStart && lines[i] && !isQuestionHeader(lines[i]) && !parseOptionLine(lines[i]) && !/^Section\b/i.test(lines[i])) {
          rawTags = `${rawTags}; ${lines[i]}`;
          i += 1;
        }
        continue;
      }

      const option = parseOptionLine(cursor);
      if (option) {
        options.push(option);
        i += 1;
        while (i < answerStart && lines[i] && !parseOptionLine(lines[i]) && !/^Tags?\s*:/i.test(lines[i]) && !isQuestionHeader(lines[i])) {
          const last = options[options.length - 1];
          last.text = `${last.text} ${lines[i]}`.trim();
          i += 1;
        }
        continue;
      }

      if (cursor) {
        stemParts.push(cursor);
      }
      i += 1;
    }

    const { tagPaths, ranZcogDomains, metaTags, difficulty, ausScore, moduleCode } = parseTagAndMeta(rawTags);
    const qNumber = questionHeader.number.toUpperCase();
    const stem = stemParts.join("\n").trim();
    const isEmqStem = Boolean(currentEmq);

    if (!isEmqStem && options.length < 2) {
      warnings.push(`${path.basename(filePath)} Q${qNumber} skipped: insufficient MCQ options.`);
      continue;
    }

    const answer = answerMap.get(qNumber) ?? null;
    if (!answer) {
      warnings.push(`${path.basename(filePath)} Q${qNumber} missing answer key.`);
    }

    questions.push({
      qNumber,
      type: isEmqStem ? "EMQ_STEM" : "SBA",
      stem,
      options,
      correctKey: answer,
      explanation: null,
      rationale: null,
      difficulty,
      ausScore,
      moduleCode,
      tagPaths,
      ranZcogDomains,
      metaTags,
      emqLocalId: currentEmq?.localId ?? null,
      source: {
        file: sourceFile,
        originalQNumber: qNumber,
        sectionTitle: currentSection,
        emqSetTitle: currentEmq?.title ?? undefined,
        stemHash: hashStem(stem),
      },
    });
  }

  return {
    file: filePath,
    questions,
    emqSets,
    warnings,
  };
}

function getHtmlElementChildren(node: HTMLElement) {
  return node.childNodes.filter((child): child is HTMLElement => {
    const candidate = child as Partial<HTMLElement> & { nodeType?: number };
    return candidate.nodeType === 1 && typeof candidate.tagName === "string";
  });
}

function getDirectText(node: HTMLElement, excludedTags: ReadonlySet<string> = new Set(["OL", "UL"])) {
  const parts: string[] = [];

  for (const child of node.childNodes) {
    const candidate = child as Partial<HTMLElement> & { nodeType?: number; rawText?: string; text?: string };
    if (candidate.nodeType === 3) {
      parts.push(candidate.rawText ?? candidate.text ?? "");
      continue;
    }

    if (candidate.nodeType !== 1 || typeof candidate.tagName !== "string") {
      continue;
    }

    if (excludedTags.has(candidate.tagName)) {
      continue;
    }

    if (candidate.tagName === "BR") {
      parts.push("\n");
      continue;
    }

    parts.push(getDirectText(child as HTMLElement, excludedTags));
  }

  return normalizeTableCellText(parts.join(""));
}

function nextMeaningfulElement(nodes: HTMLElement[], currentIndex: number) {
  for (let index = currentIndex + 1; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (normalizeTableCellText(node.text).length > 0) {
      return { node, index };
    }
  }
  return null;
}

function optionKeyFromIndex(index: number) {
  return String.fromCharCode(65 + index);
}

function listHasNestedQuestionItems(list: HTMLElement) {
  return getHtmlElementChildren(list)
    .filter((child) => child.tagName === "LI")
    .some((item) => getHtmlElementChildren(item).some((child) => child.tagName === "OL" || child.tagName === "UL"));
}

function parseHtmlOptionText(item: HTMLElement) {
  const directText = normalizeTableCellText(getDirectText(item));
  const fallbackText = normalizeTableCellText(item.text);
  const rawText = directText || fallbackText;
  const inlineAnswerMatch = rawText.match(/^(.*?)(?:\s*(?:🡪|->|=>|→|-&gt;|=&gt;)\s*([A-H])\b)\s*$/i);
  const rawTextWithoutInlineAnswer = inlineAnswerMatch?.[1]?.trim() || rawText;
  const hasTrailingAnswerMarker = /\s*\*+$/.test(rawText);
  const text = rawTextWithoutInlineAnswer.replace(/\s*\*+$/, "").trim();

  return {
    text: text || rawTextWithoutInlineAnswer || rawText,
    isMarkedCorrect: hasTrailingAnswerMarker || Boolean(item.querySelector("strong") || item.querySelector("b")),
    inlineAnswerKey: inlineAnswerMatch?.[2]?.toUpperCase() ?? null,
  };
}

function parseHtmlListItems(list: HTMLElement): ParsedHtmlListItem[] {
  return getHtmlElementChildren(list)
    .filter((child) => child.tagName === "LI")
    .map((item, index) => {
      const parsed = parseHtmlOptionText(item);
      return {
        key: optionKeyFromIndex(index),
        text: parsed.text,
        isMarkedCorrect: parsed.isMarkedCorrect,
        inlineAnswerKey: parsed.inlineAnswerKey,
      };
    })
    .filter((item) => item.text.length > 0);
}

function parseHtmlOptionList(list: HTMLElement, sourceLabel: string, qNumber: string) {
  const options: QuestionOption[] = [];
  const correctCandidates: string[] = [];
  const warnings: string[] = [];

  for (const item of parseHtmlListItems(list)) {
    options.push({ key: item.key, text: item.text });
    if (item.isMarkedCorrect) {
      correctCandidates.push(item.key);
    }
  }

  let correctKey: string | null = null;
  if (correctCandidates.length === 1) {
    correctKey = correctCandidates[0];
  } else if (correctCandidates.length > 1) {
    warnings.push(`${sourceLabel} Q${qNumber} has multiple highlighted answers in HTML fallback.`);
  }

  return { options, correctKey, warnings };
}

function parseHtmlHybridEmqList(list: HTMLElement, stem: string, filePath: string, sourceFile: string, currentSection: string | undefined, baseQNumber: string) {
  const listItems = parseHtmlListItems(list);
  const firstScenarioIndex = listItems.findIndex((item) => item.inlineAnswerKey);
  if (firstScenarioIndex < 2) {
    return null;
  }

  const optionItems = listItems.slice(0, firstScenarioIndex);
  const scenarioItems = listItems.slice(firstScenarioIndex);
  if (scenarioItems.length === 0 || scenarioItems.some((item) => !item.inlineAnswerKey)) {
    return null;
  }

  const allowedAnswerKeys = new Set(optionItems.map((item) => item.key));
  if (scenarioItems.some((item) => !item.inlineAnswerKey || !allowedAnswerKeys.has(item.inlineAnswerKey))) {
    return null;
  }

  const emqLocalId = `${path.basename(filePath)}::html-emq-${baseQNumber}-${hashStem(stem)}`;
  const emqTitle = stem || null;
  const optionList = optionItems.map((item) => ({ key: item.key, text: item.text }));
  const emqSet: ParsedEmqSet = {
    localId: emqLocalId,
    title: emqTitle,
    instructions: null,
    optionList,
    source: {
      file: sourceFile,
      sectionTitle: currentSection,
      emqSetTitle: emqTitle ?? undefined,
    },
  };

  const questions: ParsedQuestion[] = scenarioItems.map((item, index) => {
    const suffix = String.fromCharCode(65 + index);
    const qNumber = `${baseQNumber}${suffix}`;
    return {
      qNumber,
      type: "EMQ_STEM",
      stem: item.text,
      options: [],
      correctKey: item.inlineAnswerKey,
      explanation: null,
      rationale: null,
      difficulty: null,
      ausScore: null,
      moduleCode: null,
      tagPaths: [],
      ranZcogDomains: [],
      metaTags: [],
      emqLocalId,
      source: {
        file: sourceFile,
        originalQNumber: qNumber,
        sectionTitle: currentSection,
        emqSetTitle: emqTitle ?? undefined,
        stemHash: hashStem(item.text),
        parseNotes: ["html-fallback", "html-hybrid-emq"],
      },
    };
  });

  return {
    emqSet,
    questions,
  };
}

export function parseHtmlFallbackDoc(filePath: string, html: string, options: ParseDocxOptions = {}): ParsedDocx {
  const root = parseHtml(html);
  const sourceFile = normalizeSourceFilePath(filePath, options.contentRoot);
  const sourceLabel = path.basename(filePath);
  const nodes = getHtmlElementChildren(root);

  const questions: ParsedQuestion[] = [];
  const emqSets: ParsedEmqSet[] = [];
  const warnings: string[] = [];
  let currentSection: string | undefined;
  let questionCounter = 1;

  const pushQuestion = (stem: string, optionList: QuestionOption[], correctKey: string | null, qNumber = String(questionCounter++)) => {
    if (optionList.length < 2) {
      warnings.push(`${sourceLabel} Q${qNumber} skipped: insufficient MCQ options in HTML fallback.`);
      return;
    }

    if (!correctKey) {
      warnings.push(`${sourceLabel} Q${qNumber} missing answer key in HTML fallback.`);
    }

    questions.push({
      qNumber,
      type: "SBA",
      stem,
      options: optionList,
      correctKey,
      explanation: null,
      rationale: null,
      difficulty: null,
      ausScore: null,
      moduleCode: null,
      tagPaths: [],
      ranZcogDomains: [],
      metaTags: [],
      emqLocalId: null,
      source: {
        file: sourceFile,
        originalQNumber: qNumber,
        sectionTitle: currentSection,
        stemHash: hashStem(stem),
        parseNotes: ["html-fallback"],
      },
    });
  };

  const parseNestedQuestionList = (list: HTMLElement) => {
    const topLevelItems = getHtmlElementChildren(list).filter((child) => child.tagName === "LI");
    for (const item of topLevelItems) {
      const optionListNode = getHtmlElementChildren(item).find((child) => child.tagName === "OL" || child.tagName === "UL");
      const stem = getDirectText(item);
      if (!optionListNode || !stem) {
        continue;
      }

      const baseQNumber = String(questionCounter);
      const hybridEmq = parseHtmlHybridEmqList(optionListNode, stem, filePath, sourceFile, currentSection, baseQNumber);
      if (hybridEmq) {
        questionCounter += 1;
        emqSets.push(hybridEmq.emqSet);
        questions.push(...hybridEmq.questions);
        continue;
      }

      const qNumber = String(questionCounter);
      const parsedOptions = parseHtmlOptionList(optionListNode, sourceLabel, qNumber);
      warnings.push(...parsedOptions.warnings);
      pushQuestion(stem, parsedOptions.options, parsedOptions.correctKey);
    }
  };

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if ((node.tagName === "OL" || node.tagName === "UL") && listHasNestedQuestionItems(node)) {
      parseNestedQuestionList(node);
      continue;
    }

    if (node.tagName !== "P") {
      continue;
    }

    const text = normalizeTableCellText(node.text);
    if (!text) {
      continue;
    }

    if (/^EMQ\b/i.test(text)) {
      break;
    }

    if (/^(?:PAEDS EXAM Q.?S?|SBA|MCQ)$/i.test(text)) {
      currentSection = text;
      const next = nextMeaningfulElement(nodes, index);
      if (next?.node.tagName === "OL" && listHasNestedQuestionItems(next.node)) {
        const topLevelItems = getHtmlElementChildren(next.node).filter((child) => child.tagName === "LI");
        for (const item of topLevelItems) {
          const optionListNode = getHtmlElementChildren(item).find((child) => child.tagName === "OL" || child.tagName === "UL");
          if (!optionListNode) {
            continue;
          }

          const stem = getDirectText(item);
          if (!stem) {
            continue;
          }

          const baseQNumber = String(questionCounter);
          const hybridEmq = parseHtmlHybridEmqList(optionListNode, stem, filePath, sourceFile, currentSection, baseQNumber);
          if (hybridEmq) {
            questionCounter += 1;
            emqSets.push(hybridEmq.emqSet);
            questions.push(...hybridEmq.questions);
            continue;
          }

          const qNumber = String(questionCounter);
          const parsedOptions = parseHtmlOptionList(optionListNode, sourceLabel, qNumber);
          warnings.push(...parsedOptions.warnings);
          pushQuestion(stem, parsedOptions.options, parsedOptions.correctKey);
        }
        index = next.index;
      }
      continue;
    }

    const next = nextMeaningfulElement(nodes, index);
    if (!next || next.node.tagName !== "OL" || listHasNestedQuestionItems(next.node)) {
      continue;
    }

    const qNumber = String(questionCounter);
    const parsedOptions = parseHtmlOptionList(next.node, sourceLabel, qNumber);
    warnings.push(...parsedOptions.warnings);
    pushQuestion(text, parsedOptions.options, parsedOptions.correctKey);
    index = next.index;
  }

  return {
    file: filePath,
    questions,
    emqSets,
    warnings,
  };
}

export async function parseDocxFile(filePath: string, options: ParseDocxOptions = {}): Promise<ParsedDocx> {
  const rawTextResult = await mammoth.extractRawText({ path: filePath });
  const parsedText = parseDocxText(rawTextResult.value, filePath, options);
  if (parsedText.questions.length > 0 || parsedText.emqSets.length > 0) {
    return parsedText;
  }

  const htmlResult = await mammoth.convertToHtml({ path: filePath });
  const parsedHtml = parseHtmlFallbackDoc(filePath, htmlResult.value, options);
  if (parsedHtml.questions.length > 0 || parsedHtml.emqSets.length > 0) {
    for (const message of htmlResult.messages) {
      parsedHtml.warnings.push(`${path.basename(filePath)}: ${message.message}`);
    }
    return parsedHtml;
  }

  return parsedText;
}

function normalizeTableCellText(rawValue: string) {
  return rawValue.replace(/\s+/g, " ").trim();
}

function escapeMarkdownCell(value: string) {
  return value.replace(/\|/g, "\\|").trim();
}

function tableElementToRows(table: HTMLElement) {
  const rows: string[][] = [];
  for (const row of table.querySelectorAll("tr")) {
    const cells = row
      .querySelectorAll("th, td")
      .map((cell) => normalizeTableCellText(cell.text));
    if (cells.some((cell) => cell.length > 0)) {
      rows.push(cells);
    }
  }
  return rows;
}

function tableRowsToMarkdown(rows: string[][]) {
  if (rows.length === 0) {
    return null;
  }

  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  if (width === 0) {
    return null;
  }

  const normalizedRows = rows.map((row) => {
    const copy = row.slice(0, width);
    while (copy.length < width) {
      copy.push("");
    }
    return copy.map((cell) => escapeMarkdownCell(cell));
  });

  const header = normalizedRows[0];
  const divider = new Array(width).fill("---");
  const bodyRows = normalizedRows.slice(1);

  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${divider.join(" | ")} |`,
    ...bodyRows.map((row) => `| ${row.join(" | ")} |`),
  ];

  return lines.join("\n");
}

function parseCorrectAnswerText(value: string) {
  const dotMatch = value.match(/^([A-Z])\.\s*(.*)$/i);
  if (dotMatch) {
    return {
      correctOption: dotMatch[1].toUpperCase(),
      correctText: dotMatch[2].trim() || null,
    };
  }

  const match = value.match(/^([A-Z])\s*[—-]\s*(.*)$/i);
  if (!match) {
    const keyOnly = value.match(/^([A-Z])$/i);
    if (keyOnly) {
      return {
        correctOption: keyOnly[1].toUpperCase(),
        correctText: null,
      };
    }
    return {
      correctOption: null,
      correctText: value.trim().length > 0 ? value.trim() : null,
    };
  }
  return {
    correctOption: match[1].toUpperCase(),
    correctText: match[2].trim() || null,
  };
}

function asLabelAndValue(node: HTMLElement) {
  if (node.tagName !== "P") {
    return null;
  }
  const strong = node.querySelector("strong");
  if (!strong) {
    return null;
  }
  const label = normalizeTableCellText(strong.text).replace(/:$/, "");
  if (!label) {
    return null;
  }
  const fullText = normalizeTableCellText(node.text);
  const labelPrefix = `${label}:`;
  if (fullText.toLowerCase().startsWith(labelPrefix.toLowerCase())) {
    return {
      label,
      value: fullText.slice(labelPrefix.length).trim(),
    };
  }
  return {
    label,
    value: fullText.trim(),
  };
}

export async function parseExplanationDocxFile(filePath: string): Promise<ParsedExplanationDocx> {
  return parseExplanationDocxFileWithOptions(filePath, { mode: "auto" });
}

function parseCorrectAnswerLineValue(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  const dotMatch = normalized.match(/^([A-Z])\.\s*(.*)$/i);
  if (dotMatch) {
    return {
      correctOption: dotMatch[1].toUpperCase(),
      correctText: dotMatch[2].trim() || null,
    };
  }
  const dashMatch = normalized.match(/^([A-Z])\s*[—-]\s*(.*)$/i);
  if (dashMatch) {
    return {
      correctOption: dashMatch[1].toUpperCase(),
      correctText: dashMatch[2].trim() || null,
    };
  }
  const keyOnlyMatch = normalized.match(/^([A-Z])$/i);
  if (keyOnlyMatch) {
    return {
      correctOption: keyOnlyMatch[1].toUpperCase(),
      correctText: null,
    };
  }
  return {
    correctOption: null,
    correctText: normalized.length > 0 ? normalized : null,
  };
}

function parseParagraphOptionLine(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const match = normalized.match(/^([A-H])\.\s*(.+)$/i);
  if (!match) {
    return null;
  }
  return {
    key: match[1].toUpperCase(),
    text: match[2].trim(),
  };
}

function parseQuestionIdFromParagraph(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const match = normalized.match(/^Q(\d{4})$/i);
  if (!match) {
    return null;
  }
  return String(Number.parseInt(match[1], 10));
}

function isDividerLine(text: string) {
  return /^[_—-]{10,}$/.test(text.trim());
}

function normalizeParagraphLine(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function pushLine(lines: string[], value: string) {
  const normalized = normalizeParagraphLine(value);
  if (!normalized) {
    return;
  }
  lines.push(normalized);
}

function parseParagraphFormatQuestions(root: HTMLElement, sourceFile: string): ParsedExplanationDocx {
  const warnings: string[] = [];
  const questions: ParsedExplanationDocxQuestion[] = [];
  const paragraphs = root.querySelectorAll("p");

  let current: ParsedExplanationDocxQuestion | null = null;
  let activeSection: "core" | "option-by-option" | "five-second" | "explanation" | "decision" | null = null;
  let inOptionsSection = false;

  const finalizeCurrent = () => {
    if (!current) {
      return;
    }
    if (!current.stem || current.options.length < 2 || !current.correctOption) {
      warnings.push(`${sourceFile} Q${current.globalId.padStart(4, "0")} parsed with missing essential fields.`);
    }
    questions.push(current);
    current = null;
    activeSection = null;
    inOptionsSection = false;
  };

  for (const paragraph of paragraphs) {
    const line = normalizeParagraphLine(paragraph.text);
    if (!line) {
      continue;
    }
    if (isDividerLine(line)) {
      finalizeCurrent();
      continue;
    }

    const qId = parseQuestionIdFromParagraph(line);
    if (qId) {
      finalizeCurrent();
      current = {
        globalId: qId,
        stream: SUBJECT_CONFIG.subjectName,
        topic: null,
        stem: "",
        options: [],
        correctOption: null,
        correctText: null,
        coreIdea: null,
        explanationLines: [],
        decisionLines: [],
        optionByOptionLines: [],
        fiveSecondExamRuleLines: [],
        optionExplanations: {},
        optionCrossCheckTableMarkdown: null,
        optionCrossCheckRows: 0,
        sourceFile,
      };
      continue;
    }

    if (!current) {
      continue;
    }

    const lower = line.toLowerCase();
    if (lower.startsWith("topic:")) {
      current.topic = line.slice(6).trim() || null;
      activeSection = null;
      inOptionsSection = false;
      continue;
    }
    if (lower === "question") {
      activeSection = null;
      inOptionsSection = false;
      continue;
    }
    if (lower.startsWith("question:")) {
      current.stem = line.slice(9).trim();
      activeSection = null;
      inOptionsSection = false;
      continue;
    }
    if (!current.stem && !lower.startsWith("options") && !lower.startsWith("correct answer:")) {
      current.stem = line;
      continue;
    }
    if (lower === "options") {
      inOptionsSection = true;
      activeSection = null;
      continue;
    }
    if (lower.startsWith("correct answer:")) {
      const parsed = parseCorrectAnswerLineValue(line.slice("correct answer:".length).trim());
      current.correctOption = parsed.correctOption;
      current.correctText = parsed.correctText;
      inOptionsSection = false;
      activeSection = null;
      continue;
    }
    if (lower.startsWith("core concept")) {
      activeSection = "core";
      inOptionsSection = false;
      continue;
    }
    if (lower.startsWith("option-by-option")) {
      activeSection = "option-by-option";
      inOptionsSection = false;
      continue;
    }
    if (lower.startsWith("5-second exam rule")) {
      activeSection = "five-second";
      inOptionsSection = false;
      continue;
    }

    if (inOptionsSection) {
      const option = parseParagraphOptionLine(line);
      if (option) {
        current.options.push(option);
      }
      continue;
    }

    if (activeSection === "core") {
      pushLine(current.explanationLines, line);
      if (!current.coreIdea) {
        current.coreIdea = line;
      }
      continue;
    }

    if (activeSection === "option-by-option") {
      const optionMatch = line.match(/^([A-H])\.\s*(.+)$/i);
      if (optionMatch) {
        const key = optionMatch[1].toUpperCase();
        const text = optionMatch[2].trim();
        current.optionExplanations[key] = text;
      }
      pushLine(current.optionByOptionLines, line);
      continue;
    }

    if (activeSection === "five-second") {
      pushLine(current.fiveSecondExamRuleLines, line);
      continue;
    }
  }

  finalizeCurrent();

  const dedupe = new Set<string>();
  const dedupedQuestions: ParsedExplanationDocxQuestion[] = [];
  for (const question of questions) {
    if (dedupe.has(question.globalId)) {
      warnings.push(`${sourceFile} Q${question.globalId.padStart(4, "0")} duplicated; keeping first occurrence.`);
      continue;
    }
    dedupe.add(question.globalId);
    dedupedQuestions.push(question);
  }

  return {
    file: sourceFile,
    questions: dedupedQuestions,
    warnings,
  };
}

export async function parseExplanationDocxFileWithOptions(
  filePath: string,
  options: ParseExplanationDocxOptions = {},
): Promise<ParsedExplanationDocx> {
  const warnings: string[] = [];
  const result = await mammoth.convertToHtml({ path: filePath });
  const root = parseHtml(result.value);
  const sourceFile = path.basename(filePath);
  const mode = options.mode ?? "auto";

  if (mode !== "table") {
    const paragraphQuestions = root
      .querySelectorAll("p")
      .map((p) => normalizeParagraphLine(p.text))
      .filter(Boolean)
      .filter((line) => /^Q\d{4}$/i.test(line)).length;
    const tableCount = root.querySelectorAll("table").length;
    if (mode === "paragraph" || (mode === "auto" && paragraphQuestions > 0 && tableCount === 0)) {
      const parsedParagraph = parseParagraphFormatQuestions(root, sourceFile);
      for (const message of result.messages) {
        parsedParagraph.warnings.push(`${sourceFile}: ${message.message}`);
      }
      return parsedParagraph;
    }
  }

  const questions: ParsedExplanationDocxQuestion[] = [];
  const headers = root.querySelectorAll("h2");

  for (const header of headers) {
    const headerText = normalizeTableCellText(header.text);
    const headerMatch = headerText.match(/^Q(\d{4})$/i);
    if (!headerMatch) {
      continue;
    }

    const globalId = String(Number.parseInt(headerMatch[1], 10));
    const question: ParsedExplanationDocxQuestion = {
      globalId,
      stream: null,
      topic: null,
      stem: "",
      options: [],
      correctOption: null,
      correctText: null,
      coreIdea: null,
      explanationLines: [],
      decisionLines: [],
      optionByOptionLines: [],
      fiveSecondExamRuleLines: [],
      optionExplanations: {},
      optionCrossCheckTableMarkdown: null,
      optionCrossCheckRows: 0,
      sourceFile,
    };

    let activeSection:
      | "question"
      | "options"
      | "core"
      | "explanation"
      | "decision"
      | "option-by-option"
      | "five-second"
      | null = null;
    let currentOptionByOptionKey: string | null = null;
    let cursor = header.nextElementSibling;

    const appendOptionByOptionText = (key: string, text: string) => {
      const normalizedKey = key.toUpperCase().trim();
      const normalizedText = normalizeTableCellText(text);
      if (!normalizedKey || !normalizedText) {
        return;
      }
      const existing = question.optionExplanations[normalizedKey];
      question.optionExplanations[normalizedKey] = existing
        ? `${existing} ${normalizedText}`.trim()
        : normalizedText;
    };

    while (cursor && cursor.tagName !== "H2") {
      if (cursor.tagName === "H3") {
        const heading = normalizeTableCellText(cursor.text).toLowerCase();
        currentOptionByOptionKey = null;

        if (heading === "question") {
          activeSection = "question";
          cursor = cursor.nextElementSibling;
          continue;
        }
        if (heading === "options") {
          activeSection = "options";
          cursor = cursor.nextElementSibling;
          continue;
        }
        if (heading.startsWith("core idea") || heading.startsWith("core concept")) {
          activeSection = "core";
          cursor = cursor.nextElementSibling;
          continue;
        }
        if (
          heading.startsWith("why this is correct")
          || heading.startsWith("why it's correct")
          || heading.startsWith("why it’s correct")
        ) {
          activeSection = "explanation";
          cursor = cursor.nextElementSibling;
          continue;
        }
        if (heading.startsWith("decision approach")) {
          activeSection = "decision";
          cursor = cursor.nextElementSibling;
          continue;
        }
        if (heading.startsWith("option-by-option") || heading.startsWith("option cross-check")) {
          activeSection = "option-by-option";
          cursor = cursor.nextElementSibling;
          continue;
        }
        if (heading.startsWith("5-second exam rule")) {
          activeSection = "five-second";
          cursor = cursor.nextElementSibling;
          continue;
        }
      }

      const labelAndValue = asLabelAndValue(cursor);
      if (labelAndValue) {
        const normalizedLabel = labelAndValue.label.toLowerCase();
        const value = labelAndValue.value;

        if (normalizedLabel.startsWith("stream")) {
          question.stream = value || null;
          activeSection = null;
          cursor = cursor.nextElementSibling;
          continue;
        }
        if (normalizedLabel.startsWith("topic")) {
          question.topic = value || null;
          activeSection = null;
          cursor = cursor.nextElementSibling;
          continue;
        }
        if (normalizedLabel.startsWith("stem")) {
          question.stem = value;
          activeSection = null;
          cursor = cursor.nextElementSibling;
          continue;
        }
        if (normalizedLabel.startsWith("correct answer")) {
          const parsedCorrect = parseCorrectAnswerText(value);
          question.correctOption = parsedCorrect.correctOption;
          question.correctText = parsedCorrect.correctText;
          activeSection = null;
          cursor = cursor.nextElementSibling;
          continue;
        }
        if (normalizedLabel.startsWith("core idea")) {
          question.coreIdea = value || null;
          activeSection = "core";
          if (value) {
            question.explanationLines.push(value);
          }
          cursor = cursor.nextElementSibling;
          continue;
        }
        if (normalizedLabel.startsWith("core concept")) {
          question.coreIdea = value || null;
          activeSection = "core";
          if (value) {
            question.explanationLines.push(value);
          }
          cursor = cursor.nextElementSibling;
          continue;
        }
        if (
          normalizedLabel.startsWith("why this is correct")
          || normalizedLabel.startsWith("why it's correct")
          || normalizedLabel.startsWith("why it’s correct")
        ) {
          activeSection = "explanation";
          if (value) {
            question.explanationLines.push(value);
          }
          cursor = cursor.nextElementSibling;
          continue;
        }
        if (normalizedLabel.startsWith("decision approach")) {
          activeSection = "decision";
          if (value) {
            question.decisionLines.push(value);
          }
          cursor = cursor.nextElementSibling;
          continue;
        }
        if (normalizedLabel.startsWith("option-by-option")) {
          activeSection = "option-by-option";
          if (value) {
            question.optionByOptionLines.push(value);
          }
          cursor = cursor.nextElementSibling;
          continue;
        }
        if (normalizedLabel.startsWith("5-second exam rule")) {
          activeSection = "five-second";
          if (value) {
            question.fiveSecondExamRuleLines.push(value);
          }
          cursor = cursor.nextElementSibling;
          continue;
        }
        if (normalizedLabel.startsWith("option cross-check")) {
          activeSection = "option-by-option";
          cursor = cursor.nextElementSibling;
          continue;
        }
      }

      if (cursor.tagName === "UL") {
        const bulletLines = cursor
          .querySelectorAll("li")
          .map((item) => normalizeTableCellText(item.text))
          .filter(Boolean);
        if (activeSection === "explanation") {
          question.explanationLines.push(...bulletLines);
        } else if (activeSection === "core") {
          question.explanationLines.push(...bulletLines);
          if (!question.coreIdea && bulletLines[0]) {
            question.coreIdea = bulletLines[0];
          }
        } else if (activeSection === "decision") {
          question.decisionLines.push(...bulletLines);
        } else if (activeSection === "option-by-option") {
          question.optionByOptionLines.push(...bulletLines);
          if (currentOptionByOptionKey) {
            for (const bulletLine of bulletLines) {
              appendOptionByOptionText(currentOptionByOptionKey, bulletLine);
            }
          }
        } else if (activeSection === "five-second") {
          question.fiveSecondExamRuleLines.push(...bulletLines);
        }
        cursor = cursor.nextElementSibling;
        continue;
      }

      if (cursor.tagName === "P") {
        const line = normalizeTableCellText(cursor.text);
        if (!line || /^[-—]{4,}$/.test(line)) {
          cursor = cursor.nextElementSibling;
          continue;
        }

        const topicMatch = line.match(/^topic\s*:\s*(.+)$/i);
        if (topicMatch) {
          question.topic = topicMatch[1].trim() || null;
          cursor = cursor.nextElementSibling;
          continue;
        }

        const correctAnswerMatch = line.match(/^correct answer(?:\s*\([^)]*\))?\s*:\s*(.+)$/i);
        if (correctAnswerMatch) {
          const parsedCorrect = parseCorrectAnswerLineValue(correctAnswerMatch[1] ?? "");
          question.correctOption = parsedCorrect.correctOption;
          question.correctText = parsedCorrect.correctText;
          activeSection = null;
          currentOptionByOptionKey = null;
          cursor = cursor.nextElementSibling;
          continue;
        }

        if (activeSection === "question") {
          question.stem = question.stem ? `${question.stem} ${line}`.trim() : line;
          cursor = cursor.nextElementSibling;
          continue;
        }

        if (activeSection === "options") {
          const option = parseParagraphOptionLine(line);
          if (option) {
            question.options.push(option);
          } else if (question.options.length > 0) {
            const lastOption = question.options[question.options.length - 1];
            lastOption.text = `${lastOption.text} ${line}`.trim();
          }
          cursor = cursor.nextElementSibling;
          continue;
        }

        if (activeSection === "core") {
          question.explanationLines.push(line);
          if (!question.coreIdea) {
            question.coreIdea = line;
          }
          cursor = cursor.nextElementSibling;
          continue;
        }

        if (activeSection === "explanation") {
          question.explanationLines.push(line);
          cursor = cursor.nextElementSibling;
          continue;
        }

        if (activeSection === "decision") {
          question.decisionLines.push(line);
          cursor = cursor.nextElementSibling;
          continue;
        }

        if (activeSection === "option-by-option") {
          const strongNode = cursor.querySelector("strong");
          const strongText = strongNode ? normalizeTableCellText(strongNode.text) : "";
          const headingOption = parseParagraphOptionLine(strongText || line);

          if (headingOption) {
            currentOptionByOptionKey = headingOption.key;
            question.optionByOptionLines.push(`${headingOption.key}. ${headingOption.text}`);
            appendOptionByOptionText(headingOption.key, headingOption.text);
            cursor = cursor.nextElementSibling;
            continue;
          }

          question.optionByOptionLines.push(line);
          if (currentOptionByOptionKey) {
            appendOptionByOptionText(currentOptionByOptionKey, line);
          }
          cursor = cursor.nextElementSibling;
          continue;
        }

        if (activeSection === "five-second") {
          question.fiveSecondExamRuleLines.push(line);
          cursor = cursor.nextElementSibling;
          continue;
        }
      }

      if (cursor.tagName === "TABLE") {
        const rows = tableElementToRows(cursor);
        const headerRow = rows[0]?.map((cell) => cell.toLowerCase()) ?? [];
        const isOptionTextTable = headerRow.length >= 2
          && headerRow[0] === "option"
          && headerRow[1] === "text";
        const isOptionCrossCheckTable = headerRow.length >= 4
          && headerRow[0] === "option"
          && headerRow[1].includes("what it means")
          && headerRow[3].includes("here, why");

        if (isOptionTextTable) {
          question.options = rows
            .slice(1)
            .map((row) => ({
              key: row[0]?.toUpperCase().trim() ?? "",
              text: row[1]?.trim() ?? "",
            }))
            .filter((option) => option.key.length === 1 && option.text.length > 0);
        } else if (isOptionCrossCheckTable) {
          question.optionCrossCheckTableMarkdown = tableRowsToMarkdown(rows);
          question.optionCrossCheckRows = Math.max(0, rows.length - 1);
          const optionExplanations: Record<string, string> = {};
          for (const row of rows.slice(1)) {
            const key = row[0]?.toUpperCase().trim() ?? "";
            const whyNot = row[3]?.trim() ?? "";
            if (!/^[A-Z]$/.test(key) || !whyNot) {
              continue;
            }
            optionExplanations[key] = whyNot;
          }
          question.optionExplanations = optionExplanations;
        }
      }

      cursor = cursor.nextElementSibling;
    }

    if (!question.stem || question.options.length < 2 || !question.correctOption) {
      warnings.push(`${sourceFile} ${headerText} was parsed with missing essential fields.`);
    }
    questions.push(question);
  }

  if (result.messages.length > 0) {
    for (const message of result.messages) {
      warnings.push(`${sourceFile}: ${message.message}`);
    }
  }

  return {
    file: filePath,
    questions,
    warnings,
  };
}
