import fs from "node:fs/promises";
import path from "node:path";

import {
  type WorkflowBatch,
  type WorkflowManifest,
  workflowManifestSchema,
} from "./contracts";

export type LoadedWorkflowManifest = {
  repoRoot: string;
  manifestPath: string;
  manifest: WorkflowManifest;
};

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function findRepoRoot(startDir = process.cwd()): Promise<string> {
  let current = path.resolve(startDir);

  while (true) {
    const packageJsonPath = path.join(current, "package.json");
    const agentsPath = path.join(current, "AGENTS.md");
    if (await pathExists(packageJsonPath) && await pathExists(agentsPath)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("Unable to locate repo root from current working directory.");
    }
    current = parent;
  }
}

export function resolveWorkflowPath(repoRoot: string, relativePath: string) {
  return path.isAbsolute(relativePath) ? relativePath : path.join(repoRoot, relativePath);
}

function applyManifestDefaults(manifest: WorkflowManifest): WorkflowManifest {
  return {
    ...manifest,
    batches: manifest.batches.map((batch) => ({
      ...batch,
      maxAttempts: batch.maxAttempts ?? manifest.retryPolicy.maxAttempts,
    })),
  };
}

export async function loadWorkflowManifest(workflowRef: string, repoRootArg?: string): Promise<LoadedWorkflowManifest> {
  const repoRoot = repoRootArg ?? (await findRepoRoot());
  const manifestPath = workflowRef.endsWith(".json")
    ? resolveWorkflowPath(repoRoot, workflowRef)
    : path.join(repoRoot, "workflow", "manifests", `${workflowRef}.json`);

  const raw = await fs.readFile(manifestPath, "utf8");
  const parsed = workflowManifestSchema.parse(JSON.parse(raw));

  return {
    repoRoot,
    manifestPath,
    manifest: applyManifestDefaults(parsed),
  };
}

export function getBatchFromManifest(manifest: WorkflowManifest, batchId: string): WorkflowBatch {
  const batch = manifest.batches.find((entry) => entry.batchId === batchId);
  if (!batch) {
    throw new Error(`Batch ${batchId} not found in workflow ${manifest.workflowId}.`);
  }
  return batch;
}

export function sortBatchIds(batchIds: string[]) {
  return [...batchIds].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}
