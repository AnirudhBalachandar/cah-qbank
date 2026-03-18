import fs from "node:fs";
import path from "node:path";

import { parse } from "csv-parse/sync";
import { SUBJECT_CONFIG, formatExamWeight, type ExamBlueprintRow } from "@cah-qbank/domain";

export type ExamDiscipline = {
  name: string;
  order: number;
  percentOfExam: number | null;
  examQuestionCount: number | null;
  displayWeight: string | null;
};

export type LoadedExamBlueprint = {
  rootName: string;
  totalQuestionCount: number | null;
  disciplines: ExamDiscipline[];
  rows: ExamBlueprintRow[];
  rowByName: Map<string, ExamBlueprintRow>;
  disciplineByName: Map<string, ExamDiscipline>;
  blueprintPath: string;
};

function parseNullableNumber(raw: string | undefined) {
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function resolveBlueprintPath(contentRoot = path.resolve(SUBJECT_CONFIG.contentRootRelative)) {
  return path.join(contentRoot, SUBJECT_CONFIG.defaultBlueprintFile);
}

export function loadExamBlueprint(contentRoot = path.resolve(SUBJECT_CONFIG.contentRootRelative)): LoadedExamBlueprint {
  const blueprintPath = resolveBlueprintPath(contentRoot);
  const rows = fs.existsSync(blueprintPath)
    ? (parse(fs.readFileSync(blueprintPath, "utf8"), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as Array<Record<string, string>>)
        .map((row, index) => ({
          rowIndex: Number.parseInt(row.rowIndex ?? row.row ?? String(index + 1), 10),
          discipline: (row.discipline ?? row.domain ?? "").trim(),
          curriculumArea: (row.curriculumArea ?? row.curriculum ?? row.topic ?? "").trim(),
          percentOfExam: parseNullableNumber(row.percentOfExam),
          examQuestionCount: parseNullableNumber(row.examQuestionCount),
        }))
        .filter((row) => Number.isFinite(row.rowIndex) && row.rowIndex > 0 && row.discipline && row.curriculumArea)
        .sort((a, b) => a.rowIndex - b.rowIndex)
    : [];

  const totalQuestionCount = rows.every((row) => typeof row.examQuestionCount === "number")
    ? rows.reduce((sum, row) => sum + (row.examQuestionCount ?? 0), 0)
    : null;

  const disciplineMap = new Map<string, { order: number; percentOfExam: number | null; examQuestionCount: number | null }>();
  for (const row of rows) {
    const existing = disciplineMap.get(row.discipline);
    if (!existing) {
      disciplineMap.set(row.discipline, {
        order: disciplineMap.size + 1,
        percentOfExam: row.percentOfExam,
        examQuestionCount: row.examQuestionCount,
      });
      continue;
    }
    disciplineMap.set(row.discipline, {
      order: existing.order,
      percentOfExam: (existing.percentOfExam ?? 0) + (row.percentOfExam ?? 0),
      examQuestionCount: (existing.examQuestionCount ?? 0) + (row.examQuestionCount ?? 0),
    });
  }

  const disciplines = Array.from(disciplineMap.entries()).map(([name, values]) => ({
    name,
    order: values.order,
    percentOfExam: values.percentOfExam,
    examQuestionCount: values.examQuestionCount,
    displayWeight: formatExamWeight(values.percentOfExam, values.examQuestionCount, totalQuestionCount),
  }));

  return {
    rootName: SUBJECT_CONFIG.blueprintRootName,
    totalQuestionCount,
    disciplines,
    rows,
    rowByName: new Map(rows.map((row) => [row.curriculumArea, row])),
    disciplineByName: new Map(disciplines.map((discipline) => [discipline.name, discipline])),
    blueprintPath,
  };
}
