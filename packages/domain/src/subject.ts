export const SUBJECT_CONFIG = {
  code: "CAH",
  appName: "CAH QBank",
  shortName: "CAH",
  subjectName: "Child and Adolescent Health",
  tagline: "Child and Adolescent Health revision for Sydney Medical School paediatrics.",
  databaseName: "cah_qbank",
  contentRootRelative: "content/CAH_qbank",
  downloadsFallbackDirName: "CAH qbank",
  questionDocsDirName: "CAH Questions and papers",
  notesDirName: "CAH Notes and materials",
  metadataDirName: "metadata",
  blueprintRootName: "CAH Exam Blueprint",
  defaultLectureRootName: "Lecture Videos",
  moduleCodePrefix: "CAH",
  supportedQuestionTypes: ["SBA", "EMQ_STEM"] as const,
  defaultQuestionSourceDir: "import_source/questions",
  defaultNotesSourceDir: "import_source/notes",
  defaultBlueprintFile: "metadata/exam_blueprint.csv",
  defaultModuleMapFile: "metadata/module_map.csv",
} as const;

export type SupportedQuestionType = (typeof SUBJECT_CONFIG.supportedQuestionTypes)[number];

export type ExamBlueprintRow = {
  rowIndex: number;
  discipline: string;
  curriculumArea: string;
  percentOfExam: number | null;
  examQuestionCount: number | null;
};

export function formatExamWeight(percentOfExam: number | null, examQuestionCount: number | null, totalQuestions: number | null) {
  if (percentOfExam === null && examQuestionCount === null) {
    return null;
  }

  const parts: string[] = [];
  if (typeof percentOfExam === "number" && Number.isFinite(percentOfExam) && percentOfExam > 0) {
    const percentage = (percentOfExam * 100)
      .toFixed(2)
      .replace(/\.00$/, "")
      .replace(/(\.\d)0$/, "$1");
    parts.push(`${percentage}%`);
  }

  if (typeof examQuestionCount === "number" && Number.isFinite(examQuestionCount) && examQuestionCount > 0) {
    if (typeof totalQuestions === "number" && Number.isFinite(totalQuestions) && totalQuestions > 0) {
      parts.push(`${examQuestionCount}/${totalQuestions}`);
    } else {
      parts.push(String(examQuestionCount));
    }
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}
