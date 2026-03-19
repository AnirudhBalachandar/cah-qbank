import { describe, expect, it } from "vitest";

import {
  buildNotebookLmFingerprint,
  normalizeNotebookLmQuestion,
  parseArgs,
} from "../scripts/generation/import_notebooklm_quizzes";

describe("notebookLM importer normalization", () => {
  it("normalizes a standard four-option notebookLM question", () => {
    const result = normalizeNotebookLmQuestion({
      rawQuestion: {
        question: "Which group are considered mandatory reporters in the community?",
        hint: "Think about education and justice roles.",
        answerOptions: [
          { text: "School principals, police, and childcare workers.", isCorrect: true, rationale: "These are legally identified as mandatory reporters." },
          { text: "All members of the general public.", isCorrect: false, rationale: "They may report but are not mandatory reporters." },
          { text: "Only public hospital clinicians.", isCorrect: false, rationale: "The duty extends beyond public hospital clinicians." },
          { text: "Retail and hospitality workers.", isCorrect: false, rationale: "These roles are not listed as mandatory reporters." },
        ],
      },
      lectureRow: {
        lecture: "1",
        title: "00001 CAR_reporting 240717-s1-low.mp4",
        source_id: "source-1",
        artifact_id: "artifact-1",
      },
      quizFileName: "quiz_001.json",
      quizTitle: "quiz title",
      questionIndex: 1,
      bundleId: "bundle-1",
      zipPath: "/tmp/notebooklm.zip",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.options).toEqual([
      { key: "A", text: "School principals, police, and childcare workers." },
      { key: "B", text: "All members of the general public." },
      { key: "C", text: "Only public hospital clinicians." },
      { key: "D", text: "Retail and hospitality workers." },
    ]);
    expect(result.value.correctKey).toBe("A");
    expect(result.value.explanation).toContain("legally identified as mandatory reporters");
    expect(result.value.rationale).toContain("education and justice roles");
    expect(result.value.whyOthersWrong.D).toContain("not listed as mandatory reporters");
  });

  it("supports answer_options alias and true/false questions", () => {
    const result = normalizeNotebookLmQuestion({
      rawQuestion: {
        question: "True or False: Vision remains normal in most conjunctivitis cases.",
        answer_options: [
          { text: "True", isCorrect: true, rationale: "Vision is generally normal unless the cornea is involved." },
          { text: "False", isCorrect: false, rationale: "Reduced vision is a warning sign for more serious disease." },
        ],
      },
      lectureRow: {
        lecture: "36",
        title: "quiz title",
        source_id: "source-36",
        artifact_id: "artifact-36",
      },
      quizFileName: "quiz_036.json",
      quizTitle: "quiz title",
      questionIndex: 12,
      bundleId: "bundle-1",
      zipPath: "/tmp/notebooklm.zip",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.options).toEqual([
      { key: "A", text: "True" },
      { key: "B", text: "False" },
    ]);
    expect(result.value.correctKey).toBe("A");
    expect(result.value.whyOthersWrong.A).toContain("generally normal");
    expect(result.value.whyOthersWrong.B).toContain("warning sign");
  });

  it("rejects malformed questions without exactly one correct answer", () => {
    const result = normalizeNotebookLmQuestion({
      rawQuestion: {
        question: "Malformed item",
        answerOptions: [
          { text: "Option 1", isCorrect: false, rationale: "No." },
          { text: "Option 2", isCorrect: false, rationale: "Also no." },
        ],
      },
      lectureRow: null,
      quizFileName: "quiz_bad.json",
      quizTitle: null,
      questionIndex: 1,
      bundleId: "bundle-1",
      zipPath: "/tmp/notebooklm.zip",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("exactly 1 correct answer");
  });

  it("builds stable fingerprints from logical question identity", () => {
    const first = buildNotebookLmFingerprint({
      bundleId: "bundle-1",
      lecture: "12",
      quizFileName: "quiz_012.json",
      questionIndex: 3,
      stem: "What is the best next step?",
      options: [
        { key: "A", text: "Observe" },
        { key: "B", text: "Admit" },
      ],
    });
    const second = buildNotebookLmFingerprint({
      bundleId: "bundle-1",
      lecture: "12",
      quizFileName: "quiz_012.json",
      questionIndex: 3,
      stem: "What is the best next step?",
      options: [
        { key: "A", text: "Observe" },
        { key: "B", text: "Admit" },
      ],
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^notebooklm-bundle-1-/);
  });

  it("parses overlap override flag explicitly", () => {
    const args = parseArgs([
      "--zip",
      "/tmp/notebooklm.zip",
      "--persist-db",
      "true",
      "--allow-overlap",
      "true",
    ]);

    expect(args.zip).toBe("/tmp/notebooklm.zip");
    expect(args.persist).toBe(true);
    expect(args.allowOverlap).toBe(true);
  });
});
