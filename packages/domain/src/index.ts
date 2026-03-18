import { z } from "zod";

export const SUBJECT_CONFIG = {
  code: "CAH",
  appName: "CAH QBank",
  shortName: "CAH",
  subjectName: "Child and Adolescent Health",
  tagline: "Child and Adolescent Health revision for Sydney Medical School paediatrics.",
  databaseName: "cah_qbank",
  contentRootRelative: "content/CAH_qbank",
  downloadsFallbackDirName: "CAH qbank",
  questionDocsDirName: "CAH Questions and papers",
  notesDirName: "CAH Notes and materials",
  metadataDirName: "metadata",
  blueprintRootName: "CAH Exam Blueprint",
  defaultLectureRootName: "Lecture Videos",
  moduleCodePrefix: "CAH",
  supportedQuestionTypes: ["SBA", "EMQ_STEM"] as const,
  defaultQuestionSourceDir: "import_source/questions",
  defaultNotesSourceDir: "import_source/notes",
  defaultBlueprintFile: "metadata/exam_blueprint.csv",
  defaultModuleMapFile: "metadata/module_map.csv",
} as const;

export type SupportedQuestionType = (typeof SUBJECT_CONFIG.supportedQuestionTypes)[number];

export type ExamBlueprintRow = {
  rowIndex: number;
  discipline: string;
  curriculumArea: string;
  percentOfExam: number | null;
  examQuestionCount: number | null;
};

export function formatExamWeight(percentOfExam: number | null, examQuestionCount: number | null, totalQuestions: number | null) {
  if (percentOfExam === null && examQuestionCount === null) {
    return null;
  }

  const parts: string[] = [];
  if (typeof percentOfExam === "number" && Number.isFinite(percentOfExam) && percentOfExam > 0) {
    const percentage = (percentOfExam * 100)
      .toFixed(2)
      .replace(/\.00$/, "")
      .replace(/(\.\d)0$/, "$1");
    parts.push(`${percentage}%`);
  }

  if (typeof examQuestionCount === "number" && Number.isFinite(examQuestionCount) && examQuestionCount > 0) {
    if (typeof totalQuestions === "number" && Number.isFinite(totalQuestions) && totalQuestions > 0) {
      parts.push(`${examQuestionCount}/${totalQuestions}`);
    } else {
      parts.push(String(examQuestionCount));
    }
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

export const SYNC_BUNDLE_VERSION = "1.0";
export const SYNC_APPLY_MODE = "authoritative_push" as const;

export const syncApplyModeSchema = z.literal(SYNC_APPLY_MODE);

export const syncBundleMetadataSchema = z.object({
  bundleVersion: z.literal(SYNC_BUNDLE_VERSION),
  sourceDeviceId: z.string().min(1),
  exportedAt: z.string().datetime(),
  appVersion: z.string().min(1),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  applyMode: syncApplyModeSchema,
});

const unknownRows = z.array(z.record(z.string(), z.unknown()));

export const syncBundlePayloadSchema = z.object({
  reference: z.object({
    tags: unknownRows,
    emqSets: unknownRows,
    questions: unknownRows,
    questionTags: unknownRows,
    questionEmqSets: unknownRows,
    contentChunks: unknownRows,
  }),
  userState: z.object({
    user: z.record(z.string(), z.unknown()),
    practiceSessions: unknownRows,
    attempts: unknownRows,
    flags: unknownRows,
    notes: unknownRows,
    issues: unknownRows,
    mastery: unknownRows,
  }),
  generated: z.object({
    runs: unknownRows,
    items: unknownRows,
    questions: unknownRows,
  }),
});

export const syncEnvelopeSchema = z.object({
  meta: syncBundleMetadataSchema,
  crypto: z.object({
    algorithm: z.literal("aes-256-gcm"),
    kdf: z.literal("pbkdf2-sha256"),
    iterations: z.number().int().min(10000),
    salt: z.string().min(1),
    iv: z.string().min(1),
    authTag: z.string().min(1),
    signature: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  data: z.string().min(1),
  preview: z.object({
    referenceCount: z.number().int().min(0),
    userStateCount: z.number().int().min(0),
    generatedCount: z.number().int().min(0),
  }).optional(),
});

export const syncPairStartSchema = z.object({
  devicePublicId: z.string().min(6).max(200),
  deviceName: z.string().min(1).max(120),
  platform: z.enum(["ios", "android", "desktop", "unknown"]).default("unknown"),
});

export const syncPairConfirmSchema = z.object({
  pairingId: z.string().min(12),
  pairingCode: z.string().regex(/^\d{6}$/),
  devicePublicId: z.string().min(6).max(200),
  deviceName: z.string().min(1).max(120),
  platform: z.enum(["ios", "android", "desktop", "unknown"]).default("unknown"),
});

export const syncPairingBundleSchema = z.object({
  baseUrl: z.string().url(),
  pairingId: z.string().min(12),
  pairingCode: z.string().regex(/^\d{6}$/),
  devicePublicId: z.string().min(6).max(200),
  deviceName: z.string().min(1).max(120).optional(),
  expiresAt: z.string().datetime().optional(),
});

export const syncPreviewSchema = z.object({
  referenceCount: z.number().int().min(0),
  userStateCount: z.number().int().min(0),
  generatedCount: z.number().int().min(0),
});

export const syncApplyResultSchema = z.object({
  ok: z.boolean(),
  syncJobId: z.string(),
  imported: z.object({
    reference: z.number().int().min(0),
    userState: z.number().int().min(0),
    generated: z.number().int().min(0),
  }),
  message: z.string(),
});

export const syncJobStatusSchema = z.enum(["pending", "processing", "succeeded", "failed", "rejected"]);

export type SyncBundlePayload = z.infer<typeof syncBundlePayloadSchema>;
export type SyncEnvelope = z.infer<typeof syncEnvelopeSchema>;
export type SyncPreview = z.infer<typeof syncPreviewSchema>;
export type SyncApplyResult = z.infer<typeof syncApplyResultSchema>;
export type SyncPairingBundle = z.infer<typeof syncPairingBundleSchema>;
