import { randomUUID } from "node:crypto";

import {
  syncBundlePayloadSchema,
  syncEnvelopeSchema,
  syncPairConfirmSchema,
  syncPairStartSchema,
  type SyncApplyResult,
  type SyncBundlePayload,
  type SyncPreview,
} from "@cah-qbank/domain";

import type { Prisma } from "@/lib/generated/prisma";
import { prisma } from "@/lib/db";
import {
  buildPayloadChecksum,
  decryptSyncEnvelope,
  encryptSyncPayload,
  hashPairingCode,
  hashSyncToken,
} from "@/lib/server/sync/crypto";

const PAIRING_TTL_MINUTES = 10;
const APP_VERSION = "cah-qbank-sync-v1";

function toDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function sanitizeJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function asJsonObject(value: unknown): Prisma.InputJsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return sanitizeJson(value) as Prisma.InputJsonObject;
}

function asJsonArray(value: unknown): Prisma.InputJsonArray {
  if (!Array.isArray(value)) {
    return [];
  }
  return sanitizeJson(value) as Prisma.InputJsonArray;
}

function clampPreview(payload: SyncBundlePayload): SyncPreview {
  return {
    referenceCount:
      payload.reference.tags.length +
      payload.reference.questions.length +
      payload.reference.emqSets.length +
      payload.reference.questionTags.length +
      payload.reference.questionEmqSets.length +
      payload.reference.contentChunks.length,
    userStateCount:
      payload.userState.practiceSessions.length +
      payload.userState.attempts.length +
      payload.userState.flags.length +
      payload.userState.notes.length +
      payload.userState.issues.length +
      payload.userState.mastery.length,
    generatedCount: payload.generated.runs.length + payload.generated.items.length + payload.generated.questions.length,
  };
}

export async function createPairingStart(userId: string, input: unknown) {
  const parsed = syncPairStartSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "INVALID_PAIR_START", issues: parsed.error.issues };
  }

  const pairingId = randomUUID();
  const pairingCode = `${Math.floor(Math.random() * 1_000_000)}`.padStart(6, "0");
  const pairingCodeHash = hashPairingCode(pairingId, pairingCode);
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MINUTES * 60 * 1000);

  const device = await prisma.syncDevice.upsert({
    where: {
      userId_devicePublicId: {
        userId,
        devicePublicId: parsed.data.devicePublicId,
      },
    },
    create: {
      userId,
      devicePublicId: parsed.data.devicePublicId,
      deviceName: parsed.data.deviceName,
      platform: parsed.data.platform,
      status: "pending",
      pairingId,
      pairingCodeHash,
      pairingExpiresAt: expiresAt,
      syncTokenHash: null,
      pairedAt: null,
      lastSeenAt: null,
    },
    update: {
      deviceName: parsed.data.deviceName,
      platform: parsed.data.platform,
      status: "pending",
      pairingId,
      pairingCodeHash,
      pairingExpiresAt: expiresAt,
      syncTokenHash: null,
      pairedAt: null,
    },
    select: {
      id: true,
    },
  });

  return {
    ok: true as const,
    pairing: {
      deviceId: device.id,
      pairingId,
      pairingCode,
      expiresAt: expiresAt.toISOString(),
    },
  };
}

export async function confirmPairing(input: unknown) {
  const parsed = syncPairConfirmSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "INVALID_PAIR_CONFIRM", issues: parsed.error.issues };
  }

  const device = await prisma.syncDevice.findFirst({
    where: {
      pairingId: parsed.data.pairingId,
      devicePublicId: parsed.data.devicePublicId,
      status: "pending",
    },
    select: {
      id: true,
      userId: true,
      pairingCodeHash: true,
      pairingExpiresAt: true,
    },
  });

  if (!device || !device.pairingCodeHash || !device.pairingExpiresAt) {
    return { ok: false as const, error: "PAIRING_NOT_FOUND" };
  }

  if (device.pairingExpiresAt.getTime() < Date.now()) {
    return { ok: false as const, error: "PAIRING_EXPIRED" };
  }

  const expectedHash = hashPairingCode(parsed.data.pairingId, parsed.data.pairingCode);
  if (expectedHash !== device.pairingCodeHash) {
    return { ok: false as const, error: "PAIRING_CODE_MISMATCH" };
  }

  const syncToken = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  const syncTokenHash = hashSyncToken(syncToken);

  await prisma.$transaction([
    prisma.syncDevice.update({
      where: { id: device.id },
      data: {
        deviceName: parsed.data.deviceName,
        platform: parsed.data.platform,
        status: "active",
        pairingId: null,
        pairingCodeHash: null,
        pairingExpiresAt: null,
        syncTokenHash,
        pairedAt: new Date(),
        lastSeenAt: new Date(),
      },
    }),
    prisma.syncState.upsert({
      where: {
        userId_deviceId: {
          userId: device.userId,
          deviceId: device.id,
        },
      },
      create: {
        userId: device.userId,
        deviceId: device.id,
      },
      update: {},
    }),
  ]);

  return {
    ok: true as const,
    session: {
      deviceId: device.id,
      userId: device.userId,
      syncToken,
    },
  };
}

export async function requireSyncDeviceByToken(token: string | null) {
  if (!token) return null;
  const syncTokenHash = hashSyncToken(token);
  const device = await prisma.syncDevice.findFirst({
    where: {
      syncTokenHash,
      status: "active",
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          role: true,
        },
      },
    },
  });

  if (!device) return null;

  await prisma.syncDevice.update({
    where: { id: device.id },
    data: {
      lastSeenAt: new Date(),
    },
  });

  return {
    token,
    device,
    user: device.user,
  };
}

async function createSyncJob(params: {
  userId: string;
  deviceId: string | null;
  direction: "push_to_desktop" | "pull_from_desktop";
}) {
  return prisma.syncJob.create({
    data: {
      userId: params.userId,
      deviceId: params.deviceId,
      direction: params.direction,
      status: "processing",
      startedAt: new Date(),
    },
    select: { id: true },
  });
}

async function markSyncState(params: {
  userId: string;
  deviceId: string;
  checksum: string;
  direction: "push_to_desktop" | "pull_from_desktop";
}) {
  await prisma.syncState.upsert({
    where: {
      userId_deviceId: {
        userId: params.userId,
        deviceId: params.deviceId,
      },
    },
    create: {
      userId: params.userId,
      deviceId: params.deviceId,
      lastSyncAt: new Date(),
      lastExportAt: params.direction === "pull_from_desktop" ? new Date() : null,
      lastImportAt: params.direction === "push_to_desktop" ? new Date() : null,
      lastBundleChecksum: params.checksum,
      lastDirection: params.direction,
    },
    update: {
      lastSyncAt: new Date(),
      lastExportAt: params.direction === "pull_from_desktop" ? new Date() : undefined,
      lastImportAt: params.direction === "push_to_desktop" ? new Date() : undefined,
      lastBundleChecksum: params.checksum,
      lastDirection: params.direction,
    },
  });
}

function toSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function buildSyncPayload(userId: string): Promise<SyncBundlePayload> {
  const [
    user,
    tags,
    emqSets,
    questions,
    questionTags,
    questionEmqSets,
    contentChunks,
    sessions,
    attempts,
    flags,
    notes,
    issues,
    mastery,
    runs,
    items,
    generatedQuestions,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        examDate: true,
        dailyTarget: true,
        defaultGenerationStrictness: true,
        onboardingCompletedAt: true,
      },
    }),
    prisma.tag.findMany(),
    prisma.emqSet.findMany(),
    prisma.question.findMany(),
    prisma.questionTag.findMany(),
    prisma.questionEmqSet.findMany(),
    prisma.contentChunk.findMany({
      select: {
        id: true,
        sourceType: true,
        sourceRef: true,
        title: true,
        heading: true,
        pageStart: true,
        pageEnd: true,
        text: true,
        metadata: true,
        createdAt: true,
      },
    }),
    prisma.practiceSession.findMany({ where: { userId } }),
    prisma.attempt.findMany({ where: { userId } }),
    prisma.flag.findMany({ where: { userId } }),
    prisma.userNote.findMany({ where: { userId } }),
    prisma.issueReport.findMany({ where: { userId } }),
    prisma.mastery.findMany({ where: { userId } }),
    prisma.generatedQuestionRun.findMany({ where: { userId } }),
    prisma.generatedQuestionItem.findMany({
      where: {
        run: {
          userId,
        },
      },
    }),
    prisma.question.findMany({
      where: {
        createdBy: "ai",
        generatedItems: {
          some: {
            run: {
              userId,
            },
          },
        },
      },
    }),
  ]);

  return {
    reference: {
      tags: toSerializable(tags),
      emqSets: toSerializable(emqSets),
      questions: toSerializable(questions),
      questionTags: toSerializable(questionTags),
      questionEmqSets: toSerializable(questionEmqSets),
      contentChunks: toSerializable(contentChunks),
    },
    userState: {
      user: toSerializable(user ?? {}),
      practiceSessions: toSerializable(sessions),
      attempts: toSerializable(attempts),
      flags: toSerializable(flags),
      notes: toSerializable(notes),
      issues: toSerializable(issues),
      mastery: toSerializable(mastery),
    },
    generated: {
      runs: toSerializable(runs),
      items: toSerializable(items),
      questions: toSerializable(generatedQuestions),
    },
  };
}

export async function exportSyncEnvelope(params: {
  userId: string;
  deviceId: string;
  syncToken: string;
}) {
  const syncJob = await createSyncJob({
    userId: params.userId,
    deviceId: params.deviceId,
    direction: "pull_from_desktop",
  });

  try {
    const payload = await buildSyncPayload(params.userId);
    const preview = clampPreview(payload);
    const envelope = encryptSyncPayload({
      syncToken: params.syncToken,
      payload,
      sourceDeviceId: params.deviceId,
      appVersion: APP_VERSION,
    });

    const parsedEnvelope = syncEnvelopeSchema.parse({ ...envelope, preview });

    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: "succeeded",
        summary: {
          preview,
          checksum: parsedEnvelope.meta.checksum,
        },
        completedAt: new Date(),
      },
    });

    await markSyncState({
      userId: params.userId,
      deviceId: params.deviceId,
      checksum: parsedEnvelope.meta.checksum,
      direction: "pull_from_desktop",
    });

    return {
      syncJobId: syncJob.id,
      envelope: parsedEnvelope,
    };
  } catch (error) {
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message : "SYNC_EXPORT_FAILED",
        completedAt: new Date(),
      },
    });
    throw error;
  }
}

export async function exportSyncPayload(params: {
  userId: string;
  deviceId: string;
}) {
  const syncJob = await createSyncJob({
    userId: params.userId,
    deviceId: params.deviceId,
    direction: "pull_from_desktop",
  });

  try {
    const payload = await buildSyncPayload(params.userId);
    const preview = clampPreview(payload);
    const checksum = buildPayloadChecksum(JSON.stringify(payload));

    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: "succeeded",
        summary: {
          preview,
          checksum,
        },
        completedAt: new Date(),
      },
    });

    await markSyncState({
      userId: params.userId,
      deviceId: params.deviceId,
      checksum,
      direction: "pull_from_desktop",
    });

    return {
      syncJobId: syncJob.id,
      preview,
      payload,
    };
  } catch (error) {
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message : "SYNC_EXPORT_FAILED",
        completedAt: new Date(),
      },
    });
    throw error;
  }
}

async function applySyncPayload(params: {
  userId: string;
  payload: SyncBundlePayload;
}) {
  const payload = params.payload;

  await prisma.$transaction(async (tx) => {
    for (const row of payload.reference.tags) {
      const data = asObject(row);
      const id = asString(data.id);
      const name = asString(data.name);
      const kind = asString(data.kind) as "topic" | "module" | "ranZcogDomain" | "meta" | null;
      if (!id || !name || !kind) continue;

      await tx.tag.upsert({
        where: { id },
        create: {
          id,
          name,
          kind,
          parentId: asString(data.parentId),
          createdAt: toDate(data.createdAt) ?? new Date(),
        },
        update: {
          name,
          kind,
          parentId: asString(data.parentId),
        },
      });
    }

    for (const row of payload.reference.emqSets) {
      const data = asObject(row);
      const id = asString(data.id);
      if (!id) continue;

      await tx.emqSet.upsert({
        where: { id },
        create: {
          id,
          title: asString(data.title),
          instructions: asString(data.instructions),
          optionList: asJsonArray(data.optionList),
          source: asJsonObject(data.source),
          sourceFingerprint: asString(data.sourceFingerprint) ?? `sync-emq-${id}`,
          createdAt: toDate(data.createdAt) ?? new Date(),
        },
        update: {
          title: asString(data.title),
          instructions: asString(data.instructions),
          optionList: asJsonArray(data.optionList),
          source: asJsonObject(data.source),
          sourceFingerprint: asString(data.sourceFingerprint) ?? `sync-emq-${id}`,
        },
      });
    }

    for (const row of payload.reference.questions) {
      const data = asObject(row);
      const id = asString(data.id);
      const type = asString(data.type) as "SBA" | "EMQ_STEM" | null;
      const stem = asString(data.stem);
      if (!id || !type || !stem) continue;

      await tx.question.upsert({
        where: { id },
        create: {
          id,
          type,
          stem,
          options: asJsonArray(data.options),
          correctKey: asString(data.correctKey),
          explanation: asString(data.explanation),
          rationale: asString(data.rationale),
          whyOthersWrong: asJsonObject(data.whyOthersWrong),
          citations: asJsonArray(data.citations),
          difficulty: asString(data.difficulty),
          ausScore: asNumber(data.ausScore),
          moduleCode: asString(data.moduleCode),
          createdBy: (asString(data.createdBy) as "import" | "ai" | "manual") ?? "manual",
          status: (asString(data.status) as "published" | "draft" | "archived") ?? "draft",
          source: asJsonObject(data.source),
          sourceFingerprint: asString(data.sourceFingerprint) ?? `sync-question-${id}`,
          createdAt: toDate(data.createdAt) ?? new Date(),
        },
        update: {
          type,
          stem,
          options: asJsonArray(data.options),
          correctKey: asString(data.correctKey),
          explanation: asString(data.explanation),
          rationale: asString(data.rationale),
          whyOthersWrong: asJsonObject(data.whyOthersWrong),
          citations: asJsonArray(data.citations),
          difficulty: asString(data.difficulty),
          ausScore: asNumber(data.ausScore),
          moduleCode: asString(data.moduleCode),
          createdBy: (asString(data.createdBy) as "import" | "ai" | "manual") ?? "manual",
          status: (asString(data.status) as "published" | "draft" | "archived") ?? "draft",
          source: asJsonObject(data.source),
          sourceFingerprint: asString(data.sourceFingerprint) ?? `sync-question-${id}`,
        },
      });
    }

    for (const row of payload.reference.contentChunks) {
      const data = asObject(row);
      const id = asString(data.id);
      const sourceType = asString(data.sourceType) as "pdf" | "docx" | "web" | null;
      const sourceRef = asString(data.sourceRef);
      const text = asString(data.text);
      if (!id || !sourceType || !sourceRef || !text) continue;

      await tx.contentChunk.upsert({
        where: { id },
        create: {
          id,
          sourceType,
          sourceRef,
          title: asString(data.title),
          heading: asString(data.heading),
          pageStart: asNumber(data.pageStart),
          pageEnd: asNumber(data.pageEnd),
          text,
          metadata: asJsonObject(data.metadata),
          createdAt: toDate(data.createdAt) ?? new Date(),
        },
        update: {
          sourceType,
          sourceRef,
          title: asString(data.title),
          heading: asString(data.heading),
          pageStart: asNumber(data.pageStart),
          pageEnd: asNumber(data.pageEnd),
          text,
          metadata: asJsonObject(data.metadata),
        },
      });
    }

    const referenceQuestionIds = payload.reference.questions
      .map((row) => asString(asObject(row).id))
      .filter((id): id is string => Boolean(id));

    if (referenceQuestionIds.length > 0) {
      await tx.questionTag.deleteMany({
        where: {
          questionId: {
            in: referenceQuestionIds,
          },
        },
      });
    }

    if (payload.reference.questionTags.length > 0) {
      await tx.questionTag.createMany({
        data: payload.reference.questionTags
          .map((row) => {
            const data = asObject(row);
            const questionId = asString(data.questionId);
            const tagId = asString(data.tagId);
            if (!questionId || !tagId) return null;
            return { questionId, tagId };
          })
          .filter((row): row is { questionId: string; tagId: string } => row !== null),
        skipDuplicates: true,
      });
    }

    if (referenceQuestionIds.length > 0) {
      await tx.questionEmqSet.deleteMany({
        where: {
          questionId: {
            in: referenceQuestionIds,
          },
        },
      });
    }

    if (payload.reference.questionEmqSets.length > 0) {
      await tx.questionEmqSet.createMany({
        data: payload.reference.questionEmqSets
          .map((row) => {
            const data = asObject(row);
            const questionId = asString(data.questionId);
            const emqSetId = asString(data.emqSetId);
            if (!questionId || !emqSetId) return null;
            return { questionId, emqSetId };
          })
          .filter((row): row is { questionId: string; emqSetId: string } => row !== null),
        skipDuplicates: true,
      });
    }

    const incomingUser = asObject(payload.userState.user);
    await tx.user.update({
      where: { id: params.userId },
      data: {
        examDate: toDate(incomingUser.examDate),
        dailyTarget: asNumber(incomingUser.dailyTarget),
        defaultGenerationStrictness:
          (asString(incomingUser.defaultGenerationStrictness) as "strict_internal" | "augmented" | null) ??
          undefined,
        onboardingCompletedAt: toDate(incomingUser.onboardingCompletedAt),
      },
    });

    await tx.attempt.deleteMany({ where: { userId: params.userId } });
    await tx.flag.deleteMany({ where: { userId: params.userId } });
    await tx.userNote.deleteMany({ where: { userId: params.userId } });
    await tx.issueReport.deleteMany({ where: { userId: params.userId } });
    await tx.mastery.deleteMany({ where: { userId: params.userId } });
    await tx.practiceSession.deleteMany({ where: { userId: params.userId } });

    if (payload.userState.practiceSessions.length > 0) {
      await tx.practiceSession.createMany({
        data: payload.userState.practiceSessions
          .map((row) => {
            const data = asObject(row);
            const id = asString(data.id);
            const mode = asString(data.mode) as "revision" | "timed" | "weakness" | "custom" | null;
            if (!id || !mode) return null;
            return {
              id,
              userId: params.userId,
              mode,
              durationMinutes: asNumber(data.durationMinutes),
              questionIds: asJsonArray(data.questionIds),
              filters: asJsonObject(data.filters),
              currentIndex: asNumber(data.currentIndex) ?? 0,
              completedAt: toDate(data.completedAt),
              createdAt: toDate(data.createdAt) ?? new Date(),
            };
          })
          .filter((row): row is NonNullable<typeof row> => row !== null),
        skipDuplicates: true,
      });
    }

    if (payload.userState.attempts.length > 0) {
      await tx.attempt.createMany({
        data: payload.userState.attempts
          .map((row) => {
            const data = asObject(row);
            const id = asString(data.id);
            const questionId = asString(data.questionId);
            const mode = asString(data.mode) as "revision" | "timed" | "weakness" | "custom" | null;
            if (!id || !questionId || !mode) return null;
            return {
              id,
              userId: params.userId,
              questionId,
              sessionId: asString(data.sessionId),
              selectedKey: asString(data.selectedKey),
              isCorrect: asBoolean(data.isCorrect) ?? false,
              timeSpentMs: asNumber(data.timeSpentMs),
              confidence: asNumber(data.confidence),
              mode,
              createdAt: toDate(data.createdAt) ?? new Date(),
            };
          })
          .filter(
            (row): row is {
              id: string;
              userId: string;
              questionId: string;
              sessionId: string | null;
              selectedKey: string | null;
              isCorrect: boolean;
              timeSpentMs: number | null;
              confidence: number | null;
              mode: "revision" | "timed" | "weakness" | "custom";
              createdAt: Date;
            } => row !== null,
          ),
        skipDuplicates: true,
      });
    }

    if (payload.userState.flags.length > 0) {
      await tx.flag.createMany({
        data: payload.userState.flags
          .map((row) => {
            const data = asObject(row);
            const questionId = asString(data.questionId);
            if (!questionId) return null;
            return {
              userId: params.userId,
              questionId,
              createdAt: toDate(data.createdAt) ?? new Date(),
            };
          })
          .filter((row): row is { userId: string; questionId: string; createdAt: Date } => row !== null),
        skipDuplicates: true,
      });
    }

    if (payload.userState.notes.length > 0) {
      await tx.userNote.createMany({
        data: payload.userState.notes
          .map((row) => {
            const data = asObject(row);
            const questionId = asString(data.questionId);
            const noteMarkdown = asString(data.noteMarkdown);
            if (!questionId || noteMarkdown === null) return null;
            return {
              userId: params.userId,
              questionId,
              noteMarkdown,
            };
          })
          .filter((row): row is { userId: string; questionId: string; noteMarkdown: string } => row !== null),
        skipDuplicates: true,
      });
    }

    if (payload.userState.issues.length > 0) {
      await tx.issueReport.createMany({
        data: payload.userState.issues
          .map((row) => {
            const data = asObject(row);
            const id = asString(data.id);
            const questionId = asString(data.questionId);
            const message = asString(data.message);
            if (!id || !questionId || message === null) return null;
            return {
              id,
              userId: params.userId,
              questionId,
              message,
              createdAt: toDate(data.createdAt) ?? new Date(),
            };
          })
          .filter(
            (row): row is { id: string; userId: string; questionId: string; message: string; createdAt: Date } =>
              row !== null,
          ),
        skipDuplicates: true,
      });
    }

    if (payload.userState.mastery.length > 0) {
      await tx.mastery.createMany({
        data: payload.userState.mastery
          .map((row) => {
            const data = asObject(row);
            const tagId = asString(data.tagId);
            const model = asString(data.model) as "beta" | "elo" | null;
            if (!tagId || !model) return null;
            return {
              userId: params.userId,
              tagId,
              model,
              masteryScore: asNumber(data.masteryScore) ?? 0.5,
              elo: asNumber(data.elo),
              alpha: asNumber(data.alpha) ?? 1,
              beta: asNumber(data.beta) ?? 1,
            };
          })
          .filter(
            (row): row is {
              userId: string;
              tagId: string;
              model: "beta" | "elo";
              masteryScore: number;
              elo: number | null;
              alpha: number;
              beta: number;
            } => row !== null,
          ),
        skipDuplicates: true,
      });
    }

    const existingRuns = await tx.generatedQuestionRun.findMany({
      where: { userId: params.userId },
      select: { id: true },
    });
    const existingRunIds = existingRuns.map((run) => run.id);
    if (existingRunIds.length > 0) {
      await tx.generatedQuestionItem.deleteMany({
        where: {
          runId: {
            in: existingRunIds,
          },
        },
      });
      await tx.generatedQuestionRun.deleteMany({
        where: {
          id: {
            in: existingRunIds,
          },
        },
      });
    }

    for (const row of payload.generated.questions) {
      const data = asObject(row);
      const id = asString(data.id);
      const type = asString(data.type) as "SBA" | "EMQ_STEM" | null;
      const stem = asString(data.stem);
      if (!id || !type || !stem) continue;

      await tx.question.upsert({
        where: { id },
        create: {
          id,
          type,
          stem,
          options: asJsonArray(data.options),
          correctKey: asString(data.correctKey),
          explanation: asString(data.explanation),
          rationale: asString(data.rationale),
          whyOthersWrong: asJsonObject(data.whyOthersWrong),
          citations: asJsonArray(data.citations),
          difficulty: asString(data.difficulty),
          ausScore: asNumber(data.ausScore),
          moduleCode: asString(data.moduleCode),
          createdBy: "ai",
          status: (asString(data.status) as "published" | "draft" | "archived") ?? "draft",
          source: asJsonObject(data.source),
          sourceFingerprint: asString(data.sourceFingerprint) ?? `sync-generated-${id}`,
          createdAt: toDate(data.createdAt) ?? new Date(),
        },
        update: {
          type,
          stem,
          options: asJsonArray(data.options),
          correctKey: asString(data.correctKey),
          explanation: asString(data.explanation),
          rationale: asString(data.rationale),
          whyOthersWrong: asJsonObject(data.whyOthersWrong),
          citations: asJsonArray(data.citations),
          difficulty: asString(data.difficulty),
          ausScore: asNumber(data.ausScore),
          moduleCode: asString(data.moduleCode),
          status: (asString(data.status) as "published" | "draft" | "archived") ?? "draft",
          source: asJsonObject(data.source),
          sourceFingerprint: asString(data.sourceFingerprint) ?? `sync-generated-${id}`,
        },
      });
    }

    for (const row of payload.generated.runs) {
      const data = asObject(row);
      const id = asString(data.id);
      const strictness = asString(data.strictness) as "strict_internal" | "augmented" | null;
      const status = asString(data.status) as "queued" | "processing" | "completed" | "failed" | null;
      if (!id || !strictness || !status) continue;

      await tx.generatedQuestionRun.upsert({
        where: { id },
        create: {
          id,
          userId: params.userId,
          weaknessTags: asJsonArray(data.weaknessTags),
          strictness,
          status,
          logs: asJsonObject(data.logs),
          createdAt: toDate(data.createdAt) ?? new Date(),
        },
        update: {
          weaknessTags: asJsonArray(data.weaknessTags),
          strictness,
          status,
          logs: asJsonObject(data.logs),
        },
      });
    }

    for (const row of payload.generated.items) {
      const data = asObject(row);
      const id = asString(data.id);
      const runId = asString(data.runId);
      const status = asString(data.status) as "draft" | "published" | "archived" | "rejected" | null;
      if (!id || !runId || !status) continue;

      await tx.generatedQuestionItem.upsert({
        where: { id },
        create: {
          id,
          runId,
          questionId: asString(data.questionId),
          status,
          similarityScore: asNumber(data.similarityScore),
          overlapScore: asNumber(data.overlapScore),
          validationErrors: asJsonObject(data.validationErrors),
          reviewerNotes: asString(data.reviewerNotes),
          createdAt: toDate(data.createdAt) ?? new Date(),
        },
        update: {
          runId,
          questionId: asString(data.questionId),
          status,
          similarityScore: asNumber(data.similarityScore),
          overlapScore: asNumber(data.overlapScore),
          validationErrors: asJsonObject(data.validationErrors),
          reviewerNotes: asString(data.reviewerNotes),
        },
      });
    }
  });
}

async function importValidatedPayload(params: {
  userId: string;
  deviceId: string;
  payload: SyncBundlePayload;
  checksum: string;
}): Promise<SyncApplyResult> {
  const syncJob = await createSyncJob({
    userId: params.userId,
    deviceId: params.deviceId,
    direction: "push_to_desktop",
  });

  try {
    await applySyncPayload({
      userId: params.userId,
      payload: params.payload,
    });

    const preview = clampPreview(params.payload);

    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: "succeeded",
        summary: {
          preview,
          checksum: params.checksum,
        },
        completedAt: new Date(),
      },
    });

    await markSyncState({
      userId: params.userId,
      deviceId: params.deviceId,
      checksum: params.checksum,
      direction: "push_to_desktop",
    });

    return {
      ok: true,
      syncJobId: syncJob.id,
      imported: {
        reference: preview.referenceCount,
        userState: preview.userStateCount,
        generated: preview.generatedCount,
      },
      message: "Sync import applied successfully.",
    };
  } catch (error) {
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message : "SYNC_IMPORT_FAILED",
        completedAt: new Date(),
      },
    });
    throw error;
  }
}

export async function importSyncEnvelope(params: {
  userId: string;
  deviceId: string;
  syncToken: string;
  envelope: unknown;
}): Promise<SyncApplyResult> {
  const parsedEnvelope = syncEnvelopeSchema.safeParse(params.envelope);
  if (!parsedEnvelope.success) {
    throw new Error("INVALID_SYNC_ENVELOPE");
  }

  const decryptedPayload = decryptSyncEnvelope({
    syncToken: params.syncToken,
    envelope: parsedEnvelope.data,
  });
  const parsedPayload = syncBundlePayloadSchema.safeParse(decryptedPayload);
  if (!parsedPayload.success) {
    throw new Error("INVALID_SYNC_PAYLOAD");
  }

  return importValidatedPayload({
    userId: params.userId,
    deviceId: params.deviceId,
    payload: parsedPayload.data,
    checksum: parsedEnvelope.data.meta.checksum,
  });
}

export async function importSyncPayload(params: {
  userId: string;
  deviceId: string;
  payload: unknown;
}): Promise<SyncApplyResult> {
  const parsedPayload = syncBundlePayloadSchema.safeParse(params.payload);
  if (!parsedPayload.success) {
    throw new Error("INVALID_SYNC_PAYLOAD");
  }

  const checksum = buildPayloadChecksum(JSON.stringify(parsedPayload.data));
  return importValidatedPayload({
    userId: params.userId,
    deviceId: params.deviceId,
    payload: parsedPayload.data,
    checksum,
  });
}

export async function getSyncStatusForUser(userId: string) {
  const [devices, latestJobs] = await Promise.all([
    prisma.syncDevice.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        devicePublicId: true,
        deviceName: true,
        platform: true,
        status: true,
        pairedAt: true,
        lastSeenAt: true,
        updatedAt: true,
      },
    }),
    prisma.syncJob.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        deviceId: true,
        direction: true,
        status: true,
        summary: true,
        error: true,
        createdAt: true,
        completedAt: true,
      },
    }),
  ]);

  return {
    devices,
    jobs: latestJobs,
  };
}
