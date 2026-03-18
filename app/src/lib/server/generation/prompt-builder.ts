import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { SUBJECT_CONFIG } from "@cah-qbank/domain";

import type { RetrievedChunk } from "@/lib/server/retrieval/internal";
import type { ExternalSnippet } from "@/lib/server/retrieval/external";

export async function loadStyleSpec() {
  const directPath = path.join(process.cwd(), "docs", "style_spec.md");
  const fallbackPath = path.join(process.cwd(), "..", "docs", "style_spec.md");
  const styleSpecPath = existsSync(directPath) ? directPath : fallbackPath;
  return fs.readFile(styleSpecPath, "utf8");
}

export async function buildGenerationPrompt({
  weaknessTagNames,
  strictness,
  count,
  internalChunks,
  externalSnippets,
}: {
  weaknessTagNames: string[];
  strictness: "strict_internal" | "augmented";
  count: number;
  internalChunks: RetrievedChunk[];
  externalSnippets: ExternalSnippet[];
}) {
  const styleSpec = await loadStyleSpec();

  const internalContext = internalChunks
    .map((chunk, index) => `INTERNAL_${index + 1}: ${chunk.sourceRef}${chunk.pageStart ? ` p.${chunk.pageStart}` : ""}\n${chunk.text}`)
    .join("\n\n");

  const externalContext = externalSnippets
    .map((snippet, index) => `EXTERNAL_${index + 1}: ${snippet.title} (${snippet.sourceRef})\n${snippet.excerpt}`)
    .join("\n\n");

  return `You are generating original ${SUBJECT_CONFIG.subjectName} revision questions for study.

STRICT RULES:
- Generate exactly ${count} questions.
- MCQ-only platform: produce SBA questions with options A-E.
- Do not copy existing stems/options verbatim.
- Keep Sydney Medical School paediatrics framing and Australian terminology.
- Include citations for each question.
- ${strictness === "strict_internal" ? "Use INTERNAL context only for examinable facts; external citations are forbidden." : "Prefer INTERNAL context; EXTERNAL context may be used for clarification."}

Weakness tags:
${weaknessTagNames.join("; ")}

STYLE SPEC:
${styleSpec}

INTERNAL CONTEXT:
${internalContext || "(none)"}

${strictness === "augmented" ? `EXTERNAL CONTEXT:\n${externalContext || "(none)"}\n` : ""}

Return JSON matching the required schema only.`;
}
