import fs from "node:fs/promises";
import path from "node:path";

import type { ArtifactNamespace, BatchAttemptMode, WorkflowBatch, WorkflowManifest } from "./contracts";

type ArtifactDirKey = keyof WorkflowManifest["artifactDirs"];

function padAttempt(attemptNumber: number) {
  return String(attemptNumber).padStart(2, "0");
}

function sanitizeArtifactRunId(artifactRunId: string) {
  const sanitized = artifactRunId
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return sanitized || "run";
}

function resolveArtifactNamespaceSegments({
  artifactNamespace = "live",
  artifactRunId,
}: {
  artifactNamespace?: ArtifactNamespace;
  artifactRunId?: string | null;
}) {
  if (artifactNamespace === "live" && !artifactRunId) {
    return [];
  }

  const namespaceSegment = artifactNamespace === "dry_run" ? "dry-run" : artifactNamespace;
  if (!artifactRunId) {
    return [namespaceSegment];
  }

  return [namespaceSegment, sanitizeArtifactRunId(artifactRunId)];
}

export function resolveArtifactDir(repoRoot: string, manifest: WorkflowManifest, key: ArtifactDirKey) {
  return path.join(repoRoot, manifest.artifactDirs[key]);
}

export async function ensureWorkflowArtifactDirs(repoRoot: string, manifest: WorkflowManifest) {
  const dirs = Object.keys(manifest.artifactDirs).map((key) =>
    resolveArtifactDir(repoRoot, manifest, key as ArtifactDirKey),
  );
  await Promise.all(dirs.map((dirPath) => fs.mkdir(dirPath, { recursive: true })));
}

export function buildBatchArtifactContext({
  repoRoot,
  manifest,
  batch,
  attemptNumber,
  mode,
  artifactNamespace = "live",
  artifactRunId,
}: {
  repoRoot: string;
  manifest: WorkflowManifest;
  batch: WorkflowBatch;
  attemptNumber: number;
  mode: BatchAttemptMode;
  artifactNamespace?: ArtifactNamespace;
  artifactRunId?: string | null;
}) {
  const namespaceSegments = resolveArtifactNamespaceSegments({ artifactNamespace, artifactRunId });
  const rawDir = path.join(resolveArtifactDir(repoRoot, manifest, "raw"), manifest.workflowId, batch.batchId, ...namespaceSegments);
  const reportsDir = path.join(resolveArtifactDir(repoRoot, manifest, "reports"), manifest.workflowId, batch.batchId, ...namespaceSegments);
  const promptsDir = path.join(resolveArtifactDir(repoRoot, manifest, "prompts"), manifest.workflowId, batch.batchId, ...namespaceSegments);
  const reviewPackDir = path.join(resolveArtifactDir(repoRoot, manifest, "reviewPacks"), manifest.workflowId, ...namespaceSegments);
  const batchDir = path.join(resolveArtifactDir(repoRoot, manifest, "state"), manifest.workflowId, batch.batchId, ...namespaceSegments);
  const attemptSuffix = `attempt-${padAttempt(attemptNumber)}`;

  return {
    artifactNamespace,
    artifactRunId: artifactRunId ? sanitizeArtifactRunId(artifactRunId) : null,
    batchDir,
    rawDir,
    reportsDir,
    promptsDir,
    reviewPackDir,
    statePath: artifactNamespace === "dry_run"
      ? path.join(batchDir, "dry-run-state.json")
      : path.join(resolveArtifactDir(repoRoot, manifest, "state"), `${manifest.workflowId}__${batch.batchId}.json`),
    summaryPath: path.join(reportsDir, artifactNamespace === "dry_run" ? "dry-run-summary.md" : "batch-summary.md"),
    promptPath: path.join(promptsDir, `${attemptSuffix}.${mode}.md`),
    rawOutputPath: path.join(rawDir, `${attemptSuffix}.generated.json`),
    draftOutputPath: path.join(rawDir, `${attemptSuffix}.draft.txt`),
    repairOutputPath: path.join(rawDir, `${attemptSuffix}.repair.json`),
    sourcePackPath: path.join(rawDir, `${attemptSuffix}.source-pack.json`),
    overlapReportPath: path.join(reportsDir, `${attemptSuffix}.overlap.json`),
    semanticOverlapReportPath: path.join(reportsDir, `${attemptSuffix}.semantic-overlap.json`),
    validationReportPath: path.join(reportsDir, `${attemptSuffix}.validation.json`),
    australianVerificationReportPath: path.join(reportsDir, `${attemptSuffix}.verification.json`),
    mergedDecisionReportPath: path.join(reportsDir, `${attemptSuffix}.merged.json`),
    importReportPath: path.join(reportsDir, `${attemptSuffix}.import.json`),
    attemptResultPath: path.join(reportsDir, `${attemptSuffix}.attempt-result.json`),
    batchResultPath: path.join(batchDir, "batch-result.json"),
  };
}

export function resolveBatchResultArtifactPath({
  repoRoot,
  manifest,
  batchId,
  artifactNamespace = "live",
  artifactRunId,
}: {
  repoRoot: string;
  manifest: WorkflowManifest;
  batchId: string;
  artifactNamespace?: ArtifactNamespace;
  artifactRunId?: string | null;
}) {
  const namespaceSegments = resolveArtifactNamespaceSegments({ artifactNamespace, artifactRunId });
  return path.join(resolveArtifactDir(repoRoot, manifest, "state"), manifest.workflowId, batchId, ...namespaceSegments, "batch-result.json");
}

export async function ensureBatchArtifactDirs(paths: ReturnType<typeof buildBatchArtifactContext>) {
  await Promise.all([
    fs.mkdir(paths.batchDir, { recursive: true }),
    fs.mkdir(paths.rawDir, { recursive: true }),
    fs.mkdir(paths.reportsDir, { recursive: true }),
    fs.mkdir(paths.promptsDir, { recursive: true }),
    fs.mkdir(paths.reviewPackDir, { recursive: true }),
  ]);
}

export async function writeJsonArtifact(targetPath: string, payload: unknown) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, JSON.stringify(payload, null, 2), "utf8");
}

export async function writeTextArtifact(targetPath: string, content: string) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content, "utf8");
}
