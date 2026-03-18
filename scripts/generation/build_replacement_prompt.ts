import fs from "node:fs/promises";
import path from "node:path";

import type { BatchState, SourcePack, WorkflowBatch, WorkflowManifest } from "./lib/contracts";
import { resolveWorkflowPath } from "./lib/manifest";

async function readOperationalFile(repoRoot: string, relativePath: string) {
  return fs.readFile(resolveWorkflowPath(repoRoot, relativePath), "utf8");
}

function renderFamilyList(title: string, entries: string[]) {
  if (entries.length === 0) {
    return `${title}\n- none recorded yet`;
  }

  return [
    title,
    ...entries.map((entry) => `- ${entry}`),
  ].join("\n");
}

function renderSourcePack(sourcePack: SourcePack) {
  if (sourcePack.items.length === 0) {
    return "- No internal retrieval chunks were available. Stay conservative and use only clearly supported note-derived claims.";
  }

  return sourcePack.items
    .slice(0, 4)
    .map((item, index) => {
      const pageLabel = item.pageStart ? ` p.${item.pageStart}${item.pageEnd && item.pageEnd !== item.pageStart ? `-${item.pageEnd}` : ""}` : "";
      const heading = item.heading ? ` | ${item.heading}` : "";
      return `${index + 1}. ${item.sourceRef}${pageLabel}${heading}\n${item.excerpt}`;
    })
    .join("\n\n");
}

export async function buildReplacementPrompt({
  repoRoot,
  manifest,
  batch,
  state,
  sourcePack,
  requestedCount,
  additionalAvoidAngleFamilies = [],
}: {
  repoRoot: string;
  manifest: WorkflowManifest;
  batch: WorkflowBatch;
  state: BatchState;
  sourcePack: SourcePack;
  requestedCount?: number;
  additionalAvoidAngleFamilies?: string[];
}) {
  const [sourcePriorityText, rejectedPatternsText] = await Promise.all([
    readOperationalFile(repoRoot, path.join(manifest.rootDir, "SOURCE_PRIORITY.md")),
    readOperationalFile(repoRoot, manifest.rejectedPatternsPath),
  ]);

  const remaining = requestedCount ?? state.remaining;

  return [
    "Use only the SOURCE PACK EXCERPTS embedded in this prompt for factual and examinable content. They are the full allowed corpus for this call.",
    "The embedded source-priority and rejected-pattern text is operational guidance only, not extra factual source material.",
    "Do not browse for drafting. Do not use external sources. Do not add unsupported examinable facts.",
    "Do not inspect repository files, tests, docs, schemas, prompts, or run shell commands before answering.",
    "If the source pack feels incomplete, stay conservative and draft only from what is explicitly supported here.",
    `Evidence mode: ${manifest.evidenceMode}.`,
    "",
    "Follow source priority strictly:",
    sourcePriorityText.trim(),
    "",
    `You are generating replacement questions only for batch \`${batch.batchId}\`.`,
    "",
    "Context:",
    `- \`${batch.batchId}\` target was \`${batch.targetCount}\` questions`,
    `- \`${state.acceptedTotal}\` questions are already accepted`,
    `- \`${remaining}\` questions still need replacement`,
    "",
    "Batch scope remains:",
    `- curriculum area: \`${batch.curriculumArea}\``,
    `- topic cluster: \`${batch.topicCluster}\``,
    `- exact subtopics: \`${batch.subtopics.join("; ")}\``,
    "",
    "Task:",
    `- generate exactly \`${remaining}\` new replacement questions only`,
    "- stay inside the same topic scope",
    "- do not repeat accepted or rejected angle families",
    "- do not imitate or paraphrase past-question stems",
    "- if a concept feels too close to a prior family, skip it and use another angle from the same scope",
    ...(additionalAvoidAngleFamilies.length > 0
      ? [
          "- also avoid these angle families already used in this same attempt:",
          ...additionalAvoidAngleFamilies.map((entry) => `  - ${entry}`),
        ]
      : []),
    "",
    renderFamilyList("Accepted angle families to avoid:", state.acceptedAngleFamilies),
    "",
    renderFamilyList("Rejected or overlapping angle families to avoid:", state.rejectedAngleFamilies),
    "",
    "Batch-specific pitfalls:",
    `- ${batch.overlapRisk}`,
    ...state.overlapWarnings.map((warning) => `- ${warning}`),
    "",
    "Retrieved internal source pack:",
    renderSourcePack(sourcePack),
    "",
    "Rejected pattern families to avoid:",
    rejectedPatternsText.trim(),
    "",
    "Hard rules:",
    "- SBA only",
    "- exactly 5 options `A` to `E`",
    "- one best answer only",
    "- Australian paediatrics framing",
    "- SI units where relevant",
    "- education-only, not medical advice",
    manifest.evidenceMode === "strict_internal" ? "- all citations internal only" : "- keep internal citations primary; external support belongs only where clearly allowed by the workflow mode",
    "",
    "Output requirements:",
    "- return one JSON object only",
    "- top-level key must be `questions`",
    `- generate exactly \`${remaining}\` questions`,
    "- each item must include: stem_markdown, options A-E, correctKey, explanation_markdown, why_others_wrong for the four incorrect options, key_takeaways, tags, moduleCode, difficulty, ausScore, citations",
    `- tags must not include the question type; set tags[0] to the exact curriculum area \`${batch.curriculumArea}\` and tags[1] to the exact topic cluster \`${batch.topicCluster}\``,
    "- `why_others_wrong` must include real explanations for the 4 incorrect options; if the schema also requires the correct-option key, keep that entry brief and neutral",
    manifest.evidenceMode === "strict_internal"
      ? "- every citation must use `type: \"internal\"`; always include `source`, `title`, `page`, and `url` keys; set `page` or `url` to `null` when the source pack does not clearly support them"
      : "- keep citations internal-first; always include `source`, `title`, `page`, and `url` keys; set `page` or `url` to `null` unless the workflow mode explicitly permits a traceable external citation",
    "- the response must satisfy the provided JSON schema exactly",
    "- do not open OUTPUT_SPEC, tests, validators, or schemas; the required contract is already stated here",
    "",
    "Before answering, silently self-check that:",
    "- these are replacements, not paraphrases of prior items",
    "- the set is clinically applied and genuinely different in teaching point",
    "- the response is valid JSON only",
    "",
    "Return JSON only.",
  ].join("\n");
}
