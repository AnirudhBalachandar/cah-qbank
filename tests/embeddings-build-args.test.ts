import { describe, expect, it } from "vitest";

import { parseBuildEmbeddingArgs } from "../scripts/embeddings/build_embeddings_args";

describe("parseBuildEmbeddingArgs", () => {
  it("defaults to internal source and limit 1000", () => {
    expect(parseBuildEmbeddingArgs([])).toEqual({
      limit: 1000,
      source: "internal",
    });
  });

  it("accepts positional limit and explicit source", () => {
    expect(parseBuildEmbeddingArgs(["250", "--source=all"])).toEqual({
      limit: 250,
      source: "all",
    });
  });

  it("accepts --limit and --source value forms", () => {
    expect(parseBuildEmbeddingArgs(["--limit", "150", "--source", "internal"])).toEqual({
      limit: 150,
      source: "internal",
    });
  });

  it("rejects invalid source", () => {
    expect(() => parseBuildEmbeddingArgs(["--source=web"])).toThrow(/Invalid --source value/);
  });
});
