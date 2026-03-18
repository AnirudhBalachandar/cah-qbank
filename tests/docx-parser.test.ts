import { describe, expect, it } from "vitest";

import { normalizeSourceFilePath, parseDocxText, parseHtmlFallbackDoc } from "../scripts/ingest/parsers/docxParser";

const sampleDocxText = `
Section A — Extended Matching Questions (EMQ)
EMQ Set A: Causes of acute wheeze in childhood
Select the SINGLE best option for each question.
Options:
A. Bronchiolitis
B. Viral-induced wheeze
C. Asthma
Question 1. An 8-month-old with coryza, crackles, and widespread wheeze.
Tags: CAH 03 > Respiratory > Bronchiolitis; AUS:3; Difficulty:Intermediate
Question 2. A school-aged child with recurrent interval symptoms and exercise limitation.
Tags: CAH 03 > Respiratory > Asthma
Section B — Single Best Answer (SBA)
Question 3. Best initial management for a febrile child with neck stiffness?
A. Oral fluids only
B. Observe at home without review
C. Urgent senior assessment and sepsis workup
Tags: CAH 06 > Infectious disease > Meningitis; AUS:5; Difficulty:Hard

Answer Key
Q1: A
Q2: C
Q3: C
`;

const answerInstructionText = `
Instructions
Answer Questions Q1 to Q2. Choose the best option.

Q1. First question stem?
A. Option one
B. Option two

Q2. Second question stem?
A. Option alpha
B. Option beta

Answer Key
Q1: A
Q2: B
`;

const verticalAnswerTableText = `
Section A — Single Best Answer
Q1. Which option is correct?
A. Distractor
B. Correct answer

Q2. Another stem here.
A. Correct answer
B. Distractor

Answer Key
Q#
Ans
Tags (short)
1-line rationale
1

B

Sample
Reason
2

A

Sample
Reason
`;

const nestedHtmlQuestionList = `
<p><strong>2011 Term D Paeds Exam - 30 SBA + 30 EMQ</strong></p>
<p><strong>no calculators allowed!</strong></p>
<ol>
  <li>10yo kid, previously well, grade 2/6 murmur, fixed splitting
    <ol>
      <li>ASD*</li>
      <li>VSD</li>
      <li>PDA</li>
    </ol>
  </li>
  <li>Best test for predictive value
    <ol>
      <li>Specificity</li>
      <li><strong>PPV</strong></li>
      <li>NPV</li>
    </ol>
  </li>
</ol>
`;

const wrapperOptionListHtml = `
<p>What is causing the elevated protein?</p>
<ul>
  <li>
    <ol>
      <li>Viral meningitis</li>
      <li><strong>Traumatic tap</strong></li>
      <li>Normal</li>
    </ol>
  </li>
</ul>
`;

const hybridEmqHtml = `
<p>MCQ</p>
<ol>
  <li>Vaccination
    <ol>
      <li>Hib</li>
      <li>Pneumococcal</li>
      <li>Rotavirus</li>
      <li>Pertussis</li>
      <li>3-month-old with apneas and coughing paroxysms -&gt; D</li>
      <li>Vomited after an oral vaccine -&gt; C</li>
    </ol>
  </li>
</ol>
`;

describe("docx parser", () => {
  it("extracts EMQ sets, stems, SBA options, and answers", () => {
    const parsed = parseDocxText(sampleDocxText, "/tmp/sample.docx");

    expect(parsed.emqSets.length).toBe(1);
    expect(parsed.emqSets[0].optionList).toHaveLength(3);

    expect(parsed.questions).toHaveLength(3);
    expect(parsed.questions[0].type).toBe("EMQ_STEM");
    expect(parsed.questions[2].type).toBe("SBA");
    expect(parsed.questions[2].options).toHaveLength(3);
    expect(parsed.questions[2].correctKey).toBe("C");
  });

  it("captures CAH tags, difficulty, AUS score, and module code metadata", () => {
    const parsed = parseDocxText(sampleDocxText, "/tmp/sample.docx");
    const q1 = parsed.questions[0];

    expect(q1.ausScore).toBe(3);
    expect(q1.difficulty).toBe("Intermediate");
    expect(q1.moduleCode).toBe("CAH 03");
    expect(q1.tagPaths[0]).toEqual(["CAH 03", "Respiratory", "Bronchiolitis"]);

    const q3 = parsed.questions[2];
    expect(q3.moduleCode).toBe("CAH 06");
    expect(q3.difficulty).toBe("Hard");
  });

  it("keeps stem hash stable for idempotency", () => {
    const parsedA = parseDocxText(sampleDocxText, "/tmp/a.docx");
    const parsedB = parseDocxText(sampleDocxText, "/tmp/b.docx");

    expect(parsedA.questions[1].source.stemHash).toBe(parsedB.questions[1].source.stemHash);
  });

  it("normalizes source file paths relative to the CAH content root", () => {
    const pathA = "/Users/dev-a/content/CAH_qbank/CAH Questions and papers/sample.docx";
    const pathB = "/Volumes/data/content/CAH_qbank/CAH Questions and papers/sample.docx";

    const normalizedA = normalizeSourceFilePath(pathA, "/Users/dev-a/content/CAH_qbank");
    const normalizedB = normalizeSourceFilePath(pathB, "/Volumes/data/content/CAH_qbank");

    expect(normalizedA).toBe("CAH Questions and papers/sample.docx");
    expect(normalizedB).toBe("CAH Questions and papers/sample.docx");
  });

  it("does not mistake 'Answer Questions' instruction text for an answer-key header", () => {
    const parsed = parseDocxText(answerInstructionText, "/tmp/instruction.docx");

    expect(parsed.questions).toHaveLength(2);
    expect(parsed.questions[0].correctKey).toBe("A");
    expect(parsed.questions[1].correctKey).toBe("B");
  });

  it("parses vertical answer tables even when blank separators are present", () => {
    const parsed = parseDocxText(verticalAnswerTableText, "/tmp/vertical.docx");

    expect(parsed.questions).toHaveLength(2);
    expect(parsed.questions[0].correctKey).toBe("B");
    expect(parsed.questions[1].correctKey).toBe("A");
  });

  it("parses nested HTML MCQ lists even when only generic title paragraphs precede them", () => {
    const parsed = parseHtmlFallbackDoc("/tmp/nested.docx", nestedHtmlQuestionList);

    expect(parsed.questions).toHaveLength(2);
    expect(parsed.questions[0].stem).toContain("grade 2/6 murmur");
    expect(parsed.questions[0].correctKey).toBe("A");
    expect(parsed.questions[0].options[0].text).toBe("ASD");
    expect(parsed.questions[1].correctKey).toBe("B");
  });

  it("does not invent a stem from wrapper lists that only contain answer options", () => {
    const parsed = parseHtmlFallbackDoc("/tmp/wrapper.docx", wrapperOptionListHtml);

    expect(parsed.questions).toHaveLength(0);
  });

  it("converts inline-answer hybrid lists into EMQ sets and stems", () => {
    const parsed = parseHtmlFallbackDoc("/tmp/hybrid.docx", hybridEmqHtml);

    expect(parsed.emqSets).toHaveLength(1);
    expect(parsed.emqSets[0].title).toBe("Vaccination");
    expect(parsed.emqSets[0].optionList).toEqual([
      { key: "A", text: "Hib" },
      { key: "B", text: "Pneumococcal" },
      { key: "C", text: "Rotavirus" },
      { key: "D", text: "Pertussis" },
    ]);

    expect(parsed.questions).toHaveLength(2);
    expect(parsed.questions[0].type).toBe("EMQ_STEM");
    expect(parsed.questions[0].stem).toBe("3-month-old with apneas and coughing paroxysms");
    expect(parsed.questions[0].correctKey).toBe("D");
    expect(parsed.questions[0].options).toEqual([]);
    expect(parsed.questions[1].correctKey).toBe("C");
    expect(parsed.questions[1].emqLocalId).toBe(parsed.emqSets[0].localId);
  });
});
