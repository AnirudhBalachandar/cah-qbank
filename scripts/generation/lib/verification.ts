import path from "node:path";

import type { GeneratedQuestionPayload } from "@/lib/server/generation/validator";

import {
  verificationReportSchema,
  type EvidenceMode,
  type VerificationReport,
  type WorkflowBatch,
  type WorkflowManifest,
} from "./contracts";
import { runCodexStructuredOutput } from "./codex-runner";

const AUSTRALIA_TRIGGER_PATTERN =
  /\b(australia|australian|nsw|new south wales|medicare|consent|gillick|age of consent|immunisation schedule|schn|trapeze|policy|legal|law)\b/i;
export const VERIFICATION_TIMEOUT_MS = 20_000;

type VerificationClaimCandidate = {
  questionIndex: number;
  claim: string;
};

type StructuredOutputRunner = typeof runCodexStructuredOutput;

function extractClaimCandidates(payload: GeneratedQuestionPayload) {
  return payload.questions.flatMap((question, questionIndex) => {
    const stem = question.stem_markdown;
    const explanation = question.explanation_markdown;
    const candidateText = `${stem}\n${explanation}`;
    if (!AUSTRALIA_TRIGGER_PATTERN.test(candidateText)) {
      return [];
    }

    return [
      {
        questionIndex,
        claim: stem.replace(/\s+/g, " ").trim(),
      },
    ];
  });
}

function verificationFallbackFindingMessage(error: unknown) {
  return `Australian verification skipped because the verifier failed or timed out: ${
    error instanceof Error ? error.message : String(error)
  }`;
}

function buildVerificationFailureReport({
  manifest,
  batch,
  attempt,
  candidates,
  error,
}: {
  manifest: WorkflowManifest;
  batch: WorkflowBatch;
  attempt: number;
  candidates: VerificationClaimCandidate[];
  error: unknown;
}) {
  return verificationReportSchema.parse({
    workflowId: manifest.workflowId,
    batchId: batch.batchId,
    attempt,
    evidenceMode: manifest.evidenceMode,
    findings: candidates.map((candidate) => ({
      questionIndex: candidate.questionIndex,
      claim: candidate.claim,
      status: "needs_human_decision",
      riskLevel: "medium",
      suggestedChange: verificationFallbackFindingMessage(error),
      changeAllowedInMode: false,
      sources: [],
    })),
  });
}

export async function runAustralianVerification({
  repoRoot,
  manifest,
  batch,
  payload,
  attempt,
  runStructuredOutput = runCodexStructuredOutput,
  timeoutMs = VERIFICATION_TIMEOUT_MS,
}: {
  repoRoot: string;
  manifest: WorkflowManifest;
  batch: WorkflowBatch;
  payload: GeneratedQuestionPayload;
  attempt: number;
  runStructuredOutput?: StructuredOutputRunner;
  timeoutMs?: number;
}): Promise<VerificationReport> {
  const candidates = extractClaimCandidates(payload);
  if (candidates.length === 0) {
    return verificationReportSchema.parse({
      workflowId: manifest.workflowId,
      batchId: batch.batchId,
      attempt,
      evidenceMode: manifest.evidenceMode,
      findings: [],
    });
  }

  const schemaPath = path.join(repoRoot, "schemas", "verification-report.schema.json");
  const prompt = [
    "You are verifying Australian or NSW-sensitive claims in paediatrics draft exam questions.",
    `Evidence mode: ${manifest.evidenceMode}.`,
    "Use web search only for the listed claims.",
    "Prefer primary Australian sources such as legislation, government, state health, tertiary children's hospitals, and Australian professional bodies.",
    "Return only JSON following the schema.",
    "Do not rewrite the questions. Only classify each claim and suggest changes if needed.",
    manifest.evidenceMode === "strict_internal"
      ? "In strict_internal mode, external facts may flag risk or conflict but are not allowed to silently replace final question content."
      : "In hybrid_australia_verified mode, externally supported suggestions may be proposed but must remain traceable.",
    `Batch: ${batch.batchId} ${batch.topicCluster}`,
    "Claims to verify:",
    JSON.stringify(candidates, null, 2),
    "",
    "Return exactly this JSON object shape:",
    JSON.stringify({
      workflowId: manifest.workflowId,
      batchId: batch.batchId,
      attempt,
      evidenceMode: manifest.evidenceMode,
      findings: [
        {
          questionIndex: 0,
          claim: "string",
          status: "no_issue",
          riskLevel: "low",
          suggestedChange: null,
          changeAllowedInMode: false,
          sources: [{ title: "string", url: "https://example.com" }],
        },
      ],
    }, null, 2),
  ].join("\n\n");

  try {
    const result = await runStructuredOutput<VerificationReport>({
      cwd: repoRoot,
      prompt,
      schemaPath,
      search: true,
      timeoutMs,
    });
    return verificationReportSchema.parse(result.data);
  } catch (error) {
    return buildVerificationFailureReport({
      manifest,
      batch,
      attempt,
      candidates,
      error,
    });
  }
}

export function summarizeVerificationFindings(report: VerificationReport, evidenceMode: EvidenceMode) {
  const meaningful = report.findings.filter((finding) => finding.status !== "no_issue");
  if (meaningful.length === 0) {
    return {
      externalFindingCount: 0,
      unresolvedConflictCount: 0,
      summary: [`No external verification issues flagged in ${evidenceMode}.`],
    };
  }

  return {
    externalFindingCount: meaningful.length,
    unresolvedConflictCount: meaningful.filter((finding) => finding.status === "external_conflict_detected").length,
    summary: meaningful.map((finding) => `${finding.status}: ${finding.claim}`),
  };
}
