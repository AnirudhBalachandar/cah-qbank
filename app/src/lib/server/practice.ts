import type { Prisma } from "@/lib/generated/prisma";
import { SUBJECT_CONFIG, formatExamWeight } from "@cah-qbank/domain";

import { prisma } from "@/lib/db";
import {
  getExamBlueprintConfig,
} from "@/lib/exam-blueprint";
import { recomputeMasteryForUser, updateMasteryForAttempt } from "@/lib/server/mastery";
import type { practiceSetupSchema } from "@/lib/server/schemas";
import { rankWeaknessQuestionCandidates } from "@/lib/server/weakness-session";
import { calculateWeaknessScores, getRecommendedWeaknessMix } from "@/lib/server/weakness";
import type { QuestionOption } from "@/lib/types";
import type { z } from "zod";

type PracticeSetupInput = z.infer<typeof practiceSetupSchema>;

type SupportedTagKind = "topic" | "module" | "ranZcogDomain" | "meta";

export type TagTreeNode = {
  id: string;
  name: string;
  kind: SupportedTagKind;
  exam?: {
    isExamTag: true;
    role: "root" | "discipline" | "curriculum";
    rowIndex?: number;
    discipline?: string;
    percentOfExam?: number;
    examQuestionCount?: number;
    displayWeight?: string;
  };
  children: TagTreeNode[];
};

export type SessionQuestion = {
  id: string;
  type: "SBA" | "EMQ_STEM";
  stem: string;
  options: QuestionOption[];
  correctKey: string | null;
  explanation: string | null;
  rationale: string | null;
  whyOthersWrong: Record<string, string>;
  citations: Array<Record<string, unknown>>;
  source: Record<string, unknown>;
  tags: { id: string; name: string; kind: SupportedTagKind }[];
  flagged: boolean;
  noteMarkdown: string | null;
  emqSet: {
    id: string;
    title: string | null;
    instructions: string | null;
    optionList: QuestionOption[];
  } | null;
};

export type ProgressQuestionStatus = "unseen" | "correct" | "incorrect";

function isQuestionOptionArray(value: unknown): value is QuestionOption[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).key === "string" &&
        typeof (item as Record<string, unknown>).text === "string",
    )
  );
}

function asOptionArray(value: unknown): QuestionOption[] {
  return isQuestionOptionArray(value) ? value : [];
}

function asObjectArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null) : [];
}

function asStringRecord(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
    if (typeof rawValue !== "string") {
      continue;
    }
    const key = rawKey.trim().toUpperCase();
    const explanation = rawValue.trim();
    if (!key || !explanation) {
      continue;
    }
    result[key] = explanation;
  }
  return result;
}

function hasCompleteOptionExplanations(
  optionExplanations: Record<string, string>,
  optionKeys: string[],
) {
  if (optionKeys.length === 0) {
    return false;
  }

  return optionKeys.every((key) => {
    const explanation = optionExplanations[key];
    return typeof explanation === "string" && explanation.trim().length > 0;
  });
}

function shuffle<T>(list: T[]) {
  const clone = [...list];
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function startOfWeek(date: Date) {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const copy = new Date(date);
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function moduleWeightForKind(kind: SupportedTagKind) {
  if (kind === "module") return 1;
  if (kind === "topic") return 0.6;
  if (kind === "ranZcogDomain") return 0.5;
  return 0.3;
}

function parseLectureTagNumber(name: string) {
  const match = name.match(/^Lecture\s+(\d{1,3})$/i);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : null;
}

function compareTagsForTree(
  a: { name: string; kind: SupportedTagKind },
  b: { name: string; kind: SupportedTagKind },
  parentName: string | null,
  parentExamDepth: number,
) {
  const blueprint = getExamBlueprintConfig();

  if (parentExamDepth === 1) {
    const aDiscipline = blueprint.disciplineByName.get(a.name);
    const bDiscipline = blueprint.disciplineByName.get(b.name);
    if (aDiscipline && bDiscipline) {
      return aDiscipline.order - bDiscipline.order;
    }
  }

  if (parentExamDepth === 2) {
    const aRow = blueprint.rowByName.get(a.name);
    const bRow = blueprint.rowByName.get(b.name);
    if (aRow && bRow) {
      return aRow.rowIndex - bRow.rowIndex;
    }
  }

  if (parentName === SUBJECT_CONFIG.defaultLectureRootName) {
    const aNum = parseLectureTagNumber(a.name);
    const bNum = parseLectureTagNumber(b.name);
    if (aNum !== null && bNum !== null) {
      return aNum - bNum;
    }
  }

  if (parentName === null) {
    const aPriority =
      a.kind === "topic" && a.name === blueprint.rootName
        ? 0
        : a.kind === "topic" && a.name === SUBJECT_CONFIG.defaultLectureRootName
          ? 1
          : 2;
    const bPriority =
      b.kind === "topic" && b.name === blueprint.rootName
        ? 0
        : b.kind === "topic" && b.name === SUBJECT_CONFIG.defaultLectureRootName
          ? 1
          : 2;
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }
  }

  if (a.kind !== b.kind) {
    return a.kind.localeCompare(b.kind);
  }

  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}

export async function getTagTree() {
  const blueprint = getExamBlueprintConfig();
  const tags = await prisma.tag.findMany({
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      kind: true,
      parentId: true,
    },
  });

  const childrenMap = new Map<string | null, typeof tags>();
  for (const tag of tags) {
    const key = tag.parentId ?? null;
    const existing = childrenMap.get(key) ?? [];
    existing.push(tag);
    childrenMap.set(key, existing);
  }

  const tagById = new Map(tags.map((tag) => [tag.id, tag]));

  const buildExamNodeMeta = (
    name: string,
    depth: number,
  ): TagTreeNode["exam"] | undefined => {
    if (depth === 1 && name === blueprint.rootName) {
      return {
        isExamTag: true,
        role: "root",
      };
    }

    if (depth === 2) {
      const discipline = blueprint.disciplineByName.get(name);
      if (!discipline) {
        return undefined;
      }
      return {
        isExamTag: true,
        role: "discipline",
        discipline: discipline.name,
        percentOfExam: discipline.percentOfExam ?? undefined,
        examQuestionCount: discipline.examQuestionCount ?? undefined,
        displayWeight: discipline.displayWeight ?? undefined,
      };
    }

    if (depth === 3) {
      const row = blueprint.rowByName.get(name);
      if (!row) {
        return undefined;
      }
      return {
        isExamTag: true,
        role: "curriculum",
        rowIndex: row.rowIndex,
        discipline: row.discipline,
        percentOfExam: row.percentOfExam ?? undefined,
        examQuestionCount: row.examQuestionCount ?? undefined,
        displayWeight: formatExamWeight(row.percentOfExam, row.examQuestionCount, blueprint.totalQuestionCount) ?? undefined,
      };
    }

    return undefined;
  };

  const buildNode = (parentId: string | null, parentExamDepth: number): TagTreeNode[] => {
    const parentName = parentId ? tagById.get(parentId)?.name ?? null : null;
    const children = [...(childrenMap.get(parentId) ?? [])].sort((a, b) =>
      compareTagsForTree(a, b, parentName, parentExamDepth),
    );
    return children.map((child) => {
      const childExamDepth =
        parentExamDepth > 0
          ? parentExamDepth + 1
          : parentId === null && child.name === blueprint.rootName
            ? 1
            : 0;

      return {
        id: child.id,
        name: child.name,
        kind: child.kind,
        exam: buildExamNodeMeta(child.name, childExamDepth),
        children: buildNode(child.id, childExamDepth),
      };
    });
  };

  return buildNode(null, 0);
}

export async function getWeaknessRankedTagIds(userId: string) {
  const [attempts, masteryRows] = await Promise.all([
    prisma.attempt.findMany({
      where: { userId },
      select: {
        createdAt: true,
        question: {
          select: {
            questionTags: {
              select: {
                tagId: true,
                tag: {
                  select: {
                    kind: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.mastery.findMany({
      where: { userId },
      include: { tag: true },
    }),
  ]);

  const attemptMap = new Map<string, { attempts: number; lastAttemptAt: Date | null }>();

  for (const attempt of attempts) {
    for (const questionTag of attempt.question.questionTags) {
      if (!["topic", "module", "ranZcogDomain"].includes(questionTag.tag.kind)) {
        continue;
      }

      const existing = attemptMap.get(questionTag.tagId) ?? {
        attempts: 0,
        lastAttemptAt: null,
      };

      existing.attempts += 1;
      if (!existing.lastAttemptAt || existing.lastAttemptAt < attempt.createdAt) {
        existing.lastAttemptAt = attempt.createdAt;
      }

      attemptMap.set(questionTag.tagId, existing);
    }
  }

  const candidates = masteryRows
    .filter((row) => ["topic", "module", "ranZcogDomain"].includes(row.tag.kind))
    .map((row) => ({
      tagId: row.tagId,
      tagName: row.tag.name,
      masteryScore: row.masteryScore,
      attempts: attemptMap.get(row.tagId)?.attempts ?? 0,
      lastAttemptAt: attemptMap.get(row.tagId)?.lastAttemptAt ?? null,
      moduleWeight: moduleWeightForKind(row.tag.kind),
    }));

  const withAttemptsOnly = candidates.length > 0
    ? candidates
    : Array.from(attemptMap.entries()).map(([tagId, value]) => ({
        tagId,
        tagName: tagId,
        masteryScore: 0.5,
        attempts: value.attempts,
        lastAttemptAt: value.lastAttemptAt,
        moduleWeight: 0.5,
      }));

  return calculateWeaknessScores(withAttemptsOnly);
}

function buildPracticeQuestionBaseWhere(input: PracticeSetupInput): Prisma.QuestionWhereInput {
  return {
    status: "published",
    type: {
      in: input.questionTypes,
    },
    ...(input.difficulties.length > 0 ? { difficulty: { in: input.difficulties } } : {}),
    ...(input.ausScores.length > 0 ? { ausScore: { in: input.ausScores } } : {}),
  };
}

function withPracticeProgressFilters(where: Prisma.QuestionWhereInput, userId: string, input: PracticeSetupInput): Prisma.QuestionWhereInput {
  const nextWhere: Prisma.QuestionWhereInput = { ...where };

  if (input.unseenOnly) {
    nextWhere.attempts = {
      ...(nextWhere.attempts ?? {}),
      none: { userId },
    };
  }

  if (input.incorrectOnly) {
    nextWhere.attempts = {
      ...(nextWhere.attempts ?? {}),
      some: { userId, isCorrect: false },
    };
  }

  if (input.flaggedOnly) {
    nextWhere.flags = { some: { userId } };
  }

  return nextWhere;
}

async function resolvePracticeQuestionBaseScope(userId: string, input: PracticeSetupInput) {
  const baseWhere = buildPracticeQuestionBaseWhere(input);
  const weaknessScores = input.mode === "weakness" ? await getWeaknessRankedTagIds(userId) : [];

  if (input.mode !== "weakness" && input.tagIds.length > 0) {
    baseWhere.questionTags = { some: { tagId: { in: input.tagIds } } };
  }

  if (input.mode === "weakness") {
    const topTags = weaknessScores.slice(0, 8);
    if (topTags.length > 0) {
      baseWhere.questionTags = {
        some: {
          tagId: {
            in: topTags.map((tag) => tag.tagId),
          },
        },
      };
    }
  }

  return {
    baseWhere,
    weaknessScores,
  };
}

export async function getPracticeAvailability(userId: string, input: PracticeSetupInput) {
  const { baseWhere } = await resolvePracticeQuestionBaseScope(userId, input);
  const activeWhere = withPracticeProgressFilters(baseWhere, userId, input);

  const [totalPublishedQuestions, baseFilteredCount, activeFilteredCount, unseenInBaseFiltered, incorrectInBaseFiltered, flaggedInBaseFiltered] =
    await Promise.all([
      prisma.question.count({ where: { status: "published" } }),
      prisma.question.count({ where: baseWhere }),
      prisma.question.count({ where: activeWhere }),
      prisma.question.count({
        where: {
          ...baseWhere,
          attempts: { none: { userId } },
        },
      }),
      prisma.question.count({
        where: {
          ...baseWhere,
          attempts: { some: { userId, isCorrect: false } },
        },
      }),
      prisma.question.count({
        where: {
          ...baseWhere,
          flags: { some: { userId } },
        },
      }),
    ]);

  return {
    totalPublishedQuestions,
    baseFilteredCount,
    activeFilteredCount,
    unseenInBaseFiltered,
    incorrectInBaseFiltered,
    flaggedInBaseFiltered,
    canStartSession: activeFilteredCount > 0,
  };
}

async function selectQuestionIds(userId: string, input: PracticeSetupInput) {
  const { baseWhere, weaknessScores } = await resolvePracticeQuestionBaseScope(userId, input);
  const filteredWhere = withPracticeProgressFilters(baseWhere, userId, input);

  if (input.mode === "weakness") {
    const topTags = weaknessScores.slice(0, 8);

    const candidates = await prisma.question.findMany({
      where: filteredWhere,
      select: {
        id: true,
        questionTags: { select: { tagId: true } },
        attempts: {
          where: { userId },
          select: { isCorrect: true },
        },
      },
      take: 1200,
    });

    const topTagIndex = new Map(topTags.map((tag, index) => [tag.tagId, index]));

    const rankedCandidates = candidates
      .map((question) => ({
        id: question.id,
        tagIds: question.questionTags.map((tag) => tag.tagId),
        attempts: question.attempts,
      }));

    const ranked = rankWeaknessQuestionCandidates(rankedCandidates, topTagIndex, topTags.length);

    if (ranked.length >= input.questionCount) {
      return ranked.slice(0, input.questionCount);
    }

    const fallback = await prisma.question.findMany({
      where: {
        ...filteredWhere,
        id: { notIn: ranked },
      },
      select: { id: true },
      take: input.questionCount * 2,
    });

    const deterministicFallback = fallback.map((item) => item.id).sort((a, b) => a.localeCompare(b));
    return [...ranked, ...deterministicFallback.slice(0, input.questionCount - ranked.length)];
  }

  const questionPool = await prisma.question.findMany({
    where: filteredWhere,
    select: { id: true },
    take: 2000,
  });

  return shuffle(questionPool.map((item) => item.id)).slice(0, input.questionCount);
}

export async function startPracticeSession(userId: string, input: PracticeSetupInput) {
  const questionIds = await selectQuestionIds(userId, input);

  if (questionIds.length === 0) {
    return null;
  }

  const session = await prisma.practiceSession.create({
    data: {
      userId,
      mode: input.mode,
      durationMinutes: input.mode === "timed" ? input.durationMinutes ?? null : null,
      questionIds,
      filters: input,
    },
    select: {
      id: true,
      questionIds: true,
    },
  });

  return {
    id: session.id,
    questionIds: session.questionIds as string[],
  };
}

export async function getSessionDetail(userId: string, sessionId: string) {
  const session = await prisma.practiceSession.findFirst({
    where: { id: sessionId, userId },
    select: {
      id: true,
      mode: true,
      durationMinutes: true,
      createdAt: true,
      completedAt: true,
      questionIds: true,
      attempts: {
        where: { userId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          questionId: true,
          selectedKey: true,
          isCorrect: true,
          createdAt: true,
          timeSpentMs: true,
          confidence: true,
        },
      },
    },
  });

  if (!session) {
    return null;
  }

  const questionIds = session.questionIds as string[];
  const questions = await prisma.question.findMany({
    where: {
      id: { in: questionIds },
    },
    select: {
      id: true,
      type: true,
      stem: true,
      options: true,
      correctKey: true,
      explanation: true,
      rationale: true,
      whyOthersWrong: true,
      citations: true,
      source: true,
      emqLinks: {
        include: {
          emqSet: {
            select: {
              id: true,
              title: true,
              instructions: true,
              optionList: true,
            },
          },
        },
      },
      flags: {
        where: { userId },
        select: { userId: true },
      },
      notes: {
        where: { userId },
        select: { noteMarkdown: true },
      },
      questionTags: {
        include: { tag: true },
      },
    },
  });

  const orderMap = new Map(questionIds.map((id, index) => [id, index]));
  const orderedQuestions = questions.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));

  const questionRecords: SessionQuestion[] = orderedQuestions.map((question) => ({
    id: question.id,
    type: question.type,
    stem: question.stem,
    options: asOptionArray(question.options),
    correctKey: question.correctKey,
    explanation: question.explanation,
    rationale: question.rationale,
    whyOthersWrong: asStringRecord(question.whyOthersWrong),
    citations: asObjectArray(question.citations),
    source: (question.source as Record<string, unknown>) ?? {},
    tags: question.questionTags.map((questionTag) => ({
      id: questionTag.tag.id,
      name: questionTag.tag.name,
      kind: questionTag.tag.kind,
    })),
    flagged: question.flags.length > 0,
    noteMarkdown: question.notes[0]?.noteMarkdown ?? null,
    emqSet:
      question.emqLinks.length > 0
        ? {
            id: question.emqLinks[0].emqSet.id,
            title: question.emqLinks[0].emqSet.title,
            instructions: question.emqLinks[0].emqSet.instructions,
            optionList: asOptionArray(question.emqLinks[0].emqSet.optionList),
          }
        : null,
  }));

  const latestAttemptByQuestion = new Map(
    session.attempts.reduce<Array<[string, (typeof session.attempts)[number]]>>((acc, attempt) => {
      acc.push([attempt.questionId, attempt]);
      return acc;
    }, []),
  );

  return {
    id: session.id,
    mode: session.mode,
    durationMinutes: session.durationMinutes,
    createdAt: session.createdAt,
    completedAt: session.completedAt,
    questions: questionRecords,
    latestAttemptByQuestion,
  };
}

export async function submitSessionAnswer({
  userId,
  sessionId,
  questionId,
  selectedKey,
  timeSpentMs,
  confidence,
}: {
  userId: string;
  sessionId: string;
  questionId: string;
  selectedKey: string;
  timeSpentMs?: number;
  confidence?: number;
}) {
  const session = await prisma.practiceSession.findFirst({
    where: { id: sessionId, userId },
    select: {
      id: true,
      questionIds: true,
      mode: true,
    },
  });

  if (!session) {
    return null;
  }

  const questionIds = session.questionIds as string[];
  if (!questionIds.includes(questionId)) {
    return null;
  }

  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: {
      id: true,
      stem: true,
      options: true,
      correctKey: true,
      explanation: true,
      rationale: true,
      whyOthersWrong: true,
      citations: true,
    },
  });

  if (!question) {
    return null;
  }

  const normalizedChoice = selectedKey.trim().toUpperCase();
  const isCorrect = question.correctKey ? normalizedChoice === question.correctKey.toUpperCase() : false;
  const optionList = asOptionArray(question.options);
  const correctOptionText = question.correctKey
    ? optionList.find((option) => option.key.toUpperCase() === question.correctKey?.toUpperCase())?.text ?? null
    : null;
  const explanationText = question.explanation?.trim() || "No imported explanation available for this question yet.";
  const rationaleText = question.rationale?.trim() || null;

  const optionKeys = optionList.map((option) => option.key.trim().toUpperCase()).filter(Boolean);
  const cachedOptionExplanations = asStringRecord(question.whyOthersWrong);
  const hasCachedOptionExplanations = hasCompleteOptionExplanations(cachedOptionExplanations, optionKeys);
  const optionExplanations = hasCachedOptionExplanations ? cachedOptionExplanations : {};
  const optionExplanationsSource: "cached" | "fallback" = hasCachedOptionExplanations ? "cached" : "fallback";

  await prisma.attempt.create({
    data: {
      userId,
      questionId,
      sessionId,
      selectedKey: normalizedChoice,
      isCorrect,
      timeSpentMs: timeSpentMs ?? null,
      confidence: confidence ?? null,
      mode: session.mode,
    },
  });

  await updateMasteryForAttempt({
    userId,
    questionId,
    isCorrect,
    confidence,
  });

  const attemptQuestionIds = await prisma.attempt.findMany({
    where: { userId, sessionId },
    select: { questionId: true },
  });

  const distinctQuestionCount = new Set(attemptQuestionIds.map((item) => item.questionId)).size;
  if (distinctQuestionCount >= questionIds.length) {
    await prisma.practiceSession.update({
      where: { id: sessionId },
      data: { completedAt: new Date() },
    });
  }

  return {
    correctKey: question.correctKey,
    correctText: correctOptionText,
    explanation: explanationText,
    rationale: rationaleText,
    optionExplanations,
    optionExplanationsSource,
    citations: asObjectArray(question.citations),
    isCorrect,
  };
}

export async function resetUserPracticeProgress(userId: string) {
  await prisma.$transaction([
    prisma.attempt.deleteMany({ where: { userId } }),
    prisma.mastery.deleteMany({ where: { userId } }),
  ]);
}

export async function setUserQuestionProgressStatus({
  userId,
  questionId,
  status,
  confidence,
}: {
  userId: string;
  questionId: string;
  status: ProgressQuestionStatus;
  confidence?: number;
}) {
  const question = await prisma.question.findFirst({
    where: {
      id: questionId,
      status: "published",
    },
    select: {
      id: true,
      correctKey: true,
      options: true,
    },
  });

  if (!question) {
    return { ok: false as const, reason: "QUESTION_NOT_FOUND" as const };
  }

  const optionList = asOptionArray(question.options);
  const normalizedCorrectKey = question.correctKey?.trim().toUpperCase() ?? null;

  await prisma.$transaction(async (tx) => {
    await tx.attempt.deleteMany({
      where: {
        userId,
        questionId,
      },
    });

    if (status === "unseen") {
      return;
    }

    const isCorrect = status === "correct";
    let selectedKey: string | null = null;

    if (isCorrect) {
      selectedKey = normalizedCorrectKey ?? optionList[0]?.key ?? null;
    } else {
      selectedKey =
        optionList.find((option) => option.key.toUpperCase() !== normalizedCorrectKey)?.key
        ?? optionList[0]?.key
        ?? null;
    }

    await tx.attempt.create({
      data: {
        userId,
        questionId,
        selectedKey,
        isCorrect,
        mode: "custom",
        confidence: confidence ?? 2,
        timeSpentMs: null,
      },
    });
  });

  await recomputeMasteryForUser(userId);
  return { ok: true as const };
}

export async function getSessionSummary(userId: string, sessionId: string) {
  const session = await getSessionDetail(userId, sessionId);
  if (!session) {
    return null;
  }

  const attemptsByQuestion = new Map<string, { isCorrect: boolean; selectedKey: string | null; timeSpentMs: number | null; confidence: number | null }>();

  for (const question of session.questions) {
    const latest = session.latestAttemptByQuestion.get(question.id);
    if (latest) {
      attemptsByQuestion.set(question.id, {
        isCorrect: latest.isCorrect,
        selectedKey: latest.selectedKey,
        timeSpentMs: latest.timeSpentMs,
        confidence: latest.confidence,
      });
    }
  }

  const attemptedCount = attemptsByQuestion.size;
  const correctCount = Array.from(attemptsByQuestion.values()).filter((attempt) => attempt.isCorrect).length;
  const totalTimeMs = Array.from(attemptsByQuestion.values()).reduce((sum, attempt) => sum + (attempt.timeSpentMs ?? 0), 0);

  const tagBreakdown = new Map<string, { attempts: number; correct: number }>();
  const moduleBreakdown = new Map<string, { attempts: number; correct: number }>();

  for (const question of session.questions) {
    const attempt = attemptsByQuestion.get(question.id);
    if (!attempt) {
      continue;
    }

    const moduleTag = question.tags.find((tag) => tag.kind === "module");
    const moduleName = moduleTag?.name ?? "Unassigned";
    const moduleStats = moduleBreakdown.get(moduleName) ?? { attempts: 0, correct: 0 };
    moduleStats.attempts += 1;
    if (attempt.isCorrect) {
      moduleStats.correct += 1;
    }
    moduleBreakdown.set(moduleName, moduleStats);

    for (const tag of question.tags.filter((entry) => entry.kind === "topic" || entry.kind === "ranZcogDomain")) {
      const stats = tagBreakdown.get(tag.name) ?? { attempts: 0, correct: 0 };
      stats.attempts += 1;
      if (attempt.isCorrect) {
        stats.correct += 1;
      }
      tagBreakdown.set(tag.name, stats);
    }
  }

  return {
    session,
    attemptedCount,
    correctCount,
    accuracy: attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 100) : 0,
    totalTimeMs,
    tagBreakdown: Array.from(tagBreakdown.entries()).map(([name, value]) => ({
      name,
      attempts: value.attempts,
      accuracy: value.attempts > 0 ? Math.round((value.correct / value.attempts) * 100) : 0,
    })),
    moduleBreakdown: Array.from(moduleBreakdown.entries()).map(([name, value]) => ({
      name,
      attempts: value.attempts,
      accuracy: value.attempts > 0 ? Math.round((value.correct / value.attempts) * 100) : 0,
    })),
    attemptsByQuestion,
  };
}

export async function getDashboardSummary(userId: string) {
  const [attempts, flagsCount, moduleTags, weaknesses, masteryRows, totalPublishedQuestions] = await Promise.all([
    prisma.attempt.findMany({
      where: { userId },
      select: {
        questionId: true,
        isCorrect: true,
        createdAt: true,
        question: {
          select: {
            stem: true,
            moduleCode: true,
            questionTags: {
              select: {
                tag: {
                  select: {
                    kind: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.flag.count({ where: { userId } }),
    prisma.tag.findMany({ where: { kind: "module" }, select: { id: true, name: true } }),
    getWeaknessRankedTagIds(userId),
    prisma.mastery.findMany({ where: { userId }, include: { tag: true } }),
    prisma.question.count({ where: { status: "published" } }),
  ]);

  const totalAttempted = attempts.length;
  const totalCorrect = attempts.filter((attempt) => attempt.isCorrect).length;
  const accuracy = totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 100) : 0;

  const daySet = new Set(attempts.map((attempt) => startOfDay(attempt.createdAt).toISOString()));
  const sortedDays = Array.from(daySet)
    .map((value) => new Date(value))
    .sort((a, b) => b.getTime() - a.getTime());

  let streak = 0;
  if (sortedDays.length > 0) {
    let current = startOfDay(new Date());

    if (sortedDays[0].toISOString() !== current.toISOString()) {
      current = new Date(current.getTime() - 24 * 60 * 60 * 1000);
    }

    for (const day of sortedDays) {
      if (day.toISOString() === current.toISOString()) {
        streak += 1;
        current = new Date(current.getTime() - 24 * 60 * 60 * 1000);
      } else if (day < current) {
        break;
      }
    }
  }

  const attemptsByModule = new Map<string, { attempts: number; correct: number }>();
  for (const attempt of attempts) {
    const moduleTag = attempt.question.questionTags.find((questionTag) => questionTag.tag.kind === "module")?.tag;
    const key = moduleTag?.name ?? attempt.question.moduleCode ?? "Unassigned";
    const stats = attemptsByModule.get(key) ?? { attempts: 0, correct: 0 };
    stats.attempts += 1;
    if (attempt.isCorrect) stats.correct += 1;
    attemptsByModule.set(key, stats);
  }

  const masteryByTagId = new Map(masteryRows.map((row) => [row.tagId, row]));
  const masteryByModule = moduleTags.map((moduleTag) => {
    const mastery = masteryByTagId.get(moduleTag.id);
    const attemptStats = attemptsByModule.get(moduleTag.name) ?? { attempts: 0, correct: 0 };

    return {
      id: moduleTag.id,
      name: moduleTag.name,
      masteryScore: mastery?.masteryScore ?? 0.5,
      attempts: attemptStats.attempts,
      accuracy: attemptStats.attempts > 0 ? Math.round((attemptStats.correct / attemptStats.attempts) * 100) : 0,
    };
  });

  if (attemptsByModule.has("Unassigned")) {
    const stats = attemptsByModule.get("Unassigned") ?? { attempts: 0, correct: 0 };
    masteryByModule.push({
      id: "unassigned",
      name: "Unassigned",
      masteryScore: 0.5,
      attempts: stats.attempts,
      accuracy: stats.attempts > 0 ? Math.round((stats.correct / stats.attempts) * 100) : 0,
    });
  }

  const recentlyMissed = attempts
    .filter((attempt) => !attempt.isCorrect)
    .slice(0, 5)
    .map((attempt) => ({
      questionId: attempt.questionId,
      stemPreview: attempt.question.stem.slice(0, 140),
      attemptedAt: attempt.createdAt,
    }));

  return {
    totalAttempted,
    totalPublishedQuestions,
    totalCorrect,
    accuracy,
    streak,
    flaggedCount: flagsCount,
    masteryByModule,
    weaknesses: weaknesses.slice(0, 5),
    recommendedMix: getRecommendedWeaknessMix(),
    recentlyMissed,
  };
}

export async function getAnalyticsOverview(userId: string) {
  const [attempts, masteryRows] = await Promise.all([
    prisma.attempt.findMany({
      where: { userId },
      select: {
        isCorrect: true,
        createdAt: true,
        question: {
          select: {
            questionTags: {
              select: {
                tag: {
                  select: {
                    name: true,
                    kind: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.mastery.findMany({ where: { userId }, include: { tag: true } }),
  ]);

  const daily = new Map<string, { attempts: number; correct: number }>();
  const weekly = new Map<string, { attempts: number; correct: number }>();

  for (const attempt of attempts) {
    const dayKey = startOfDay(attempt.createdAt).toISOString().slice(0, 10);
    const dayStats = daily.get(dayKey) ?? { attempts: 0, correct: 0 };
    dayStats.attempts += 1;
    if (attempt.isCorrect) {
      dayStats.correct += 1;
    }
    daily.set(dayKey, dayStats);

    const weekKey = startOfWeek(attempt.createdAt).toISOString().slice(0, 10);
    const weekStats = weekly.get(weekKey) ?? { attempts: 0, correct: 0 };
    weekStats.attempts += 1;
    if (attempt.isCorrect) {
      weekStats.correct += 1;
    }
    weekly.set(weekKey, weekStats);
  }

  const tagTable = new Map<string, { attempts: number; correct: number; lastAttempted: Date | null }>();

  for (const attempt of attempts) {
    for (const questionTag of attempt.question.questionTags) {
      const key = questionTag.tag.name;
      const stats = tagTable.get(key) ?? { attempts: 0, correct: 0, lastAttempted: null };
      stats.attempts += 1;
      if (attempt.isCorrect) {
        stats.correct += 1;
      }
      if (!stats.lastAttempted || stats.lastAttempted < attempt.createdAt) {
        stats.lastAttempted = attempt.createdAt;
      }
      tagTable.set(key, stats);
    }
  }

  const topicBreakdown = Array.from(tagTable.entries())
    .map(([name, stats]) => ({
      name,
      attempts: stats.attempts,
      accuracy: stats.attempts > 0 ? Math.round((stats.correct / stats.attempts) * 100) : 0,
      incorrect: stats.attempts - stats.correct,
      lastAttempted: stats.lastAttempted,
    }))
    .sort((a, b) => b.attempts - a.attempts);

  const masteryHeatmap = masteryRows.map((row) => ({
    tagId: row.tagId,
    tagName: row.tag.name,
    kind: row.tag.kind,
    masteryScore: row.masteryScore,
    alpha: row.alpha,
    beta: row.beta,
  }));

  return {
    dailyAccuracy: Array.from(daily.entries()).map(([date, stats]) => ({
      date,
      attempts: stats.attempts,
      accuracy: Math.round((stats.correct / stats.attempts) * 100),
    })),
    weeklyAccuracy: Array.from(weekly.entries()).map(([weekStart, stats]) => ({
      weekStart,
      attempts: stats.attempts,
      accuracy: Math.round((stats.correct / stats.attempts) * 100),
    })),
    topicBreakdown,
    masteryHeatmap,
    mostMissed: topicBreakdown
      .filter((item) => item.attempts > 0)
      .sort((a, b) => b.incorrect - a.incorrect)
      .slice(0, 5),
  };
}

export async function getMasteryOverview(userId: string) {
  const [masteryRows, weaknesses] = await Promise.all([
    prisma.mastery.findMany({
      where: { userId },
      include: { tag: true },
      orderBy: [{ tag: { kind: "asc" } }, { tag: { name: "asc" } }],
    }),
    getWeaknessRankedTagIds(userId),
  ]);

  return {
    mastery: masteryRows.map((row) => ({
      tagId: row.tagId,
      tagName: row.tag.name,
      kind: row.tag.kind,
      masteryScore: row.masteryScore,
      alpha: row.alpha,
      beta: row.beta,
      lastUpdatedAt: row.lastUpdatedAt,
    })),
    weaknesses: weaknesses.slice(0, 10),
    recommendedMix: getRecommendedWeaknessMix(),
  };
}

export async function getQuestionBankStatus() {
  const [totalPublishedQuestions, importedPublishedQuestions] = await Promise.all([
    prisma.question.count({ where: { status: "published" } }),
    prisma.question.count({ where: { status: "published", createdBy: "import" } }),
  ]);

  return {
    totalPublishedQuestions,
    importedPublishedQuestions,
    ingestReportPath: "scripts/ingest/reports/latest.json",
  };
}
