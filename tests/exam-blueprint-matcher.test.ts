import { describe, expect, it } from "vitest";

import { matchBlueprintRow } from "../scripts/audit/exam_blueprint_matcher";

const rows = [
  { rowIndex: 1, discipline: "CAH KAT", curriculumArea: "General Paediatrics", percentOfExam: 0.2667, examQuestionCount: 16 },
  { rowIndex: 2, discipline: "CAH KAT", curriculumArea: "Paediatric Sub-specialties", percentOfExam: 0.2, examQuestionCount: 12 },
  { rowIndex: 3, discipline: "CAH KAT", curriculumArea: "Paediatric Surgery", percentOfExam: 0.1667, examQuestionCount: 10 },
  { rowIndex: 4, discipline: "CAH KAT", curriculumArea: "Emergency Paediatrics", percentOfExam: 0.1667, examQuestionCount: 10 },
  { rowIndex: 5, discipline: "CAH KAT", curriculumArea: "Adolescent Medicine", percentOfExam: 0.1, examQuestionCount: 6 },
  { rowIndex: 6, discipline: "CAH KAT", curriculumArea: "Community-based Paediatrics", percentOfExam: 0.1, examQuestionCount: 6 },
];

describe("exam blueprint matcher", () => {
  it("matches adolescent medicine from classic adolescent health cues", () => {
    const result = matchBlueprintRow(rows, {
      stem: "Best test in anorexia nervosa and refeeding risk in a 15 year old",
      options: [{ text: "Electrolytes" }],
    });

    expect(result.row?.curriculumArea).toBe("Adolescent Medicine");
  });

  it("matches community-based paediatrics from indigenous and immunisation cues", () => {
    const result = matchBlueprintRow(rows, {
      stem: "Which details should be recorded on the Australian Childhood Immunisation Register for an Aboriginal child?",
      options: [{ text: "All vaccinations given to Australian children younger than 7 years" }],
    });

    expect(result.row?.curriculumArea).toBe("Community-based Paediatrics");
  });

  it("matches paediatric surgery from classic surgical presentations", () => {
    const result = matchBlueprintRow(rows, {
      stem: "Bile stained vomiting and no gas beyond duodenum in a newborn",
      options: [{ text: "Malrotation with volvulus" }],
    });

    expect(result.row?.curriculumArea).toBe("Paediatric Surgery");
  });

  it("matches emergency paediatrics from acute management cues", () => {
    const result = matchBlueprintRow(rows, {
      stem: "12 month old with bronchiolitis, oxygen saturation 90% on room air. Best immediate management?",
      options: [{ text: "High flow oxygen via nasal prongs" }],
    });

    expect(result.row?.curriculumArea).toBe("Emergency Paediatrics");
  });

  it("uses option text to identify paediatric sub-specialties", () => {
    const result = matchBlueprintRow(rows, {
      stem: "Murmur 2/6 with fixed split second heart sound",
      options: [{ text: "ASD" }, { text: "VSD" }, { text: "PDA" }],
    });

    expect(result.row?.curriculumArea).toBe("Paediatric Sub-specialties");
  });

  it("leaves weak signals for manual review", () => {
    const result = matchBlueprintRow(rows, {
      stem: "A child presents for a broad review with no other defining details",
      options: [{ text: "Observe" }, { text: "Follow up" }],
    });

    expect(result.row).toBeNull();
    expect(result.reason).toBe("no_curriculum_signal");
  });
});
