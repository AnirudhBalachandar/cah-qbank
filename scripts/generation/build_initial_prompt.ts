import type { SourcePack, WorkflowBatch, WorkflowManifest } from "./lib/contracts";

const STYLE_MIX_LEGEND: Record<string, string[]> = {
  A: [
    "4 counselling/explanation",
    "3 screening/red-flag recognition",
    "3 management/follow-up",
    "2 diagnostic discrimination",
  ],
  B: [
    "3 investigation/interpretation",
    "3 diagnostic discrimination",
    "3 management/follow-up",
    "3 complication/prevention",
  ],
  C: [
    "4 immediate prioritisation/escalation",
    "3 first-line management",
    "3 complication recognition",
    "2 investigation/monitoring",
  ],
  D: [
    "3 long-term management/follow-up",
    "3 counselling/adherence/prevention",
    "3 monitoring/complication",
    "3 diagnostic discrimination",
  ],
  E: [
    "4 screening/assessment",
    "3 differential discrimination",
    "3 support/management",
    "2 counselling/communication",
  ],
  F: [
    "4 imaging/lab/procedure interpretation",
    "3 next-step management",
    "3 safety/contraindications",
    "2 counselling",
  ],
  G: [
    "4 anatomy/physiology-to-clinic application",
    "3 syndrome/feature discrimination",
    "3 investigation selection",
    "2 management/counselling",
  ],
};

function renderSourcePack(sourcePack: SourcePack) {
  if (sourcePack.items.length === 0) {
    return "- No internal retrieval chunks were available. Stay conservative and use only clearly supported note-derived claims.";
  }

  return sourcePack.items
    .slice(0, 2)
    .map((item, index) => {
      const pageLabel = item.pageStart ? ` p.${item.pageStart}${item.pageEnd && item.pageEnd !== item.pageStart ? `-${item.pageEnd}` : ""}` : "";
      const heading = item.heading ? ` | ${item.heading}` : "";
      return `${index + 1}. ${item.sourceRef}${pageLabel}${heading}\n${item.excerpt}`;
    })
    .join("\n\n");
}

export async function buildInitialPrompt({
  manifest,
  batch,
  sourcePack,
  requestedCount,
  additionalAvoidAngleFamilies = [],
}: {
  manifest: WorkflowManifest;
  batch: WorkflowBatch;
  sourcePack: SourcePack;
  requestedCount?: number;
  additionalAvoidAngleFamilies?: string[];
}) {
  const styleMixLines = STYLE_MIX_LEGEND[batch.styleMix] ?? ["Use the preferred style mix in the batch brief."];
  const effectiveCount = requestedCount ?? batch.targetCount;

  return [
    "Use only the SOURCE PACK EXCERPTS embedded in this prompt for factual and examinable content. They are the full allowed corpus for this call.",
    "Operational instructions in this prompt are workflow guidance only, not extra factual source material.",
    "Do not browse. Do not use external sources. Do not add unsupported examinable facts.",
    "Do not inspect repository files, tests, docs, schemas, prompts, or run shell commands before answering.",
    "If the source pack feels incomplete, stay conservative and draft only from what is explicitly supported here.",
    `Evidence mode: ${manifest.evidenceMode}.`,
    "",
    "Follow source priority strictly:",
    "- Louisa notes first.",
    "- CAH Bible second for gaps or clarification only.",
    "- Never use the question zip as factual authority.",
    "",
    "You are generating one notes-first batch only.",
    "",
    "Batch metadata:",
    `- batch id: \`${batch.batchId}\``,
    `- curriculum area: \`${batch.curriculumArea}\``,
    `- topic cluster: \`${batch.topicCluster}\``,
    `- exact subtopics: \`${batch.subtopics.join("; ")}\``,
    `- target question count for this generation call: \`${effectiveCount}\``,
    `- preferred question style mix: \`${batch.styleMix}\``,
    `- source priority notes: \`${batch.sourcePriorityNotes}\``,
    `- overlap-risk notes: \`${batch.overlapRisk}\``,
    "",
    "Task:",
    "- generate only this requested batch",
    "- do not drift into other subtopics",
    "- keep the questions grounded in the note PDFs first",
    "- do not imitate or paraphrase past-question stems",
    "- do not recreate past-question clue bundles or lead-ins",
    ...(additionalAvoidAngleFamilies.length > 0
      ? [
          "- also avoid these angle families already used in this same batch generation:",
          ...additionalAvoidAngleFamilies.map((entry) => `  - ${entry}`),
        ]
      : []),
    "",
    "Hard rules:",
    "- SBA only",
    "- exactly 5 options `A` to `E`",
    "- one best answer only",
    "- Australian paediatrics framing",
    "- SI units where relevant",
    "- education-only, not medical advice",
    manifest.evidenceMode === "strict_internal" ? "- all citations internal only" : "- keep internal citations primary; external support belongs only where clearly allowed by the workflow mode",
    "- prefer note-PDF citations over question-zip citations",
    "",
    "Originality rules:",
    "- prefer counselling, follow-up, discriminator, interpretation, explanation, prevention, and complication questions",
    "- keep items clinically applied and family/practice relevant where possible",
    "- if a concept feels too close to past-question wording, skip it and replace it with another subtopic item from the same batch",
    "",
    effectiveCount === 1
      ? `For this single-question call, produce one style-\`${batch.styleMix}\` item that still fits the batch's intended mix.`
      : `Style mix \`${batch.styleMix}\` target:`,
    ...(effectiveCount === 1 ? [] : styleMixLines.map((line) => `- ${line}`)),
    "",
    "Retrieved internal source pack:",
    renderSourcePack(sourcePack),
    "",
    "Output requirements:",
    "- return one JSON object only",
    "- top-level key must be `questions`",
    `- generate exactly \`${effectiveCount}\` questions`,
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
    "- the batch is grounded in the notes first",
    "- the batch does not feel like a rewrite of the question zip",
    "- the response is valid JSON only",
    "",
    "Return JSON only.",
  ].join("\n");
}
