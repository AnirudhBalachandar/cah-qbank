-- Required extension for vector embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TagKind" AS ENUM ('topic', 'module', 'ranZcogDomain', 'meta');
CREATE TYPE "QuestionType" AS ENUM ('SBA', 'EMQ_STEM');
CREATE TYPE "CreatedBy" AS ENUM ('import', 'ai', 'manual');
CREATE TYPE "QuestionStatus" AS ENUM ('published', 'draft', 'archived');
CREATE TYPE "AttemptMode" AS ENUM ('revision', 'timed', 'weakness', 'custom');
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');
CREATE TYPE "GenerationStrictness" AS ENUM ('strict_internal', 'augmented');
CREATE TYPE "MasteryModel" AS ENUM ('beta', 'elo');
CREATE TYPE "SourceType" AS ENUM ('pdf', 'docx', 'web');
CREATE TYPE "GeneratedRunStatus" AS ENUM ('queued', 'processing', 'completed', 'failed');
CREATE TYPE "GeneratedItemStatus" AS ENUM ('draft', 'published', 'archived', 'rejected');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "examDate" TIMESTAMP(3),
    "dailyTarget" INTEGER,
    "defaultGenerationStrictness" "GenerationStrictness" NOT NULL DEFAULT 'strict_internal',
    "onboardingCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "TagKind" NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "stem" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctKey" TEXT,
    "explanation" TEXT,
    "rationale" TEXT,
    "whyOthersWrong" JSONB,
    "citations" JSONB,
    "difficulty" TEXT,
    "ausScore" INTEGER,
    "moduleCode" TEXT,
    "createdBy" "CreatedBy" NOT NULL DEFAULT 'import',
    "status" "QuestionStatus" NOT NULL DEFAULT 'published',
    "source" JSONB NOT NULL,
    "sourceFingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmqSet" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "instructions" TEXT,
    "optionList" JSONB NOT NULL,
    "source" JSONB NOT NULL,
    "sourceFingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmqSet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuestionEmqSet" (
    "questionId" TEXT NOT NULL,
    "emqSetId" TEXT NOT NULL,
    CONSTRAINT "QuestionEmqSet_pkey" PRIMARY KEY ("questionId","emqSetId")
);

CREATE TABLE "QuestionTag" (
    "questionId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    CONSTRAINT "QuestionTag_pkey" PRIMARY KEY ("questionId","tagId")
);

CREATE TABLE "PracticeSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" "AttemptMode" NOT NULL,
    "durationMinutes" INTEGER,
    "questionIds" JSONB NOT NULL,
    "filters" JSONB NOT NULL,
    "currentIndex" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PracticeSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "sessionId" TEXT,
    "selectedKey" TEXT,
    "isCorrect" BOOLEAN NOT NULL,
    "timeSpentMs" INTEGER,
    "confidence" INTEGER,
    "mode" "AttemptMode" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Flag" (
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Flag_pkey" PRIMARY KEY ("userId","questionId")
);

CREATE TABLE "UserNote" (
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "noteMarkdown" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserNote_pkey" PRIMARY KEY ("userId","questionId")
);

CREATE TABLE "IssueReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IssueReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Mastery" (
    "userId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "model" "MasteryModel" NOT NULL DEFAULT 'beta',
    "masteryScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "elo" INTEGER,
    "alpha" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "beta" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Mastery_pkey" PRIMARY KEY ("userId","tagId")
);

CREATE TABLE "ContentChunk" (
    "id" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "title" TEXT,
    "heading" TEXT,
    "pageStart" INTEGER,
    "pageEnd" INTEGER,
    "text" TEXT NOT NULL,
    "embedding" vector(1536),
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContentChunk_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GeneratedQuestionRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weaknessTags" JSONB NOT NULL,
    "strictness" "GenerationStrictness" NOT NULL,
    "status" "GeneratedRunStatus" NOT NULL DEFAULT 'queued',
    "logs" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GeneratedQuestionRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GeneratedQuestionItem" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "questionId" TEXT,
    "status" "GeneratedItemStatus" NOT NULL DEFAULT 'draft',
    "similarityScore" DOUBLE PRECISION,
    "overlapScore" DOUBLE PRECISION,
    "validationErrors" JSONB,
    "reviewerNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GeneratedQuestionItem_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Tag_name_parentId_kind_key" ON "Tag"("name", "parentId", "kind");
CREATE UNIQUE INDEX "Question_sourceFingerprint_key" ON "Question"("sourceFingerprint");
CREATE UNIQUE INDEX "EmqSet_sourceFingerprint_key" ON "EmqSet"("sourceFingerprint");
CREATE INDEX "Question_status_createdBy_createdAt_idx" ON "Question"("status", "createdBy", "createdAt");
CREATE INDEX "PracticeSession_userId_createdAt_idx" ON "PracticeSession"("userId", "createdAt");
CREATE INDEX "Attempt_userId_createdAt_idx" ON "Attempt"("userId", "createdAt");
CREATE INDEX "Attempt_questionId_idx" ON "Attempt"("questionId");
CREATE INDEX "Attempt_mode_idx" ON "Attempt"("mode");
CREATE INDEX "Attempt_sessionId_idx" ON "Attempt"("sessionId");
CREATE INDEX "IssueReport_userId_createdAt_idx" ON "IssueReport"("userId", "createdAt");
CREATE INDEX "Mastery_userId_masteryScore_idx" ON "Mastery"("userId", "masteryScore");
CREATE INDEX "ContentChunk_sourceType_sourceRef_idx" ON "ContentChunk"("sourceType", "sourceRef");
CREATE INDEX "GeneratedQuestionRun_userId_createdAt_idx" ON "GeneratedQuestionRun"("userId", "createdAt");
CREATE INDEX "GeneratedQuestionItem_runId_status_idx" ON "GeneratedQuestionItem"("runId", "status");
CREATE INDEX "ContentChunk_embedding_cosine_idx" ON "ContentChunk" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);

-- FKs
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Tag"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuestionEmqSet" ADD CONSTRAINT "QuestionEmqSet_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionEmqSet" ADD CONSTRAINT "QuestionEmqSet_emqSetId_fkey" FOREIGN KEY ("emqSetId") REFERENCES "EmqSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionTag" ADD CONSTRAINT "QuestionTag_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionTag" ADD CONSTRAINT "QuestionTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PracticeSession" ADD CONSTRAINT "PracticeSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PracticeSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Flag" ADD CONSTRAINT "Flag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Flag" ADD CONSTRAINT "Flag_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserNote" ADD CONSTRAINT "UserNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserNote" ADD CONSTRAINT "UserNote_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IssueReport" ADD CONSTRAINT "IssueReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IssueReport" ADD CONSTRAINT "IssueReport_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Mastery" ADD CONSTRAINT "Mastery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Mastery" ADD CONSTRAINT "Mastery_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GeneratedQuestionRun" ADD CONSTRAINT "GeneratedQuestionRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GeneratedQuestionItem" ADD CONSTRAINT "GeneratedQuestionItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "GeneratedQuestionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GeneratedQuestionItem" ADD CONSTRAINT "GeneratedQuestionItem_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;
