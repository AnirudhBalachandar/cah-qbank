import { SUBJECT_CONFIG } from "@cah-qbank/domain";
import { prisma } from "@/lib/db";
import { getWeaknessRankedTagIds } from "@/lib/server/practice";
import { buildGenerationPrompt } from "@/lib/server/generation/prompt-builder";
import { generateStructuredQuestions } from "@/lib/server/generation/responses-client";
import { createSimilarityContext, evaluateSimilarities } from "@/lib/server/generation/similarity";
import { validateGeneratedPayload } from "@/lib/server/generation/validator";
import { retrieveExternalSnippets } from "@/lib/server/retrieval/external";
import { retrieveInternalChunks } from "@/lib/server/retrieval/internal";

function moduleCodeFromTags(tags: string[]) {
  const joined = tags.join(" ; ");
  const match = joined.match(new RegExp(`${SUBJECT_CONFIG.moduleCodePrefix}\\s*\\d{2}`, "i"));
  return match ? match[0].toUpperCase() : null;
}

function parseUsdPerMillion(envName: string) {
  const raw = process.env[envName];
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

function estimateCostUsdFromUsage(usage: {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}) {
  const inputRate = parseUsdPerMillion("OPENAI_INPUT_COST_PER_1M_TOKENS_USD");
  const outputRate = parseUsdPerMillion("OPENAI_OUTPUT_COST_PER_1M_TOKENS_USD");
  if (inputRate !== null && outputRate !== null && usage.inputTokens !== null && usage.outputTokens !== null) {
    return Number((((usage.inputTokens / 1_000_000) * inputRate) + ((usage.outputTokens / 1_000_000) * outputRate)).toFixed(6));
  }

  const totalRate = parseUsdPerMillion("OPENAI_TOTAL_COST_PER_1M_TOKENS_USD");
  if (totalRate !== null && usage.totalTokens !== null) {
    return Number(((usage.totalTokens / 1_000_000) * totalRate).toFixed(6));
  }

  return null;
}

async function resolveTagIds(tagPaths: string[]) {
  const ids: string[] = [];

  for (const path of tagPaths) {
    const parts = path
      .split(/[>|]/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length === 0) continue;

    const leaf = parts[parts.length - 1];
    const tag = await prisma.tag.findFirst({
      where: {
        name: {
          equals: leaf,
          mode: "insensitive",
        },
      },
      select: { id: true },
    });

    if (tag) {
      ids.push(tag.id);
    }
  }

  return Array.from(new Set(ids));
}

export async function createGenerationRun({
  userId,
  count,
  strictness,
  tagIds,
}: {
  userId: string;
  count: number;
  strictness: "strict_internal" | "augmented";
  tagIds: string[];
}) {
  const weaknessTags = tagIds.length > 0
    ? await prisma.tag.findMany({ where: { id: { in: tagIds } }, select: { id: true, name: true } })
    : (await getWeaknessRankedTagIds(userId)).slice(0, 5).map((entry) => ({ id: entry.tagId, name: entry.tagName }));

  const run = await prisma.generatedQuestionRun.create({
    data: {
      userId,
      weaknessTags,
      strictness,
      status: "queued",
      logs: {
        steps: ["Run created"],
      },
    },
    select: {
      id: true,
      weaknessTags: true,
      strictness: true,
    },
  });

  try {
    await prisma.generatedQuestionRun.update({
      where: { id: run.id },
      data: {
        status: "processing",
      },
    });

    const weaknessTagNames = (run.weaknessTags as Array<{ name: string }>).map((tag) => tag.name);
    const retrievalQuery = `Generate SBA for weaknesses: ${weaknessTagNames.join("; ")}`;
    const internalChunks = await retrieveInternalChunks({
      query: retrievalQuery,
      limit: 10,
      sourceTypes: strictness === "augmented" ? ["pdf", "docx", "web"] : ["pdf", "docx"],
      allowWebSources: strictness === "augmented",
    });
    const externalSnippets = strictness === "augmented"
      ? await retrieveExternalSnippets({ query: retrievalQuery, limit: 3 })
      : [];

    if (strictness === "strict_internal" && internalChunks.some((chunk) => chunk.sourceType === "web")) {
      throw new Error("STRICT_INTERNAL_SOURCE_VIOLATION");
    }

    const prompt = await buildGenerationPrompt({
      weaknessTagNames,
      strictness,
      count,
      internalChunks,
      externalSnippets,
    });

    const generated = await generateStructuredQuestions(prompt);
    const validated = validateGeneratedPayload(generated.payload, strictness);

    if (!validated.valid || !validated.data) {
      await prisma.generatedQuestionRun.update({
        where: { id: run.id },
        data: {
          status: "failed",
          logs: {
            error: "schema_validation_failed",
            issues: validated.errors,
          },
        },
      });

      return { runId: run.id, status: "failed", created: 0, rejected: validated.errors.length };
    }

    let created = 0;
    let rejected = 0;
    const similarityContext = await createSimilarityContext();
    const similarities = await evaluateSimilarities(
      validated.data.questions.map((question) => question.stem_markdown),
      similarityContext,
    );
    const estimatedCostUsd = estimateCostUsdFromUsage(generated.usage);

    for (let index = 0; index < validated.data.questions.length; index += 1) {
      const question = validated.data.questions[index];
      const similarity = similarities[index];
      if (!similarity) {
        rejected += 1;
        await prisma.generatedQuestionItem.create({
          data: {
            runId: run.id,
            status: "rejected",
            validationErrors: {
              similarity: { error: "missing_similarity_result" },
            },
          },
        });
        continue;
      }

      if (similarity.rejected) {
        rejected += 1;
        await prisma.generatedQuestionItem.create({
          data: {
            runId: run.id,
            status: "rejected",
            similarityScore: similarity.maxCosine,
            overlapScore: similarity.maxOverlap,
            validationErrors: {
              similarity: similarity,
            },
          },
        });
        continue;
      }

      const tagIdsResolved = await resolveTagIds(question.tags);

      const createdQuestion = await prisma.question.create({
        data: {
          type: "SBA",
          stem: question.stem_markdown,
          options: question.options,
          correctKey: question.correctKey,
          explanation: question.explanation_markdown,
          rationale: question.key_takeaways.join("; "),
          whyOthersWrong: question.why_others_wrong,
          citations: question.citations,
          difficulty: question.difficulty ?? null,
          ausScore: question.ausScore ?? null,
          moduleCode: question.moduleCode ?? moduleCodeFromTags(question.tags),
          createdBy: "ai",
          status: "draft",
          source: {
            generationRunId: run.id,
            strictness,
          },
          sourceFingerprint: `ai-${run.id}-${created}-${Date.now()}`,
          ...(tagIdsResolved.length > 0
            ? {
                questionTags: {
                  createMany: {
                    data: tagIdsResolved.map((tagId) => ({ tagId })),
                    skipDuplicates: true,
                  },
                },
              }
            : {}),
        },
        select: { id: true },
      });

      await prisma.generatedQuestionItem.create({
        data: {
          runId: run.id,
          questionId: createdQuestion.id,
          status: "draft",
          similarityScore: similarity.maxCosine,
          overlapScore: similarity.maxOverlap,
        },
      });

      created += 1;
    }

    await prisma.generatedQuestionRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        logs: {
          generatedCount: validated.data.questions.length,
          created,
          rejected,
          strictness,
          usedInternalChunks: internalChunks.length,
          usedExternalSnippets: externalSnippets.length,
          usage: {
            model: generated.usage.model,
            inputTokens: generated.usage.inputTokens,
            outputTokens: generated.usage.outputTokens,
            totalTokens: generated.usage.totalTokens,
            estimatedCostUsd,
          },
        },
      },
    });

    return {
      runId: run.id,
      status: "completed",
      created,
      rejected,
    };
  } catch (error) {
    await prisma.generatedQuestionRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        logs: {
          error: error instanceof Error ? error.message : "unknown_error",
        },
      },
    });

    throw error;
  }
}

export async function getGenerationRun(userId: string, runId: string) {
  const run = await prisma.generatedQuestionRun.findFirst({
    where: { id: runId, userId },
    include: {
      items: {
        include: {
          question: {
            select: {
              id: true,
              stem: true,
              status: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });

  return run;
}

export async function listGenerationRuns(userId: string, limit = 20) {
  return prisma.generatedQuestionRun.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.min(limit, 100)),
    include: {
      items: {
        select: {
          id: true,
          status: true,
          similarityScore: true,
          overlapScore: true,
          questionId: true,
        },
      },
    },
  });
}

export async function getDraftGeneratedQuestions() {
  return prisma.generatedQuestionItem.findMany({
    where: {
      status: "draft",
      question: {
        is: {
          status: "draft",
        },
      },
    },
    include: {
      run: {
        include: {
          user: {
            select: { email: true },
          },
        },
      },
      question: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function moderateGeneratedDraft({
  itemId,
  action,
  reviewerNotes,
}: {
  itemId: string;
  action: "publish" | "archive";
  reviewerNotes?: string;
}) {
  const item = await prisma.generatedQuestionItem.findUnique({
    where: { id: itemId },
    include: { question: true },
  });

  if (!item || !item.question) {
    return null;
  }

  if (!item.question.correctKey && action === "publish") {
    throw new Error("Cannot publish question without correctKey.");
  }

  const nextQuestionStatus = action === "publish" ? "published" : "archived";
  const nextItemStatus = action === "publish" ? "published" : "archived";

  await prisma.$transaction([
    prisma.question.update({
      where: { id: item.question.id },
      data: {
        status: nextQuestionStatus,
      },
    }),
    prisma.generatedQuestionItem.update({
      where: { id: item.id },
      data: {
        status: nextItemStatus,
        reviewerNotes: reviewerNotes ?? null,
      },
    }),
  ]);

  return {
    questionId: item.question.id,
    status: nextQuestionStatus,
  };
}
