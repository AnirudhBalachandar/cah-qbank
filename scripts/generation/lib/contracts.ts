import { z } from "zod";

export const evidenceModeSchema = z.enum(["strict_internal", "hybrid_australia_verified"]);
export const generationStrictnessSchema = z.enum(["strict_internal", "augmented"]);
export const workflowBatchStatusSchema = z.enum(["pending", "running", "completed", "saturated", "failed"]);
export const batchAttemptModeSchema = z.enum(["initial", "replacement", "resume"]);
export const batchAttemptLifecycleStatusSchema = z.enum(["running", "completed", "failed", "aborted"]);
export const batchActiveJobSchema = z.object({
  jobId: z.string().min(1),
  pid: z.number().int().positive().nullable(),
  phase: z.string().min(1),
  attemptNumber: z.number().int().min(1),
  mode: batchAttemptModeSchema,
  logPath: z.string().min(1),
  startedAt: z.string().datetime(),
  heartbeatAt: z.string().datetime(),
});
export const verificationFindingStatusSchema = z.enum([
  "no_issue",
  "possible_outdated_internal_source",
  "external_support_available",
  "external_conflict_detected",
  "needs_human_decision",
]);
export const verificationRiskLevelSchema = z.enum(["low", "medium", "high"]);
export const overlapClassificationSchema = z.enum([
  "accepted",
  "existing_bank_overlap",
  "local_batch_overlap",
  "accepted_angle_reuse",
  "rejected_angle_reuse",
  "same_teaching_point",
]);

export const sourcePriorityEntrySchema = z.object({
  rank: z.number().int().min(1),
  label: z.string().min(1),
  path: z.string().min(1),
  role: z.enum(["primary_notes", "secondary_notes", "concept_hint"]),
});

export const workflowSourceFileSchema = z.object({
  label: z.string().min(1),
  path: z.string().min(1),
  role: z.enum([
    "primary_notes",
    "secondary_notes",
    "concept_hint",
    "operational",
    "batch_brief",
    "workflow_doc",
    "outputs_dir",
  ]),
});

export const artifactDirsSchema = z.object({
  raw: z.string().min(1),
  reports: z.string().min(1),
  prompts: z.string().min(1),
  reviewPacks: z.string().min(1),
  state: z.string().min(1),
});

export const workerLaneConfigSchema = z.object({
  semanticOriginalityAudit: z.boolean().default(true),
  reviewPackSynthesis: z.boolean().default(true),
});

export const retryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(10).default(4),
  invalidJsonRepairRetries: z.number().int().min(0).max(3).default(1),
  validationRepairRetries: z.number().int().min(0).max(3).default(1),
});

export const saturationPolicySchema = z.object({
  freezeOnZeroAcceptedWhenRemainingAtMost: z.number().int().min(1).default(5),
  freezeOnConsecutiveLowYieldRetries: z.number().int().min(1).default(2),
  lowYieldAcceptedThreshold: z.number().int().min(0).default(1),
});

export const workflowBatchSchema = z.object({
  batchId: z.string().regex(/^B\d{2}$/),
  curriculumArea: z.string().min(1),
  topicCluster: z.string().min(1),
  subtopics: z.array(z.string().min(1)).min(1),
  targetCount: z.number().int().min(1).max(50),
  styleMix: z.string().min(1),
  sourcePriorityNotes: z.string().min(1),
  overlapRisk: z.string().min(1),
  status: workflowBatchStatusSchema.default("pending"),
  maxAttempts: z.number().int().min(1).max(10).optional(),
  acceptedCountHint: z.number().int().min(0).optional(),
  notes: z.string().default(""),
  briefPath: z.string().optional(),
  frozenReason: z.string().optional(),
});

export const workflowManifestSchema = z.object({
  workflowId: z.string().min(1),
  title: z.string().min(1),
  rootDir: z.string().min(1),
  evidenceMode: evidenceModeSchema.default("strict_internal"),
  defaultStrictness: generationStrictnessSchema.default("strict_internal"),
  defaultModelProfile: z.string().min(1).default("generator"),
  sourceFiles: z.array(workflowSourceFileSchema).min(1),
  sourcePriority: z.array(sourcePriorityEntrySchema).min(1),
  outputSpecPath: z.string().min(1),
  rejectedPatternsPath: z.string().min(1),
  existingContentIndexPath: z.string().min(1).optional(),
  artifactDirs: artifactDirsSchema,
  workerLanes: workerLaneConfigSchema.default({
    semanticOriginalityAudit: true,
    reviewPackSynthesis: true,
  }),
  retryPolicy: retryPolicySchema,
  saturationPolicy: saturationPolicySchema,
  batches: z.array(workflowBatchSchema).min(1),
});

export const sourcePackItemSchema = z.object({
  sourceRef: z.string().min(1),
  title: z.string().nullable(),
  heading: z.string().nullable(),
  pageStart: z.number().int().nullable(),
  pageEnd: z.number().int().nullable(),
  similarity: z.number(),
  excerpt: z.string().min(1),
});

export const sourcePackSchema = z.object({
  workflowId: z.string().min(1),
  batchId: z.string().regex(/^B\d{2}$/),
  query: z.string().min(1),
  sourcePriorityNotes: z.string().min(1),
  subtopics: z.array(z.string()).min(1),
  retrievedAt: z.string().datetime(),
  items: z.array(sourcePackItemSchema),
});

export const overlapFindingSchema = z.object({
  questionIndex: z.number().int().min(0),
  classification: overlapClassificationSchema,
  angleFamily: z.string().min(1),
  matchedQuestionId: z.string().nullable().optional(),
  score: z.number().min(0).max(1).nullable().optional(),
  reason: z.string().min(1),
});

export const overlapReportSchema = z.object({
  workflowId: z.string().min(1),
  batchId: z.string().regex(/^B\d{2}$/),
  attempt: z.number().int().min(1),
  generatedCount: z.number().int().min(0),
  acceptedIndices: z.array(z.number().int().min(0)),
  rejectedIndices: z.array(z.number().int().min(0)),
  findings: z.array(overlapFindingSchema),
  warnings: z.array(z.string()).default([]),
});

export const semanticOriginalityFindingSchema = z.object({
  questionIndex: z.number().int().min(0),
  classification: overlapClassificationSchema.exclude(["accepted"]),
  angleFamily: z.string().min(1),
  confidence: z.number().min(0).max(1),
  shouldReject: z.boolean(),
  reason: z.string().min(1),
});

export const semanticOriginalityReportSchema = z.object({
  workflowId: z.string().min(1),
  batchId: z.string().regex(/^B\d{2}$/),
  attempt: z.number().int().min(1),
  findings: z.array(semanticOriginalityFindingSchema),
  warnings: z.array(z.string()).default([]),
});

export const validationIssueSchema = z.object({
  questionIndex: z.number().int().min(0).nullable().optional(),
  category: z.enum([
    "structural",
    "format",
    "scope",
    "source_policy",
    "originality",
    "evidence_mode",
    "clinical_framing",
  ]),
  severity: z.enum(["warning", "error"]),
  message: z.string().min(1),
});

export const validationReportSchema = z.object({
  workflowId: z.string().min(1),
  batchId: z.string().regex(/^B\d{2}$/),
  attempt: z.number().int().min(1),
  ok: z.boolean(),
  structuralOk: z.boolean(),
  formatOk: z.boolean(),
  scopeOk: z.boolean(),
  sourcePolicyOk: z.boolean(),
  evidenceModeOk: z.boolean(),
  issues: z.array(validationIssueSchema),
});

export const verificationSourceSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
});

export const verificationFindingSchema = z.object({
  questionIndex: z.number().int().min(0),
  claim: z.string().min(1),
  status: verificationFindingStatusSchema,
  riskLevel: verificationRiskLevelSchema,
  suggestedChange: z.string().nullable().optional(),
  changeAllowedInMode: z.boolean(),
  sources: z.array(verificationSourceSchema).default([]),
});

export const verificationReportSchema = z.object({
  workflowId: z.string().min(1),
  batchId: z.string().regex(/^B\d{2}$/),
  attempt: z.number().int().min(1),
  evidenceMode: evidenceModeSchema,
  findings: z.array(verificationFindingSchema),
});

export const mergedDecisionReportSchema = z.object({
  workflowId: z.string().min(1),
  batchId: z.string().regex(/^B\d{2}$/),
  attempt: z.number().int().min(1),
  acceptedIndices: z.array(z.number().int().min(0)),
  rejectedIndices: z.array(z.number().int().min(0)),
  repairableIssues: z.array(z.string()).default([]),
  blockingIssues: z.array(z.string()).default([]),
  overlapWarnings: z.array(z.string()).default([]),
  verificationWarnings: z.array(z.string()).default([]),
  importable: z.boolean(),
});

export const attemptHistoryEntrySchema = z.object({
  attemptNumber: z.number().int().min(1),
  mode: batchAttemptModeSchema,
  status: batchAttemptLifecycleStatusSchema.optional(),
  jobId: z.string().min(1).nullable().optional(),
  phase: z.string().min(1).nullable().optional(),
  errorMessage: z.string().min(1).nullable().optional(),
  acceptedCount: z.number().int().min(0),
  rejectedCount: z.number().int().min(0),
  remainingCount: z.number().int().min(0),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  recordedAt: z.string().datetime(),
});

export const batchAttemptStateSchema = z.object({
  attemptNumber: z.number().int().min(1),
  mode: batchAttemptModeSchema,
  status: batchAttemptLifecycleStatusSchema.optional(),
  jobId: z.string().min(1).nullable().optional(),
  phase: z.string().min(1).nullable().optional(),
  errorMessage: z.string().min(1).nullable().optional(),
  rawOutputPath: z.string().min(1),
  draftOutputPath: z.string().nullable().optional(),
  repairOutputPath: z.string().nullable().optional(),
  sourcePackPath: z.string().min(1),
  promptPath: z.string().min(1),
  overlapReportPath: z.string().min(1),
  semanticOverlapReportPath: z.string().nullable().optional(),
  validationReportPath: z.string().min(1),
  australianVerificationReportPath: z.string().min(1),
  mergedDecisionReportPath: z.string().min(1),
  importReportPath: z.string().nullable(),
  acceptedCount: z.number().int().min(0),
  rejectedCount: z.number().int().min(0),
  remainingCount: z.number().int().min(0),
  usage: z.object({
    model: z.string().nullable(),
    inputTokens: z.number().int().nullable(),
    outputTokens: z.number().int().nullable(),
    totalTokens: z.number().int().nullable(),
  }).optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
});

export const evidenceSummarySchema = z.object({
  evidenceMode: evidenceModeSchema,
  strictness: generationStrictnessSchema,
  externalFindingCount: z.number().int().min(0).default(0),
  unresolvedConflictCount: z.number().int().min(0).default(0),
});

export const batchStateSchema = z.object({
  workflowId: z.string().min(1),
  batchId: z.string().regex(/^B\d{2}$/),
  status: workflowBatchStatusSchema,
  attempts: z.number().int().min(0),
  nextAttemptNumber: z.number().int().min(1).default(1),
  acceptedTotal: z.number().int().min(0),
  rejectedTotal: z.number().int().min(0),
  remaining: z.number().int().min(0),
  importedQuestionIds: z.array(z.string()).default([]),
  acceptedAngleFamilies: z.array(z.string()).default([]),
  rejectedAngleFamilies: z.array(z.string()).default([]),
  overlapWarnings: z.array(z.string()).default([]),
  evidenceSummary: evidenceSummarySchema,
  activeJob: batchActiveJobSchema.nullable().default(null),
  currentAttempt: batchAttemptStateSchema.nullable().default(null),
  lastAttempt: batchAttemptStateSchema.nullable(),
  attemptHistory: z.array(attemptHistoryEntrySchema).default([]),
  artifactPaths: z.object({
    statePath: z.string().min(1),
    batchDir: z.string().min(1),
    rawDir: z.string().min(1),
    reportsDir: z.string().min(1),
    promptsDir: z.string().min(1),
    reviewPackDir: z.string().min(1),
    summaryPath: z.string().nullable().optional(),
    reviewPackPath: z.string().nullable().optional(),
  }),
  saturationReason: z.string().nullable(),
  nextAction: z.string().nullable(),
  updatedAt: z.string().datetime(),
});

export const reviewPackBatchSummarySchema = z.object({
  batchId: z.string().regex(/^B\d{2}$/),
  status: workflowBatchStatusSchema,
  acceptedTotal: z.number().int().min(0),
  targetCount: z.number().int().min(1),
  remaining: z.number().int().min(0),
  saturationReason: z.string().nullable(),
  overlapTraps: z.array(z.string()).default([]),
});

export const reviewPackSchema = z.object({
  workflowId: z.string().min(1),
  scope: z.object({
    batchId: z.string().regex(/^B\d{2}$/).optional(),
    fromBatchId: z.string().regex(/^B\d{2}$/).optional(),
    toBatchId: z.string().regex(/^B\d{2}$/).optional(),
  }),
  generatedAt: z.string().datetime(),
  acceptedTotals: z.object({
    accepted: z.number().int().min(0),
    target: z.number().int().min(0),
  }),
  batchSummaries: z.array(reviewPackBatchSummarySchema),
  coverageSummary: z.array(z.string()).default([]),
  styleMixSummary: z.array(z.string()).default([]),
  overlapTrapSummary: z.array(z.string()).default([]),
  verificationSummary: z.array(z.string()).default([]),
  unresolvedExternalConflicts: z.array(z.string()).default([]),
  recommendedImprovementPrompts: z.array(z.string()).default([]),
  nextRecommendedBatches: z.array(z.string()).default([]),
  artifactPaths: z.array(z.string()).default([]),
});

export const reviewPackSynthesisSchema = z.object({
  coverageSummary: z.array(z.string()).default([]),
  overlapTrapSummary: z.array(z.string()).default([]),
  verificationSummary: z.array(z.string()).default([]),
  recommendedImprovementPrompts: z.array(z.string()).default([]),
  nextRecommendedBatches: z.array(z.string().regex(/^B\d{2}$/)).default([]),
});

export type EvidenceMode = z.infer<typeof evidenceModeSchema>;
export type GenerationStrictness = z.infer<typeof generationStrictnessSchema>;
export type WorkflowBatchStatus = z.infer<typeof workflowBatchStatusSchema>;
export type BatchAttemptMode = z.infer<typeof batchAttemptModeSchema>;
export type BatchAttemptLifecycleStatus = z.infer<typeof batchAttemptLifecycleStatusSchema>;
export type BatchActiveJob = z.infer<typeof batchActiveJobSchema>;
export type WorkflowManifest = z.infer<typeof workflowManifestSchema>;
export type WorkflowBatch = z.infer<typeof workflowBatchSchema>;
export type BatchState = z.infer<typeof batchStateSchema>;
export type SourcePack = z.infer<typeof sourcePackSchema>;
export type OverlapReport = z.infer<typeof overlapReportSchema>;
export type SemanticOriginalityReport = z.infer<typeof semanticOriginalityReportSchema>;
export type ValidationReport = z.infer<typeof validationReportSchema>;
export type VerificationReport = z.infer<typeof verificationReportSchema>;
export type MergedDecisionReport = z.infer<typeof mergedDecisionReportSchema>;
export type ReviewPack = z.infer<typeof reviewPackSchema>;
export type ReviewPackSynthesis = z.infer<typeof reviewPackSynthesisSchema>;
