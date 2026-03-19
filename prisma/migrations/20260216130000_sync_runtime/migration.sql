-- CreateEnum
CREATE TYPE "SyncDeviceStatus" AS ENUM ('pending', 'active', 'revoked');

-- CreateEnum
CREATE TYPE "SyncJobDirection" AS ENUM ('push_to_desktop', 'pull_from_desktop');

-- CreateEnum
CREATE TYPE "SyncJobStatus" AS ENUM ('pending', 'processing', 'succeeded', 'failed', 'rejected');

-- CreateTable
CREATE TABLE "SyncDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "devicePublicId" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "status" "SyncDeviceStatus" NOT NULL DEFAULT 'pending',
    "pairingId" TEXT,
    "pairingCodeHash" TEXT,
    "pairingExpiresAt" TIMESTAMP(3),
    "syncTokenHash" TEXT,
    "pairedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT,
    "direction" "SyncJobDirection" NOT NULL,
    "status" "SyncJobStatus" NOT NULL DEFAULT 'pending',
    "summary" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "lastExportAt" TIMESTAMP(3),
    "lastImportAt" TIMESTAMP(3),
    "lastBundleChecksum" TEXT,
    "lastDirection" "SyncJobDirection",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SyncDevice_pairingId_key" ON "SyncDevice"("pairingId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncDevice_userId_devicePublicId_key" ON "SyncDevice"("userId", "devicePublicId");

-- CreateIndex
CREATE INDEX "SyncDevice_userId_status_idx" ON "SyncDevice"("userId", "status");

-- CreateIndex
CREATE INDEX "SyncJob_userId_createdAt_idx" ON "SyncJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SyncJob_deviceId_createdAt_idx" ON "SyncJob"("deviceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SyncState_userId_deviceId_key" ON "SyncState"("userId", "deviceId");

-- CreateIndex
CREATE INDEX "SyncState_userId_updatedAt_idx" ON "SyncState"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "SyncDevice" ADD CONSTRAINT "SyncDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncJob" ADD CONSTRAINT "SyncJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncJob" ADD CONSTRAINT "SyncJob_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "SyncDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncState" ADD CONSTRAINT "SyncState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncState" ADD CONSTRAINT "SyncState_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "SyncDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
