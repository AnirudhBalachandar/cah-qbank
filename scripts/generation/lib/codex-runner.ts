import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const DEFAULT_TEXT_JOB_WAIT_SLICE_MS = 30_000;
const DEFAULT_TEXT_JOB_POLL_INTERVAL_MS = 2_000;
const DEFAULT_TEXT_JOB_MAX_WALL_MS = 20 * 60_000;

export type CodexUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
};

export type CodexStructuredResult<T> = {
  data: T;
  usage: CodexUsage;
};

export type CodexTextResult = {
  text: string;
  usage: CodexUsage;
};

export type CodexJobState = "running" | "completed" | "failed" | "timed_out";
export type CodexJobKind = "codex_text_generation" | "codex_structured_generation";

export type CodexJobPaths = {
  promptPath: string;
  outputPath: string;
  stdoutPath: string;
  stderrPath: string;
  jobPath: string;
};

export type CodexJobRecord = {
  kind: CodexJobKind;
  pid: number;
  cwd: string;
  execCwd: string;
  promptPath: string;
  outputPath: string;
  stdoutPath: string;
  stderrPath: string;
  search: boolean;
  failOnCommandExecution: boolean;
  schemaPath: string | null;
  model: string | null;
  reasoningEffort: string;
  args: string[];
  state: CodexJobState;
  startedAt: string;
  completedAt: string | null;
  lastObservedAt: string | null;
  usage: CodexUsage | null;
  error: string | null;
  signal: string | null;
};

export type CodexTextJobPaths = CodexJobPaths;
export type CodexTextJobRecord = CodexJobRecord;

export type CodexTextPollResult =
  | {
      status: "completed";
      text: string;
      usage: CodexUsage;
      job: CodexJobRecord;
    }
  | {
      status: "pending";
      job: CodexJobRecord;
    };

export class CodexPendingError extends Error {
  job: CodexJobRecord;

  constructor(job: CodexJobRecord) {
    super(`codex job still running: pid=${job.pid}`);
    this.name = "CodexPendingError";
    this.job = job;
  }
}

function resolveCodexModel() {
  return process.env.CODEX_MODEL?.trim() || "gpt-5.4";
}

function resolveCodexReasoningEffort() {
  return process.env.CODEX_REASONING_EFFORT?.trim() || "low";
}

function parseJsonlStatus(stdout: string): { usage: CodexUsage; turnCompleted: boolean; commandExecution: string | null } {
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let turnCompleted = false;
  let commandExecution: string | null = null;

  for (const line of stdout.split("\n").map((entry) => entry.trim()).filter(Boolean)) {
    try {
      const parsed = JSON.parse(line) as {
        type?: string;
        usage?: { input_tokens?: number; output_tokens?: number };
        item?: {
          type?: string;
          command?: string;
        };
      };
      if (parsed.type === "turn.completed") {
        turnCompleted = true;
        inputTokens = typeof parsed.usage?.input_tokens === "number" ? parsed.usage.input_tokens : null;
        outputTokens = typeof parsed.usage?.output_tokens === "number" ? parsed.usage.output_tokens : null;
      }

      if (!commandExecution
        && (parsed.type === "item.started" || parsed.type === "item.completed")
        && parsed.item?.type === "command_execution") {
        commandExecution = parsed.item.command?.trim() || "<unknown command>";
      }
    } catch {
      // Ignore non-JSON warnings.
    }
  }

  return {
    usage: { inputTokens, outputTokens },
    turnCompleted,
    commandExecution,
  };
}

function parseUsageFromJsonl(stdout: string): CodexUsage {
  return parseJsonlStatus(stdout).usage;
}

function buildCodexArgs({
  cwd,
  outputPath,
  search = false,
  schemaPath,
}: {
  cwd: string;
  outputPath: string;
  search?: boolean;
  schemaPath?: string;
}): string[] {
  const args = [
    ...(search ? ["--search"] : []),
    "exec",
    "-C",
    cwd,
    "--sandbox",
    "read-only",
    "--json",
    "--ephemeral",
    "--output-last-message",
    outputPath,
  ];

  if (schemaPath) {
    args.push("--output-schema", schemaPath);
  }

  const model = resolveCodexModel();
  if (model) {
    args.push("--model", model);
  }
  const reasoningEffort = resolveCodexReasoningEffort();
  if (reasoningEffort) {
    args.push("-c", `reasoning_effort="${reasoningEffort}"`);
  }
  args.push("-");

  return args;
}

async function ensureParentDir(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function writeJsonAtomic(targetPath: string, payload: unknown) {
  await ensureParentDir(targetPath);
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(payload, null, 2));
  await fs.rename(tempPath, targetPath);
}

async function readJsonIfExists<T>(targetPath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(targetPath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function parseJsonlStatusFromFile(
  stdoutPath: string,
): Promise<{ usage: CodexUsage; turnCompleted: boolean; commandExecution: string | null }> {
  try {
    const stdout = await fs.readFile(stdoutPath, "utf8");
    return parseJsonlStatus(stdout);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        usage: { inputTokens: null, outputTokens: null },
        turnCompleted: false,
        commandExecution: null,
      };
    }
    throw error;
  }
}

async function tailFile(filePath: string, maxChars = 4_000): Promise<string> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    if (content.length <= maxChars) {
      return content;
    }
    return content.slice(-maxChars);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EPERM") {
      return true;
    }
    return false;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function updateJobRecord(
  jobPath: string,
  job: CodexJobRecord,
  updates: Partial<CodexJobRecord>,
): Promise<CodexJobRecord> {
  const nextJob = { ...job, ...updates };
  await writeJsonAtomic(jobPath, nextJob);
  return nextJob;
}

async function formatJobFailureMessage(job: CodexJobRecord, fallback: string) {
  const stderrTail = (await tailFile(job.stderrPath)).trim();
  return stderrTail || job.error || fallback;
}

async function completeCodexTextJob(jobPath: string, job: CodexJobRecord, usage: CodexUsage) {
  const text = await fs.readFile(job.outputPath, "utf8");
  const completedAt = new Date().toISOString();
  const completedJob = await updateJobRecord(jobPath, job, {
    state: "completed",
    completedAt,
    lastObservedAt: completedAt,
    usage,
    error: null,
    signal: null,
  });
  return {
    status: "completed" as const,
    text,
    usage,
    job: completedJob,
  };
}

async function terminateCodexJob(pid: number): Promise<string | null> {
  let signal: string | null = null;
  const tryKill = (targetPid: number, nextSignal: NodeJS.Signals) => {
    try {
      process.kill(targetPid, nextSignal);
      signal = nextSignal;
      return true;
    } catch {
      return false;
    }
  };

  tryKill(-pid, "SIGTERM") || tryKill(pid, "SIGTERM");
  await sleep(1_000);
  if (isProcessAlive(pid)) {
    tryKill(-pid, "SIGKILL") || tryKill(pid, "SIGKILL");
  }

  return signal;
}

function buildDefaultTextJobExecCwd(jobPath: string) {
  const jobBaseName = path.basename(jobPath, path.extname(jobPath));
  return path.join(path.dirname(jobPath), `${jobBaseName}.cwd`);
}

async function runCodexCommand({
  cwd,
  prompt,
  search = false,
  timeoutMs,
  schemaPath,
}: {
  cwd: string;
  prompt: string;
  search?: boolean;
  timeoutMs?: number;
  schemaPath?: string;
}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cah-codex-"));
  const outputPath = path.join(tempDir, "last-message.txt");
  const args = buildCodexArgs({ cwd, outputPath, search, schemaPath });

  try {
    const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
      const child = spawn("codex", args, {
        cwd,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
      });
      const timeout = timeoutMs
        ? setTimeout(() => {
            child.kill("SIGTERM");
            reject(new Error(`codex timed out after ${timeoutMs}ms`));
          }, timeoutMs)
        : null;

      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (timeout) clearTimeout(timeout);
        if (code === 0) {
          resolve({ stdout });
          return;
        }
        reject(new Error(`codex exited with code ${code}: ${stderr || stdout}`));
      });
      child.stdin.write(prompt);
      child.stdin.end();
    });

    const raw = await fs.readFile(outputPath, "utf8");
    return {
      raw,
      usage: parseUsageFromJsonl(stdout),
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function launchCodexJob({
  cwd,
  execCwd,
  promptPath,
  outputPath,
  stdoutPath,
  stderrPath,
  jobPath,
  search = false,
  failOnCommandExecution = true,
  schemaPath,
  kind,
}: {
  cwd: string;
  execCwd?: string;
  search?: boolean;
  failOnCommandExecution?: boolean;
  schemaPath?: string;
  kind: CodexJobKind;
} & CodexJobPaths): Promise<CodexJobRecord> {
  const resolvedExecCwd = execCwd ?? buildDefaultTextJobExecCwd(jobPath);

  await Promise.all([
    ensureParentDir(path.join(resolvedExecCwd, ".keep")),
    ensureParentDir(outputPath),
    ensureParentDir(stdoutPath),
    ensureParentDir(stderrPath),
    ensureParentDir(jobPath),
  ]);
  await Promise.all([
    fs.rm(outputPath, { force: true }),
    fs.rm(stdoutPath, { force: true }),
    fs.rm(stderrPath, { force: true }),
    fs.rm(jobPath, { force: true }),
  ]);

  const args = buildCodexArgs({ cwd, outputPath, search, schemaPath });
  const model = resolveCodexModel();
  const reasoningEffort = resolveCodexReasoningEffort();

  const stdinFd = fsSync.openSync(promptPath, "r");
  const stdoutFd = fsSync.openSync(stdoutPath, "w");
  const stderrFd = fsSync.openSync(stderrPath, "w");

  try {
    const child = spawn("codex", args, {
      cwd: resolvedExecCwd,
      env: process.env,
      detached: true,
      stdio: [stdinFd, stdoutFd, stderrFd],
    });

    await new Promise<void>((resolve, reject) => {
      child.once("spawn", () => resolve());
      child.once("error", reject);
    });

    child.unref();

    const startedAt = new Date().toISOString();
    const job: CodexJobRecord = {
      kind,
      pid: child.pid ?? -1,
      cwd,
      execCwd: resolvedExecCwd,
      promptPath,
      outputPath,
      stdoutPath,
      stderrPath,
      search,
      failOnCommandExecution,
      schemaPath: schemaPath ?? null,
      model,
      reasoningEffort,
      args,
      state: "running",
      startedAt,
      completedAt: null,
      lastObservedAt: startedAt,
      usage: null,
      error: null,
      signal: null,
    };

    await writeJsonAtomic(jobPath, job);
    return job;
  } catch (error) {
    const now = new Date().toISOString();
    const failedJob: CodexJobRecord = {
      kind,
      pid: -1,
      cwd,
      execCwd: resolvedExecCwd,
      promptPath,
      outputPath,
      stdoutPath,
      stderrPath,
      search,
      failOnCommandExecution,
      schemaPath: schemaPath ?? null,
      model,
      reasoningEffort,
      args,
      state: "failed",
      startedAt: now,
      completedAt: now,
      lastObservedAt: now,
      usage: null,
      error: error instanceof Error ? error.message : String(error),
      signal: null,
    };
    await writeJsonAtomic(jobPath, failedJob);
    throw error;
  } finally {
    fsSync.closeSync(stdinFd);
    fsSync.closeSync(stdoutFd);
    fsSync.closeSync(stderrFd);
  }
}

export async function launchCodexTextJob(args: {
  cwd: string;
  execCwd?: string;
  search?: boolean;
  failOnCommandExecution?: boolean;
} & CodexTextJobPaths): Promise<CodexTextJobRecord> {
  return launchCodexJob({
    ...args,
    kind: "codex_text_generation",
  });
}

export async function launchCodexStructuredJob(args: {
  cwd: string;
  execCwd?: string;
  search?: boolean;
  failOnCommandExecution?: boolean;
  schemaPath: string;
} & CodexJobPaths): Promise<CodexJobRecord> {
  return launchCodexJob({
    ...args,
    kind: "codex_structured_generation",
  });
}

export async function pollCodexTextJob({
  jobPath,
  waitSliceMs = DEFAULT_TEXT_JOB_WAIT_SLICE_MS,
  pollIntervalMs = DEFAULT_TEXT_JOB_POLL_INTERVAL_MS,
  maxWallMs = DEFAULT_TEXT_JOB_MAX_WALL_MS,
}: {
  jobPath: string;
  waitSliceMs?: number;
  pollIntervalMs?: number;
  maxWallMs?: number;
}): Promise<CodexTextPollResult> {
  let job = await readJsonIfExists<CodexJobRecord>(jobPath);
  if (!job) {
    throw new Error(`missing codex job record: ${jobPath}`);
  }

  const deadline = Date.now() + Math.max(0, waitSliceMs);

  while (true) {
    job = (await readJsonIfExists<CodexJobRecord>(jobPath)) ?? job;

    if (job.state === "completed") {
      const usage = job.usage ?? (await parseJsonlStatusFromFile(job.stdoutPath)).usage;
      return completeCodexTextJob(jobPath, job, usage);
    }

    if (job.state === "failed" || job.state === "timed_out") {
      const detail = await formatJobFailureMessage(job, `codex job ${job.state}`);
      throw new Error(`codex job ${job.state}: ${detail}`);
    }

    const now = new Date().toISOString();
    const { usage, turnCompleted, commandExecution } = await parseJsonlStatusFromFile(job.stdoutPath);
    const outputReady = await fileExists(job.outputPath);
    const alive = job.pid > 0 && isProcessAlive(job.pid);
    const startedAtMs = Date.parse(job.startedAt);
    const ageMs = Number.isFinite(startedAtMs) ? Date.now() - startedAtMs : 0;

    if ((job.failOnCommandExecution ?? false) && commandExecution) {
      const signal = alive && job.pid > 0 ? await terminateCodexJob(job.pid) : null;
      const failedJob = await updateJobRecord(jobPath, job, {
        state: "failed",
        completedAt: now,
        lastObservedAt: now,
        usage,
        signal,
        error: `codex text job attempted command execution instead of direct drafting: ${commandExecution}`,
      });
      throw new Error(`codex job failed: ${failedJob.error}`);
    }

    if (outputReady && (turnCompleted || !alive)) {
      return completeCodexTextJob(jobPath, job, usage);
    }

    if (!alive) {
      const failedJob = await updateJobRecord(jobPath, job, {
        state: "failed",
        completedAt: now,
        lastObservedAt: now,
        usage,
        error: await formatJobFailureMessage(job, "codex exited before producing an output artifact"),
      });
      throw new Error(`codex job failed: ${failedJob.error}`);
    }

    if (maxWallMs > 0 && ageMs > maxWallMs) {
      const signal = await terminateCodexJob(job.pid);
      const timedOutJob = await updateJobRecord(jobPath, job, {
        state: "timed_out",
        completedAt: now,
        lastObservedAt: now,
        usage,
        error: `codex job exceeded max wall time of ${maxWallMs}ms`,
        signal,
      });
      throw new Error(`codex job timed out: ${timedOutJob.error}`);
    }

    if (Date.now() >= deadline) {
      const pendingJob = await updateJobRecord(jobPath, job, {
        lastObservedAt: now,
        usage,
      });
      return {
        status: "pending",
        job: pendingJob,
      };
    }

    await sleep(Math.max(250, pollIntervalMs));
  }
}

export async function runCodexStructuredOutput<T>({
  cwd,
  prompt,
  schemaPath,
  search = false,
  timeoutMs,
}: {
  cwd: string;
  prompt: string;
  schemaPath: string;
  search?: boolean;
  timeoutMs?: number;
}): Promise<CodexStructuredResult<T>> {
  const result = await runCodexCommand({ cwd, prompt, schemaPath, search, timeoutMs });
  return {
    data: JSON.parse(result.raw) as T,
    usage: result.usage,
  };
}

export async function runCodexTextOutput({
  cwd,
  prompt,
  search = false,
  timeoutMs,
}: {
  cwd: string;
  prompt: string;
  search?: boolean;
  timeoutMs?: number;
}): Promise<CodexTextResult> {
  const result = await runCodexCommand({ cwd, prompt, search, timeoutMs });
  return {
    text: result.raw,
    usage: result.usage,
  };
}

export async function runCodexTextOutputJob({
  cwd,
  execCwd,
  promptPath,
  outputPath,
  stdoutPath,
  stderrPath,
  jobPath,
  search = false,
  failOnCommandExecution = true,
  waitSliceMs = DEFAULT_TEXT_JOB_WAIT_SLICE_MS,
  pollIntervalMs = DEFAULT_TEXT_JOB_POLL_INTERVAL_MS,
  maxWallMs = DEFAULT_TEXT_JOB_MAX_WALL_MS,
}: {
  cwd: string;
  execCwd?: string;
  search?: boolean;
  failOnCommandExecution?: boolean;
  waitSliceMs?: number;
  pollIntervalMs?: number;
  maxWallMs?: number;
} & CodexTextJobPaths): Promise<CodexTextResult> {
  const existingJob = await readJsonIfExists<CodexJobRecord>(jobPath);
  if (!existingJob) {
    await launchCodexTextJob({
      cwd,
      execCwd,
      promptPath,
      outputPath,
      stdoutPath,
      stderrPath,
      jobPath,
      search,
      failOnCommandExecution,
    });
  }

  const result = await pollCodexTextJob({
    jobPath,
    waitSliceMs,
    pollIntervalMs,
    maxWallMs,
  });

  if (result.status === "pending") {
    throw new CodexPendingError(result.job);
  }

  return {
    text: result.text,
    usage: result.usage,
  };
}

export async function runCodexStructuredOutputJob<T>({
  cwd,
  execCwd,
  promptPath,
  outputPath,
  stdoutPath,
  stderrPath,
  jobPath,
  schemaPath,
  search = false,
  failOnCommandExecution = true,
  waitSliceMs = DEFAULT_TEXT_JOB_WAIT_SLICE_MS,
  pollIntervalMs = DEFAULT_TEXT_JOB_POLL_INTERVAL_MS,
  maxWallMs = DEFAULT_TEXT_JOB_MAX_WALL_MS,
}: {
  cwd: string;
  execCwd?: string;
  search?: boolean;
  failOnCommandExecution?: boolean;
  waitSliceMs?: number;
  pollIntervalMs?: number;
  maxWallMs?: number;
  schemaPath: string;
} & CodexJobPaths): Promise<CodexStructuredResult<T>> {
  const existingJob = await readJsonIfExists<CodexJobRecord>(jobPath);
  if (!existingJob) {
    await launchCodexStructuredJob({
      cwd,
      execCwd,
      promptPath,
      outputPath,
      stdoutPath,
      stderrPath,
      jobPath,
      schemaPath,
      search,
      failOnCommandExecution,
    });
  }

  const result = await pollCodexTextJob({
    jobPath,
    waitSliceMs,
    pollIntervalMs,
    maxWallMs,
  });

  if (result.status === "pending") {
    throw new CodexPendingError(result.job);
  }

  return {
    data: JSON.parse(result.text) as T,
    usage: result.usage,
  };
}
