import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SpawnCall = {
  command: string;
  args: string[];
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    detached?: boolean;
    stdio?: unknown;
  };
};

const spawnCalls: SpawnCall[] = [];

vi.mock("node:child_process", () => ({
  spawn: vi.fn((command: string, args: string[], options: SpawnCall["options"]) => {
    spawnCalls.push({ command, args, options });
    const child = new EventEmitter() as EventEmitter & { pid: number; unref: () => void };
    child.pid = 43210;
    child.unref = vi.fn();
    process.nextTick(() => {
      child.emit("spawn");
    });
    return child;
  }),
}));

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "codex-runner-test-"));
}

describe("codex-runner text jobs", () => {
  beforeEach(() => {
    spawnCalls.length = 0;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it("launches text jobs from a deterministic scratch process cwd while preserving the real workflow cwd for -C", async () => {
    const { launchCodexTextJob } = await import("../scripts/generation/lib/codex-runner.js");

    const tempDir = await makeTempDir();
    const promptPath = path.join(tempDir, "attempt-01.prompt.md");
    const outputPath = path.join(tempDir, "attempt-01.draft.txt");
    const stdoutPath = path.join(tempDir, "attempt-01.draft.stdout.jsonl");
    const stderrPath = path.join(tempDir, "attempt-01.draft.stderr.log");
    const jobPath = path.join(tempDir, "attempt-01.draft.job.json");

    await fs.writeFile(promptPath, "Return JSON only.", "utf8");

    const job = await launchCodexTextJob({
      cwd: "/repo/root",
      promptPath,
      outputPath,
      stdoutPath,
      stderrPath,
      jobPath,
    });

    const expectedExecCwd = path.join(tempDir, "attempt-01.draft.job.cwd");
    expect(job.execCwd).toBe(expectedExecCwd);
    expect(job.execCwd).not.toBe("/repo/root");
    expect(job.failOnCommandExecution).toBe(true);
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]?.options.cwd).toBe(expectedExecCwd);
    expect(spawnCalls[0]?.args).toContain("/repo/root");
    expect(spawnCalls[0]?.args).not.toContain(expectedExecCwd);
    expect(await fs.readFile(jobPath, "utf8")).toContain("\"execCwd\"");
  });

  it("fails early when the JSONL stream shows command execution", async () => {
    const { pollCodexTextJob } = await import("../scripts/generation/lib/codex-runner.js");

    const tempDir = await makeTempDir();
    const stdoutPath = path.join(tempDir, "attempt-01.draft.stdout.jsonl");
    const stderrPath = path.join(tempDir, "attempt-01.draft.stderr.log");
    const outputPath = path.join(tempDir, "attempt-01.draft.txt");
    const jobPath = path.join(tempDir, "attempt-01.draft.job.json");

    await fs.writeFile(
      stdoutPath,
      [
        JSON.stringify({
          type: "item.started",
          item: {
            id: "item_1",
            type: "command_execution",
            command: "/bin/zsh -lc 'rg --files .'",
            status: "in_progress",
          },
        }),
      ].join("\n"),
      "utf8",
    );
    await fs.writeFile(stderrPath, "", "utf8");
    await fs.writeFile(
      jobPath,
      JSON.stringify(
        {
          kind: "codex_text_generation",
          pid: 0,
          cwd: "/repo/root",
          execCwd: path.join(tempDir, "attempt-01.draft.job.cwd"),
          promptPath: path.join(tempDir, "attempt-01.prompt.md"),
          outputPath,
          stdoutPath,
          stderrPath,
          search: false,
          failOnCommandExecution: true,
          model: "gpt-5.4",
          reasoningEffort: "low",
          args: ["exec", "-C", path.join(tempDir, "attempt-01.draft.job.cwd"), "-"],
          state: "running",
          startedAt: new Date().toISOString(),
          completedAt: null,
          lastObservedAt: null,
          usage: null,
          error: null,
          signal: null,
        },
        null,
        2,
      ),
      "utf8",
    );

    await expect(
      pollCodexTextJob({
        jobPath,
        waitSliceMs: 0,
        pollIntervalMs: 0,
        maxWallMs: 60_000,
      }),
    ).rejects.toThrow(/attempted command execution instead of direct drafting/i);

    const updatedJob = JSON.parse(await fs.readFile(jobPath, "utf8")) as { state: string; error: string };
    expect(updatedJob.state).toBe("failed");
    expect(updatedJob.error).toMatch(/rg --files/);
  });

  it("launches structured jobs with the schema path wired into the Codex args", async () => {
    const { launchCodexStructuredJob } = await import("../scripts/generation/lib/codex-runner.js");

    const tempDir = await makeTempDir();
    const promptPath = path.join(tempDir, "attempt-01.prompt.md");
    const outputPath = path.join(tempDir, "attempt-01.draft.txt");
    const stdoutPath = path.join(tempDir, "attempt-01.draft.stdout.jsonl");
    const stderrPath = path.join(tempDir, "attempt-01.draft.stderr.log");
    const jobPath = path.join(tempDir, "attempt-01.draft.job.json");
    const schemaPath = path.join(tempDir, "generated-batch.schema.json");

    await fs.writeFile(promptPath, "Return JSON only.", "utf8");
    await fs.writeFile(schemaPath, "{\"type\":\"object\"}", "utf8");

    const job = await launchCodexStructuredJob({
      cwd: "/repo/root",
      promptPath,
      outputPath,
      stdoutPath,
      stderrPath,
      jobPath,
      schemaPath,
    });

    expect(job.kind).toBe("codex_structured_generation");
    expect(job.schemaPath).toBe(schemaPath);
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]?.args).toContain("--output-schema");
    expect(spawnCalls[0]?.args).toContain(schemaPath);
  });
});
