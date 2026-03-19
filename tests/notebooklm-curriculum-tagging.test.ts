import { describe, expect, it } from "vitest";

import { classifyNotebookLmLectureFallback } from "../scripts/audit/apply_notebooklm_curriculum_tags";

describe("notebookLM curriculum fallback classifier", () => {
  it("maps child protection reporting lectures to community-based paediatrics", () => {
    expect(classifyNotebookLmLectureFallback("00001 CAR_reporting 240717-s1-low.mp4", "Child Protection Quiz")).toBe(
      "Community-based Paediatrics",
    );
  });

  it("maps adolescent lecture titles to adolescent medicine", () => {
    expect(classifyNotebookLmLectureFallback("00078 adolescent_basic fac-s1-low.mp4", "Adolescent basics")).toBe(
      "Adolescent Medicine",
    );
  });

  it("maps fracture lectures to paediatric surgery", () => {
    expect(classifyNotebookLmLectureFallback("00088 fractures-management-s1-low.mp4", "Fractures")).toBe(
      "Paediatric Surgery",
    );
  });

  it("maps respiratory specialty lectures to paediatric sub-specialties", () => {
    expect(classifyNotebookLmLectureFallback("00017 CF lecture-s1-low.mp4", "Respiratory")).toBe(
      "Paediatric Sub-specialties",
    );
  });

  it("maps common problems lectures to general paediatrics", () => {
    expect(classifyNotebookLmLectureFallback("00006 common-problems-cons-s1-low.mp4", "Constipation")).toBe(
      "General Paediatrics",
    );
  });

  it("maps truncated pain management lecture 41 to emergency paediatrics", () => {
    expect(classifyNotebookLmLectureFallback("00041 Year 3 CAH Pain Mana-s1-low.mp4", "Pain Quiz")).toBe(
      "Emergency Paediatrics",
    );
  });

  it("maps lecture 69 headaches to paediatric sub-specialties", () => {
    expect(classifyNotebookLmLectureFallback("00069 Headaches_Procopis_E-s1-low.mp4", "Headache Quiz")).toBe(
      "Paediatric Sub-specialties",
    );
  });
});
