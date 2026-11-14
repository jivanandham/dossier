-- AlterEnum
ALTER TYPE "PostingSource" ADD VALUE IF NOT EXISTS 'STARTUPS';

-- CreateTable
CREATE TABLE "StartupBoard" (
    "startupId" TEXT NOT NULL,
    "board" TEXT NOT NULL DEFAULT '',
    "error" TEXT NOT NULL DEFAULT '',
    "checkedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StartupBoard_pkey" PRIMARY KEY ("startupId")
);

-- CreateTable
CREATE TABLE "StartupJob" (
    "id" TEXT NOT NULL,
    "startupId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "board" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "place" TEXT NOT NULL DEFAULT '',
    "remote" BOOLEAN,
    "department" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "complete" BOOLEAN NOT NULL DEFAULT true,
    "postedAt" TIMESTAMP(3),
    "relevance" INTEGER NOT NULL DEFAULT 0,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StartupJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StartupJob_externalId_key" ON "StartupJob"("externalId");

-- CreateIndex
CREATE INDEX "StartupJob_startupId_relevance_idx" ON "StartupJob"("startupId", "relevance");

-- AddForeignKey
ALTER TABLE "StartupBoard" ADD CONSTRAINT "StartupBoard_startupId_fkey" FOREIGN KEY ("startupId") REFERENCES "Startup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StartupJob" ADD CONSTRAINT "StartupJob_startupId_fkey" FOREIGN KEY ("startupId") REFERENCES "Startup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
