import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { SUBJECT_CONFIG } from "@cah-qbank/domain";

import { prisma } from "./lib/prisma";
import { loadModuleMap } from "./ingest/moduleMap";

dotenv.config();

async function findOrCreateTag(name: string, kind: "topic" | "module" | "meta" | "ranZcogDomain", parentId: string | null) {
  const existing = await prisma.tag.findFirst({ where: { name, kind, parentId }, select: { id: true } });
  if (existing) return existing.id;
  const created = await prisma.tag.create({ data: { name, kind, parentId }, select: { id: true } });
  return created.id;
}

async function seed() {
  const email = (process.env.DEV_USER_EMAIL ?? "dev@example.com").toLowerCase();
  const password = process.env.DEV_USER_PASSWORD ?? "changeme123";
  const passwordHash = await bcrypt.hash(password, 12);
  const onboardingCompletedAt = new Date();

  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: "ADMIN", onboardingCompletedAt },
    create: { email, passwordHash, role: "ADMIN", onboardingCompletedAt },
  });

  const modules = loadModuleMap();
  for (const module of modules) {
    await findOrCreateTag(module.displayName, "module", null);
  }

  const generalPaedsTagId = await findOrCreateTag("General Paediatrics", "topic", null);
  await findOrCreateTag("Adolescent Health", "topic", null);
  await findOrCreateTag("Child Development", "topic", null);

  const seedFingerprint = "seed:dev-sample-sba-cah-v1";
  const existingSeedQuestion = await prisma.question.findUnique({ where: { sourceFingerprint: seedFingerprint }, select: { id: true } });

  if (!existingSeedQuestion) {
    const question = await prisma.question.create({
      data: {
        type: "SBA",
        stem: "A 4-year-old with viral gastroenteritis is alert, drinking small sips, and has mild dehydration. What is the most appropriate immediate management?",
        options: [
          { key: "A", text: "Start oral rehydration solution and provide safety-net advice" },
          { key: "B", text: "Immediate IV broad-spectrum antibiotics" },
          { key: "C", text: "Urgent CT abdomen" },
          { key: "D", text: "Routine fasting until diarrhoea stops" },
          { key: "E", text: "Discharge without hydration advice" },
        ],
        correctKey: "A",
        explanation: "A child with mild dehydration who is alert and able to drink is usually managed with oral rehydration and clear return precautions. Escalation depends on severity, oral tolerance, and red flags.",
        rationale: "Seed fallback question for local runtime and smoke validation.",
        difficulty: "Basic",
        ausScore: 1,
        moduleCode: `${SUBJECT_CONFIG.moduleCodePrefix} 00`,
        createdBy: "manual",
        status: "published",
        source: {
          file: "seed.ts",
          originalQNumber: "seed-1",
          sectionTitle: "Development Seed",
        },
        sourceFingerprint: seedFingerprint,
      },
      select: { id: true },
    });

    await prisma.questionTag.upsert({
      where: { questionId_tagId: { questionId: question.id, tagId: generalPaedsTagId } },
      update: {},
      create: { questionId: question.id, tagId: generalPaedsTagId },
    });
  }

  console.log(`Seed complete. Dev user: ${email}`);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
