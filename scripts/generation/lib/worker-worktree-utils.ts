import * as fsSync from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type WorktreeLaneStatus = "healthy" | "missing" | "dirty" | "ref_mismatch" | "not_detached" | "git_error";

export interface WorkerWorktreeSpec {
  workerId: string;
  path: string;
  frozenRef: string;
  frozenCommit: string;
  baseCommit: string;
  registryCreatedAt: string;
  host: string;
}

export interface WorktreeRegistry {
  version: 1;
  frozenRef: string;
  frozenCommit: string;
  createdAt: string;
  workers: WorkerWorktreeSpec[];
}

export interface WorktreeHealthReport {
  workerId: string;
  worktreePath: string;
  status: WorktreeLaneStatus;
  issue: string | null;
  actualCommit: string | null;
  detached: boolean;
  clean: boolean | null;
}

const DEFAULT_WORKTREE_ROOT = path.join(process.cwd(), "workflow", "worker-worktrees");
const DEFAULT_REGISTRY_PATH = path.join(process.cwd(), "workflow", "worker-worktree-registry.json");
const DEFAULT_SPARSE_CHECKOUT_PATHS = [
  ".gitignore",
  "AGENTS.md",
  "README.md",
  "app",
  "docs",
  "package.json",
  "packages",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "prisma",
  "schemas",
  "scripts",
  "skills",
  "tsconfig.json",
  "vitest.config.ts",
  "workflow",
] as const;
const SHARED_RUNTIME_LINKS = [
  {
    relativePath: "node_modules",
    sourceRelativePath: "node_modules",
  },
  {
    relativePath: path.join("app", "node_modules"),
    sourceRelativePath: path.join("app", "node_modules"),
  },
  {
    relativePath: path.join("app", "src", "lib", "generated"),
    sourceRelativePath: path.join("app", "src", "lib", "generated"),
  },
] as const;

function parseExecError(error: unknown): { code: number; message: string } {
  const err = error as { code?: unknown; message?: unknown };
  return {
    code: typeof err.code === "number"
      ? err.code
      : typeof err.code === "string"
        ? Number.parseInt(err.code, 10) || 1
        : 1,
    message: typeof err.message === "string" ? err.message : "unknown execution error",
  };
}

async function execGit(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
  });
  return (stdout ?? "").trim();
}

function sanitizeWorkerPathSegment(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9._-]/g, "-");
}

function hasFile(pathToCheck: string): boolean {
  try {
    fsSync.accessSync(pathToCheck);
    return true;
  } catch {
    return false;
  }
}

function ensureDir(dir: string) {
  return fs.mkdir(dir, { recursive: true });
}

async function removePathIfPresent(targetPath: string) {
  try {
    await fs.rm(targetPath, { recursive: true, force: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
  }
}

async function ensureSharedRuntimeLinks(worktreePath: string, repoRoot: string) {
  for (const link of SHARED_RUNTIME_LINKS) {
    const linkPath = path.join(worktreePath, link.relativePath);
    const sourcePath = path.join(repoRoot, link.sourceRelativePath);

    if (!hasFile(sourcePath)) {
      continue;
    }

    await ensureDir(path.dirname(linkPath));

    let shouldRelink = true;
    try {
      const current = await fs.lstat(linkPath);
      if (current.isSymbolicLink()) {
        const currentTarget = await fs.readlink(linkPath);
        const resolvedTarget = path.resolve(path.dirname(linkPath), currentTarget);
        if (resolvedTarget === sourcePath) {
          shouldRelink = false;
        }
      }

      if (shouldRelink) {
        await removePathIfPresent(linkPath);
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        throw error;
      }
    }

    if (shouldRelink) {
      const relativeTarget = path.relative(path.dirname(linkPath), sourcePath);
      await fs.symlink(relativeTarget, linkPath);
    }
  }
}

async function materializeSparseWorkerWorktree(worktreePath: string, repoRoot: string) {
  await execGit(["sparse-checkout", "init", "--cone"], worktreePath);
  await execGit(["sparse-checkout", "set", "--", ...DEFAULT_SPARSE_CHECKOUT_PATHS], worktreePath);
  await execGit(["checkout", "--force", "HEAD"], worktreePath);
  await ensureSharedRuntimeLinks(worktreePath, repoRoot);
  await ensureDir(path.join(worktreePath, "workflow", "artifacts"));
  await ensureDir(path.join(worktreePath, "workflow", "state"));
}

function defaultWorkerDir(baseRoot: string, workerId: string) {
  return path.join(baseRoot, workerId);
}

function readJsonSafe<T>(filePath: string): Promise<T | null> {
  return fs.readFile(filePath, "utf8")
    .then((raw) => JSON.parse(raw) as T)
    .catch((error) => {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return null;
      }
      throw error;
    });
}

export async function resolveFrozenCommit(repoRoot: string, baseRef: string): Promise<string> {
  const frozenCommit = await execGit(["rev-parse", baseRef], repoRoot);
  if (!frozenCommit) {
    throw new Error(`Unable to resolve frozen ref: ${baseRef}`);
  }
  return frozenCommit;
}

export async function loadWorktreeRegistry(registryPath = DEFAULT_REGISTRY_PATH): Promise<WorktreeRegistry | null> {
  return readJsonSafe<WorktreeRegistry>(registryPath);
}

export function computeNextWorkerIds(prefix: string, currentWorkers: WorkerWorktreeSpec[], count: number): string[] {
  const requestedCount = Math.max(count, 0);
  const used = new Set(currentWorkers.map((worker) => worker.workerId));

  const ids: string[] = [];
  let cursor = 1;
  while (ids.length < requestedCount) {
    const candidate = `${sanitizeWorkerPathSegment(prefix)}-${String(cursor).padStart(2, "0")}`;
    if (!used.has(candidate)) {
      ids.push(candidate);
    }
    cursor += 1;
  }

  return ids;
}

export async function registerDetachedWorkerWorktrees(options: {
  repoRoot: string;
  baseRef: string;
  count: number;
  prefix?: string;
  workerRoot?: string;
  registryPath?: string;
  forceRecreateExisting?: boolean;
}): Promise<{ created: WorkerWorktreeSpec[]; alreadyRegistered: WorkerWorktreeSpec[]; errors: string[] }> {
  const frozenRef = options.baseRef;
  const frozenCommit = await resolveFrozenCommit(options.repoRoot, frozenRef);

  const workerRoot = options.workerRoot ?? DEFAULT_WORKTREE_ROOT;
  const registryPath = options.registryPath ?? DEFAULT_REGISTRY_PATH;
  const prefix = sanitizeWorkerPathSegment(options.prefix ?? "worker");

  const existing = (await loadWorktreeRegistry(registryPath)) ?? {
    version: 1,
    frozenRef,
    frozenCommit,
    createdAt: new Date().toISOString(),
    workers: [],
  };

  const createdAt = new Date().toISOString();
  const created: WorkerWorktreeSpec[] = [];
  const alreadyRegistered: WorkerWorktreeSpec[] = [];
  const errors: string[] = [];

  const workerIds = computeNextWorkerIds(prefix, existing.workers, options.count);

  await ensureDir(workerRoot);

  for (const workerId of workerIds) {
    const workerPath = defaultWorkerDir(workerRoot, workerId);
    const spec: WorkerWorktreeSpec = {
      workerId,
      path: workerPath,
      frozenRef,
      frozenCommit,
      baseCommit: frozenCommit,
      registryCreatedAt: createdAt,
      host: process.platform,
    };

    try {
      if (hasFile(workerPath) && options.forceRecreateExisting) {
        try {
          await execGit(["worktree", "remove", "--force", "--", workerPath], options.repoRoot);
        } catch {
          await fs.rm(workerPath, { recursive: true, force: true });
        }
      }

      if (hasFile(workerPath)) {
        alreadyRegistered.push(spec);
        continue;
      }

      await execGit(["worktree", "add", "--detach", "--no-checkout", "--", workerPath, frozenCommit], options.repoRoot);
      await materializeSparseWorkerWorktree(workerPath, options.repoRoot);
      created.push(spec);

      existing.workers.push(spec);
    } catch (error) {
      const parsed = parseExecError(error);
      errors.push(`[${workerId}] ${parsed.message} (code ${parsed.code})`);
    }
  }

  existing.frozenRef = frozenRef;
  existing.frozenCommit = frozenCommit;
  existing.createdAt = existing.createdAt ?? createdAt;

  await ensureDir(path.dirname(registryPath));
  await fs.writeFile(registryPath, JSON.stringify(existing, null, 2), "utf8");

  return { created, alreadyRegistered, errors };
}

export async function checkWorkerWorktrees(options: {
  registryPath?: string;
  baseRef?: string;
  workers?: string[];
}): Promise<WorktreeHealthReport[]> {
  const registryPath = options.registryPath ?? DEFAULT_REGISTRY_PATH;
  const registry = await loadWorktreeRegistry(registryPath);
  const targetWorkers = registry?.workers ?? [];
  const workers = options.workers ? targetWorkers.filter((entry) => options.workers?.includes(entry.workerId)) : targetWorkers;

  if (registry && options.baseRef && options.baseRef !== registry.frozenRef) {
    throw new Error(`Registry base ref mismatch. registry=${registry.frozenRef}, requested=${options.baseRef}`);
  }

  const reports: WorktreeHealthReport[] = [];

  for (const worker of workers) {
    const issueTemplate: WorktreeHealthReport = {
      workerId: worker.workerId,
      worktreePath: worker.path,
      status: "healthy",
      issue: null,
      actualCommit: null,
      detached: false,
      clean: null,
    };

    if (!fsSync.existsSync(worker.path)) {
      reports.push({ ...issueTemplate, status: "missing", issue: "Worktree path missing", detached: false, clean: null });
      continue;
    }

    try {
      const actualCommit = await execGit(["rev-parse", "HEAD"], worker.path);
      const cleanStatus = await execGit(["status", "--short", "--untracked-files=normal"], worker.path);
      let detached = false;
      try {
        await execGit(["symbolic-ref", "-q", "--short", "HEAD"], worker.path);
      } catch {
        detached = true;
      }

      const report = {
        ...issueTemplate,
        actualCommit,
        detached,
        clean: cleanStatus.length === 0,
      };

      if (!detached) {
        const headRef = await execGit(["rev-parse", "--abbrev-ref", "HEAD"], worker.path);
        reports.push({
          ...report,
          status: "not_detached",
          issue: `Worktree HEAD is not detached (currently ${headRef || "HEAD"}).`,
        });
        continue;
      }

      if (actualCommit !== worker.baseCommit) {
        reports.push({
          ...report,
          status: "ref_mismatch",
          issue: `Commit mismatch expected ${worker.baseCommit}, got ${actualCommit}.`,
        });
        continue;
      }

      if (!report.clean) {
        reports.push({ ...report, status: "dirty", issue: "Working tree has local modifications or untracked files." });
        continue;
      }

      reports.push({ ...report, status: "healthy", issue: null });
    } catch (error) {
      const parsed = parseExecError(error);
      reports.push({
        ...issueTemplate,
        status: "git_error",
        issue: `Git health check failed: ${parsed.message}`,
        detached: false,
        clean: null,
      });
    }
  }

  return reports;
}

export async function repairUnhealthyWorkerWorktrees(params: {
  repoRoot: string;
  registryPath?: string;
  workerIds?: string[];
  executeRemediation: boolean;
}): Promise<{ repaired: string[]; skipped: string[]; failed: string[] }> {
  const reports = await checkWorkerWorktrees({ registryPath: params.registryPath });
  const registry = await loadWorktreeRegistry(params.registryPath ?? DEFAULT_REGISTRY_PATH);

  if (!registry) {
    throw new Error("Cannot recover worker worktrees: registry file not found.");
  }

  const filteredWorkerIds = params.workerIds ?? [];
  const selected = filteredWorkerIds.length > 0
    ? reports.filter((entry) => filteredWorkerIds.includes(entry.workerId))
    : reports;

  const repaired: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];

  for (const report of selected) {
    if (report.status === "healthy") {
      skipped.push(`${report.workerId}:already healthy`);
      continue;
    }

    const worker = registry.workers.find((item) => item.workerId === report.workerId);
    if (!worker) {
      failed.push(`${report.workerId}:not found in registry`);
      continue;
    }

    if (!params.executeRemediation) {
      skipped.push(`${report.workerId}:dry-run`);
      continue;
    }

    try {
      if (hasFile(report.worktreePath)) {
        try {
          await execGit(["worktree", "remove", "--force", "--", report.worktreePath], params.repoRoot);
        } catch {
          await fs.rm(report.worktreePath, { recursive: true, force: true });
        }
      }

      await execGit([
        "worktree",
        "add",
        "--detach",
        "--no-checkout",
        "--",
        report.worktreePath,
        worker.baseCommit,
      ], params.repoRoot);
      await materializeSparseWorkerWorktree(report.worktreePath, params.repoRoot);

      repaired.push(`${report.workerId}:recreated`);
    } catch (error) {
      const parsed = parseExecError(error);
      failed.push(`${report.workerId}:recreate failed (${parsed.message})`);
    }
  }

  return { repaired, skipped, failed };
}
