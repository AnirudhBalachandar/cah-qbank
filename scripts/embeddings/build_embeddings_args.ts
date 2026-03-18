export type EmbeddingSourceMode = "internal" | "all";
export type BuildEmbeddingArgs = {
  limit: number;
  source: EmbeddingSourceMode;
};

function normalizeLimit(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1000;
}

export function parseBuildEmbeddingArgs(argv: string[]): BuildEmbeddingArgs {
  let limit: number | null = null;
  let source: EmbeddingSourceMode = "internal";

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;

    if (arg === "--source") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --source (expected internal|all)");
      }
      if (value !== "internal" && value !== "all") {
        throw new Error(`Invalid --source value: ${value}`);
      }
      source = value;
      i += 1;
      continue;
    }

    if (arg.startsWith("--source=")) {
      const value = arg.split("=")[1];
      if (value !== "internal" && value !== "all") {
        throw new Error(`Invalid --source value: ${value}`);
      }
      source = value;
      continue;
    }

    if (arg === "--limit") {
      const value = Number(argv[i + 1]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("Missing or invalid value for --limit");
      }
      limit = normalizeLimit(value);
      i += 1;
      continue;
    }

    if (arg.startsWith("--limit=")) {
      const value = Number(arg.split("=")[1]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`Invalid --limit value: ${arg.split("=")[1]}`);
      }
      limit = normalizeLimit(value);
      continue;
    }

    const positional = Number(arg);
    if (Number.isFinite(positional) && positional > 0) {
      limit = normalizeLimit(positional);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    limit: limit ?? 1000,
    source,
  };
}
