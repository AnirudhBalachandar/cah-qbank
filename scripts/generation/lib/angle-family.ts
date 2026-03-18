import type { GeneratedQuestionPayload } from "@/lib/server/generation/validator";

const STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "against",
  "also",
  "an",
  "and",
  "are",
  "because",
  "best",
  "both",
  "but",
  "can",
  "child",
  "children",
  "clinic",
  "during",
  "for",
  "from",
  "has",
  "have",
  "her",
  "his",
  "how",
  "into",
  "just",
  "most",
  "more",
  "next",
  "not",
  "now",
  "old",
  "only",
  "other",
  "patient",
  "review",
  "school",
  "she",
  "that",
  "their",
  "them",
  "there",
  "they",
  "this",
  "what",
  "when",
  "which",
  "with",
  "year",
  "years",
  "young",
]);

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/[`*_>#()[\]{}:;,.!?/\\-]+/g, " ")
    .replace(/\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keywords(text: string, limit: number) {
  const counts = new Map<string, number>();
  for (const token of normalizeText(text).split(" ")) {
    if (token.length < 4 || STOPWORDS.has(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([token]) => token);
}

function jaccardSimilarity(aTokens: string[], bTokens: string[]) {
  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  if (aSet.size === 0 || bSet.size === 0) return 0;

  let intersection = 0;
  for (const token of aSet) {
    if (bSet.has(token)) intersection += 1;
  }

  return intersection / new Set([...aSet, ...bSet]).size;
}

export function deriveAngleFamily(question: GeneratedQuestionPayload["questions"][number]) {
  const correctOption = question.options.find((option) => option.key === question.correctKey)?.text ?? "";
  const stemKeywords = keywords(question.stem_markdown, 6);
  const explanationKeywords = keywords(question.explanation_markdown, 4);
  const answerKeywords = keywords(correctOption, 4);
  const tagTokens = question.tags.slice(0, 3).map((tag) => normalizeText(tag).replace(/\s+/g, "-"));

  return [...tagTokens, ...stemKeywords.slice(0, 4), ...answerKeywords.slice(0, 3), ...explanationKeywords.slice(0, 2)]
    .filter(Boolean)
    .join(" | ");
}

export function angleFamilySimilarity(a: string, b: string) {
  return jaccardSimilarity(a.split("|").map((token) => token.trim()), b.split("|").map((token) => token.trim()));
}

export function uniqueAngleFamilies(families: string[]) {
  return Array.from(new Set(families.map((family) => family.trim()).filter(Boolean)));
}
