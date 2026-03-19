import * as path from "node:path";

import {
  checkWorkerWorktrees,
  registerDetachedWorkerWorktrees,
  repairUnhealthyWorkerWorktrees,
} from "./lib/worker-worktree-utils";

const command = process.argv[2];

function usage() {
  console.log(
    [
      "Usage:",
      "  pnpm tsx scripts/generation/manage_worker_worktrees.ts bootstrap --base-ref <git-ref> [--count <n>] [--prefix <name>] [--worker-root <path>] [--registry <path>] [--repo-root <path>] [--force]",
      "  pnpm tsx scripts/generation/manage_worker_worktrees.ts status [--registry <path>] [--workers <id1,id2>]",
      "  pnpm tsx scripts/generation/manage_worker_worktrees.ts recover [--execute] [--registry <path>] [--repo-root <path>] [--workers <id1,id2>]",
    ].join("\n"),
  );
  process.exit(0);
}

function parseArgs() {
  const argv = process.argv.slice(3);
  const options = new Map<string, string>();
  const flags = new Set<string>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${token}`);
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags.add(token);
      continue;
    }

    options.set(token, next);
    index += 1;
  }

  return { options, flags };
}

async function bootstrapCommand() {
  const { options, flags } = parseArgs();

  const baseRef = options.get("--base-ref");
  if (!baseRef) {
    throw new Error("Missing required --base-ref");
  }

  const count = Number(options.get("--count") ?? "3");
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("--count must be a positive integer");
  }

  const repoRoot = options.get("--repo-root") ?? process.cwd();
  const workerRoot = options.get("--worker-root");
  const registryPath = options.get("--registry");
  const prefix = options.get("--prefix") ?? "worker";
  const force = flags.has("--force");

  const result = await registerDetachedWorkerWorktrees({
    repoRoot,
    baseRef,
    count,
    prefix,
    workerRoot: workerRoot ? path.resolve(workerRoot) : undefined,
    registryPath,
    forceRecreateExisting: force,
  });

  console.log(JSON.stringify({
    ok: result.errors.length === 0,
    created: result.created.map((entry) => ({
      workerId: entry.workerId,
      path: entry.path,
    })),
    alreadyRegistered: result.alreadyRegistered.map((entry) => ({
      workerId: entry.workerId,
      path: entry.path,
    })),
    errors: result.errors,
  }, null, 2));
}

async function statusCommand() {
  const { options } = parseArgs();
  const registryPath = options.get("--registry") ?? undefined;
  const workersArg = options.get("--workers");
  const workers = workersArg ? workersArg.split(",").map((entry) => entry.trim()).filter(Boolean) : undefined;

  const reports = await checkWorkerWorktrees({
    registryPath,
    workers,
  });

  console.log(JSON.stringify({
    ok: true,
    total: reports.length,
    healthy: reports.filter((entry) => entry.status === "healthy").length,
    unhealthy: reports.filter((entry) => entry.status !== "healthy").length,
    reports,
  }, null, 2));
}

async function recoverCommand() {
  const { options, flags } = parseArgs();
  const repoRoot = options.get("--repo-root") ?? process.cwd();
  const registryPath = options.get("--registry") ?? undefined;
  const workersArg = options.get("--workers");
  const workers = workersArg ? workersArg.split(",").map((entry) => entry.trim()).filter(Boolean) : undefined;
  const executeRemediation = flags.has("--execute");

  const result = await repairUnhealthyWorkerWorktrees({
    repoRoot,
    registryPath,
    workerIds: workers,
    executeRemediation,
  });

  console.log(JSON.stringify({
    ok: result.failed.length === 0,
    executed: executeRemediation,
    repaired: result.repaired,
    skipped: result.skipped,
    failed: result.failed,
  }, null, 2));
}

async function main() {
  if (!command) {
    usage();
  }

  if (command === "bootstrap") {
    await bootstrapCommand();
    return;
  }

  if (command === "status") {
    await statusCommand();
    return;
  }

  if (command === "recover") {
    await recoverCommand();
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
