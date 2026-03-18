import { describe, expect, it } from "vitest";

import { resolveEffectiveRetrievalSourceTypes } from "../app/src/lib/server/retrieval/internal";
import { resolveRetrievalSourceTypes } from "../app/src/lib/server/retrieval/source-types";

describe("retrieval source type resolution", () => {
  it("defaults to internal-only source types", () => {
    expect(resolveRetrievalSourceTypes()).toEqual(["pdf", "docx"]);
  });

  it("keeps explicit web source type for augmented retrieval", () => {
    expect(resolveRetrievalSourceTypes(["pdf", "docx", "web"])).toEqual(["pdf", "docx", "web"]);
  });

  it("deduplicates and falls back safely for invalid input", () => {
    const invalid = resolveRetrievalSourceTypes(["pdf", "pdf", "web", "unknown" as "web"]);
    expect(invalid).toEqual(["pdf", "web"]);
  });

  it("enforces internal-only mode by default in retrieval execution", () => {
    expect(resolveEffectiveRetrievalSourceTypes({ sourceTypes: ["pdf", "docx", "web"] })).toEqual([
      "pdf",
      "docx",
    ]);
  });

  it("allows web chunks only when explicitly enabled", () => {
    expect(
      resolveEffectiveRetrievalSourceTypes({
        sourceTypes: ["pdf", "docx", "web"],
        allowWebSources: true,
      }),
    ).toEqual(["pdf", "docx", "web"]);
  });
});
