import fs from "node:fs/promises";
import path from "node:path";

import type { BatchAttemptMode, WorkflowBatch, WorkflowManifest } from "./contracts";

type ArtifactDirKey = keyof WorkflowManifest["artifactDirs"];

function padAttempt(attemptNumber: number) {
  return String(attemptNumber).padStart(2, "0");
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
}: {
  repoRoot: string;
  manifest: WorkflowManifest;
  batch: WorkflowBatch;
  attemptNumber: number;
  mode: BatchAttemptMode;
}) {
  const rawDir = path.join(resolveArtifactDir(repoRoot, manifest, "raw"), manifest.workflowId, batch.batchId);
  const reportsDir = path.join(resolveArtifactDir(repoRoot, manifest, "reports"), manifest.workflowId, batch.batchId);
  const promptsDir = path.join(resolveArtifactDir(repoRoot, manifest, "prompts"), manifest.workflowId, batch.batchId);
  const reviewPackDir = path.join(resolveArtifactDir(repoRoot, manifest, "reviewPacks"), manifest.workflowId);
  const batchDir = path.join(resolveArtifactDir(repoRoot, manifest, "state"), manifest.workflowId, batch.batchId);
  const attemptSuffix = `attempt-${padAttempt(attemptNumber)}`;

  return {
    batchDir,
    rawDir,
    reportsDir,
    promptsDir,
    reviewPackDir,
    statePath: path.join(resolveArtifactDir(repoRoot, manifest, "state"), `${manifest.workflowId}__${batch.batchId}.json`),
    summaryPath: path.join(reportsDir, "batch-summary.md"),
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
  };
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
