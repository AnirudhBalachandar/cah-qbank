import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildDeterministicStemOptionCorrectKey,
  buildOptionCorrectKey,
  buildOptionCorrectKeyWithoutText,
  buildStemCorrectKey,
  normalizeForMatch,
  parseExplanationMarkdownFile,
  sanitizeExplanationMarkdown,
} from "../scripts/ingest/explanations/explanationImportUtils";

describe("explanation import utilities", () => {
  it("normalizes punctuation and whitespace for matching", () => {
    const a = "A woman has Rh(D)‐negative status — what next?";
    const b = "A woman has Rh(D)-negative status - what next?";
    expect(normalizeForMatch(a)).toBe(normalizeForMatch(b));
  });

  it("sanitizes citation debris, removes decision approach, and preserves explanation-first ordering", () => {
    const raw = [
      "Core idea: Test content.",
      "Why it's correct:",
      "- Correct reason.",
      "",
      "Option cross-check:",
      "| Option | What it means | When you'd pick it | Here, why (not) |",
      "|---|---|---|---|",
      "| A | Wrong | Rarely | Not best fit |",
      "| B | Correct | Here | Correct |",
      "- [Saunderson, R.",
      "",
      "Decision approach (IF/THEN):",
      "- Do X.",
    ].join("\n");

    const cleaned = sanitizeExplanationMarkdown(raw, {
      optionCrossCheckTableMarkdown: [
        "| Option | What it means | When you'd pick it | Here, why (not) |",
        "|---|---|---|---|",
        "| A | Wrong | Rarely | Not best fit |",
        "| B | Correct | Here | Correct |",
      ].join("\n"),
    });
    expect(cleaned).not.toContain("[Saunderson, R.");
    expect(cleaned).toContain("Explanation:");
    expect(cleaned).toContain("Core idea:");
    expect(cleaned).toContain("Option cross-check:");
    expect(cleaned).not.toContain("Decision approach");

    const explanationIndex = cleaned.indexOf("Explanation:");
    const optionCrossCheckIndex = cleaned.indexOf("Option cross-check:");
    const coreIdeaIndex = cleaned.indexOf("Core idea:");
    expect(explanationIndex).toBeGreaterThanOrEqual(0);
    expect(optionCrossCheckIndex).toBeGreaterThan(explanationIndex);
    expect(coreIdeaIndex).toBeGreaterThan(optionCrossCheckIndex);
  });

  it("normalizes why it’s correct heading variant", () => {
    const raw = [
      "Why it’s correct:",
      "- Use immediate assessment first.",
    ].join("\n");

    const cleaned = sanitizeExplanationMarkdown(raw);
    expect(cleaned.startsWith("Explanation:")).toBe(true);
  });

  it("normalizes rewritten headings and keeps requested section order", () => {
    const raw = [
      "Core concept:",
      "Keep mother and fetus stable first.",
      "",
      "Option-by-option:",
      "- A. Incorrect because unstable patient.",
      "- B. Correct with clear rationale.",
      "",
      "5-second exam rule:",
      "- Stabilize first, then definitive management.",
      "",
      "Explanation:",
      "- Start with ABCDE.",
    ].join("\n");

    const cleaned = sanitizeExplanationMarkdown(raw);
    const explanationIndex = cleaned.indexOf("Explanation:");
    const optionByOptionIndex = cleaned.indexOf("Option-by-option:");
    const coreIdeaIndex = cleaned.indexOf("Core idea:");
    const fiveSecondIndex = cleaned.indexOf("5-second exam rule:");

    expect(explanationIndex).toBeGreaterThanOrEqual(0);
    expect(optionByOptionIndex).toBeGreaterThan(explanationIndex);
    expect(coreIdeaIndex).toBeGreaterThan(optionByOptionIndex);
    expect(fiveSecondIndex).toBeGreaterThan(coreIdeaIndex);
  });

  it("parses markdown blocks into contexts with options and option cross-checks", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pwh-expl-test-"));
    const filePath = path.join(tmpDir, "sample.md");

    fs.writeFileSync(
      filePath,
      [
        "# Demo",
        "",
        "### Q0001 — sample.docx (Q1)",
        "",
        "**Stem**: Example stem here?",
        "",
        "**Options**",
        "- **A**. Alpha",
        "- **B**. Beta",
        "",
        "**Correct answer**: **B** — *Beta*",
        "",
        "**Option cross-check**",
        "| Option | What it means | When you'd pick it | Here, why (not) |",
        "|---|---|---|---|",
        "| **A** | Alpha | Never | Incorrect for this scenario. |",
        "| **B** | Beta | Here | Correct. Best fit for the stem. |",
        "",
        "---",
      ].join("\n"),
      "utf8",
    );

    const parsed = parseExplanationMarkdownFile(filePath);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].globalId).toBe("1");
    expect(parsed[0].sourceFile).toBe("sample.docx");
    expect(parsed[0].questionNumberInFile).toBe("1");
    expect(parsed[0].options).toHaveLength(2);
    expect(parsed[0].correctOption).toBe("B");
    expect(parsed[0].correctText).toBe("Beta");
    expect(parsed[0].optionExplanations.A).toBe("Incorrect for this scenario.");
    expect(parsed[0].optionExplanations.B).toBe("Correct. Best fit for the stem.");
    expect(parsed[0].optionCrossCheckTableMarkdown).toContain("| Option | What it means |");
    expect(parsed[0].optionCrossCheckRows).toBe(2);
  });

  it("parses option-by-option sections into per-option explanations", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pwh-expl-test-"));
    const filePath = path.join(tmpDir, "sample-option-by-option.md");

    fs.writeFileSync(
      filePath,
      [
        "# Demo",
        "",
        "### Q0002 — sample.docx (Q2)",
        "",
        "**Stem**: Another stem?",
        "",
        "**Options**",
        "- **A**. Alpha",
        "- **B**. Beta",
        "",
        "**Correct answer**: **B** — *Beta*",
        "",
        "**Option-by-option**",
        "- **A.** Incorrect because X.",
        "- Extra detail for A.",
        "- **B.** Correct because Y.",
        "",
        "---",
      ].join("\n"),
      "utf8",
    );

    const parsed = parseExplanationMarkdownFile(filePath);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].optionExplanations.A).toContain("Incorrect because X.");
    expect(parsed[0].optionExplanations.A).toContain("Extra detail for A.");
    expect(parsed[0].optionExplanations.B).toContain("Correct because Y.");
  });

  it("builds stable deterministic keys for matching", () => {
    const left = buildDeterministicStemOptionCorrectKey({
      stem: "Example stem?",
      options: [
        { key: "A", text: "Alpha" },
        { key: "B", text: "Beta" },
      ],
      correctOption: "B",
      correctText: "Beta",
    });

    const right = buildDeterministicStemOptionCorrectKey({
      stem: "Example   stem?",
      options: [
        { key: "B", text: "Beta" },
        { key: "A", text: "Alpha" },
      ],
      correctOption: "b",
      correctText: "beta",
    });

    expect(left).toBe(right);

    const optionOnlyLeft = buildOptionCorrectKey({
      options: [
        { key: "A", text: "Alpha" },
        { key: "B", text: "Beta" },
      ],
      correctOption: "B",
      correctText: "Beta",
    });
    const optionOnlyRight = buildOptionCorrectKey({
      options: [
        { key: "B", text: "Beta" },
        { key: "A", text: "Alpha" },
      ],
      correctOption: "b",
      correctText: "beta",
    });

    expect(optionOnlyLeft).toBe(optionOnlyRight);

    const optionNoTextLeft = buildOptionCorrectKeyWithoutText({
      options: [
        { key: "A", text: "Alpha" },
        { key: "B", text: "Beta" },
      ],
      correctOption: "B",
    });
    const optionNoTextRight = buildOptionCorrectKeyWithoutText({
      options: [
        { key: "B", text: "Beta changed wording" },
        { key: "A", text: "Alpha changed wording" },
      ],
      correctOption: "b",
    });
    expect(optionNoTextLeft).toBe("A:alpha|B:beta::B");
    expect(optionNoTextRight).toBe("A:alpha changed wording|B:beta changed wording::B");

    const stemCorrectLeft = buildStemCorrectKey({
      stem: "At 8 weeks there is bleeding...",
      correctOption: "G",
    });
    const stemCorrectRight = buildStemCorrectKey({
      stem: "At   8 weeks there is bleeding...",
      correctOption: "g",
    });
    expect(stemCorrectLeft).toBe(stemCorrectRight);
  });
});
