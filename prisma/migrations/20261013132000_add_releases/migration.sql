-- CreateTable
CREATE TABLE "Release" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "plannedStartDate" DATETIME,
    "plannedEndDate" DATETIME,
    "actualReleaseDate" DATETIME,
    "projectId" TEXT NOT NULL,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "tagIds" TEXT NOT NULL DEFAULT '[]',
    "shortIdNum" INTEGER NOT NULL DEFAULT 0,
    "ownerId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "visibility" TEXT,
    "visibleUserIds" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Release_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Release_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'todo',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "dueDate" DATETIME,
    "assigneeId" TEXT,
    "projectId" TEXT,
    "parentId" TEXT,
    "releaseId" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "tagIds" TEXT NOT NULL DEFAULT '[]',
    "shortIdNum" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "ownerId" TEXT NOT NULL,
    "visibility" TEXT,
    "visibleUserIds" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("assigneeId", "createdAt", "description", "dueDate", "id", "metadata", "ownerId", "parentId", "priority", "projectId", "shortIdNum", "sortOrder", "status", "tagIds", "title", "updatedAt", "visibility", "visibleUserIds") SELECT "assigneeId", "createdAt", "description", "dueDate", "id", "metadata", "ownerId", "parentId", "priority", "projectId", "shortIdNum", "sortOrder", "status", "tagIds", "title", "updatedAt", "visibility", "visibleUserIds" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE TABLE "new_Note" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "projectId" TEXT,
    "folderId" TEXT,
    "releaseId" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "tagIds" TEXT NOT NULL DEFAULT '[]',
    "shortIdNum" INTEGER NOT NULL DEFAULT 0,
    "ownerId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "visibility" TEXT,
    "visibleUserIds" TEXT NOT NULL DEFAULT '[]',
    "versioningEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Note_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Note_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "NoteFolder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Note_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Note_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Note" ("content", "createdAt", "folderId", "id", "metadata", "ownerId", "projectId", "shortIdNum", "sortOrder", "tagIds", "title", "updatedAt", "versioningEnabled", "visibility", "visibleUserIds") SELECT "content", "createdAt", "folderId", "id", "metadata", "ownerId", "projectId", "shortIdNum", "sortOrder", "tagIds", "title", "updatedAt", "versioningEnabled", "visibility", "visibleUserIds" FROM "Note";
DROP TABLE "Note";
ALTER TABLE "new_Note" RENAME TO "Note";
CREATE TABLE "new_NoteFolder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "projectId" TEXT,
    "parentId" TEXT,
    "releaseId" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "shortIdNum" INTEGER NOT NULL DEFAULT 0,
    "ownerId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "visibility" TEXT,
    "visibleUserIds" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NoteFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "NoteFolder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NoteFolder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NoteFolder_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "NoteFolder_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_NoteFolder" ("createdAt", "id", "metadata", "name", "ownerId", "parentId", "projectId", "shortIdNum", "sortOrder", "updatedAt", "visibility", "visibleUserIds") SELECT "createdAt", "id", "metadata", "name", "ownerId", "parentId", "projectId", "shortIdNum", "sortOrder", "updatedAt", "visibility", "visibleUserIds" FROM "NoteFolder";
DROP TABLE "NoteFolder";
ALTER TABLE "new_NoteFolder" RENAME TO "NoteFolder";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
