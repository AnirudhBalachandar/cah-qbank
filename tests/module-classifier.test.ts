import { describe, expect, it } from "vitest";

import { inferModuleClassification, inferModuleCode } from "../scripts/ingest/moduleClassifier";

function input(overrides: Partial<Parameters<typeof inferModuleClassification>[0]> = {}) {
  return {
    stem: "Base clinical stem",
    sourceFile: "CAH Questions and papers/sample.docx",
    sectionTitle: "Section A",
    tagPaths: [] as string[][],
    ranZcogDomains: [] as string[],
    metaTags: [] as string[],
    ...overrides,
  };
}

describe("module classifier", () => {
  it("prefers explicit CAH module codes found in tag paths", () => {
    const classification = inferModuleClassification(
      input({
        stem: "An infant presents with bronchiolitis and increasing work of breathing.",
        tagPaths: [["CAH 05", "Respiratory", "Bronchiolitis"]],
      }),
    );

    expect(classification.primary).toBe("CAH 05");
    expect(classification.modules).toContain("CAH 05");
  });

  it("extracts CAH module codes from free text in the stem", () => {
    const classification = inferModuleClassification(
      input({
        stem: "This revision vignette belongs to CAH 08 and focuses on developmental surveillance.",
      }),
    );

    expect(classification.primary).toBe("CAH 08");
    expect(classification.modules).toContain("CAH 08");
  });

  it("adds lecture-derived module support from the source filename", () => {
    const classification = inferModuleClassification(
      input({
        sourceFile: "CAH Questions and papers/Lecture 03 respiratory.docx",
        tagPaths: [["CAH 09", "Emergency paediatrics"]],
      }),
    );

    expect(classification.primary).toBe("CAH 09");
    expect(classification.modules).toContain("CAH 09");
    expect(classification.modules).toContain("CAH 03");
  });

  it("can infer a module from the section title when the filename is generic", () => {
    const moduleCode = inferModuleCode(
      input({
        sectionTitle: "Lecture 11 adolescent medicine rapid review",
      }),
    );

    expect(moduleCode).toBe("CAH 11");
  });

  it("defaults to CAH 00 when no strong signal exists", () => {
    const moduleCode = inferModuleCode(
      input({
        stem: "A child presents for a broad general review without any coded source information.",
      }),
    );

    expect(moduleCode).toBe("CAH 00");
  });
});
