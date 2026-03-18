import type {
  MergedDecisionReport,
  OverlapReport,
  SemanticOriginalityReport,
  ValidationReport,
  VerificationReport,
} from "./contracts";

function uniqueSorted(values: Iterable<number>) {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

export function mergeWorkerReports({
  workflowId,
  batchId,
  attempt,
  generatedCount,
  validationReport,
  overlapReport,
  semanticOriginalityReport,
  verificationReport,
}: {
  workflowId: string;
  batchId: string;
  attempt: number;
  generatedCount: number;
  validationReport: ValidationReport;
  overlapReport: OverlapReport;
  semanticOriginalityReport?: SemanticOriginalityReport | null;
  verificationReport: VerificationReport;
}): MergedDecisionReport {
  const validationRejectedIndices = validationReport.issues
    .filter((issue) => issue.severity === "error" && issue.questionIndex !== null && issue.questionIndex !== undefined)
    .map((issue) => issue.questionIndex as number);

  const semanticRejectedIndices = (semanticOriginalityReport?.findings ?? [])
    .filter((finding) => finding.shouldReject)
    .map((finding) => finding.questionIndex);

  const rejectedIndices = uniqueSorted([
    ...validationRejectedIndices,
    ...overlapReport.rejectedIndices,
    ...semanticRejectedIndices,
  ]);
  const acceptedIndices = uniqueSorted(
    Array.from({ length: generatedCount }, (_, index) => index).filter((index) => !rejectedIndices.includes(index)),
  );

  const blockingIssues = validationReport.issues
    .filter((issue) => issue.severity === "error" && (issue.questionIndex === null || issue.questionIndex === undefined))
    .map((issue) => issue.message);

  const repairableIssues = validationReport.issues
    .filter((issue) => issue.severity === "error" && issue.questionIndex !== null && issue.questionIndex !== undefined)
    .map((issue) => issue.message);

  const verificationWarnings = verificationReport.findings
    .filter((finding) => finding.status !== "no_issue")
    .map((finding) => `${finding.status}: ${finding.claim}`);

  return {
    workflowId,
    batchId,
    attempt,
    acceptedIndices,
    rejectedIndices,
    repairableIssues,
    blockingIssues,
    overlapWarnings: [
      ...overlapReport.warnings,
      ...(semanticOriginalityReport?.warnings ?? []),
      ...(semanticOriginalityReport?.findings ?? []).map(
        (finding) => `semantic_${finding.classification}: q${finding.questionIndex + 1} ${finding.reason}`,
      ),
    ],
    verificationWarnings,
    importable: blockingIssues.length === 0 && validationReport.structuralOk,
  };
}
