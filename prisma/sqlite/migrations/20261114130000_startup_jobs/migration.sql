-- CreateTable
CREATE TABLE "StartupBoard" (
    "startupId" TEXT NOT NULL PRIMARY KEY,
    "board" TEXT NOT NULL DEFAULT '',
    "error" TEXT NOT NULL DEFAULT '',
    "checkedAt" DATETIME NOT NULL,
    CONSTRAINT "StartupBoard_startupId_fkey" FOREIGN KEY ("startupId") REFERENCES "Startup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StartupJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "postedAt" DATETIME,
    "relevance" INTEGER NOT NULL DEFAULT 0,
    "seenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StartupJob_startupId_fkey" FOREIGN KEY ("startupId") REFERENCES "Startup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "StartupJob_externalId_key" ON "StartupJob"("externalId");

-- CreateIndex
CREATE INDEX "StartupJob_startupId_relevance_idx" ON "StartupJob"("startupId", "relevance");
