import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { ServiceResult } from "./types";
import { getStorageAdapter } from "@/lib/storage";
import JSZip from "jszip";

/**
 * Full-data export / import for backup, restore and instance migration.
 *
 * Scope: all entities owned by the user (filtered by `ownerId`, NoteVersion by
 * `authorId`). Attachments/FileBlobs are NOT part of the JSON bundle — files
 * are downloaded separately via `exportFilesZip` (a ZIP + manifest bound to
 * entities). Runtime tables (WebhookDelivery, ScheduledJob) and auth (User) are
 * excluded.
 *
 * IDs and shortIdNum are preserved across export/import so internal references
 * (#T-5 mentions, $cost links, hierarchies) stay stable. On import every record
 * is re-stamped with the importing user's `ownerId` (the source instance may be
 * a different user). The only ID remap is for Tags: Tag has @@unique([name, ownerId]),
 * so a name collision reuses the existing tag id and remaps `tagIds` references.
 */

const SCHEMA_VERSION = 1;

export type ImportMode = "replace" | "merge-skip" | "merge-overwrite";

export interface ImportStats {
  created: number;
  updated: number;
  skipped: number;
  byTable: Record<string, number>;
}

export interface ExportBundle {
  app: "taskflow";
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  data: {
    tags: unknown[];
    areas: unknown[];
    projects: unknown[];
    tasks: unknown[];
    noteFolders: unknown[];
    notes: unknown[];
    noteVersions: unknown[];
    comments: unknown[];
    webhooks: unknown[];
    webhookTriggers: unknown[];
  };
}

type Stat = { created: number; updated: number; skipped: number; written: number };

function newStat(): Stat {
  return { created: 0, updated: 0, skipped: 0, written: 0 };
}

/** Coerce a bundle field into an array of plain objects (defensive parse). */
function asArray(value: unknown): any[] {
  return Array.isArray(value) ? (value as any[]) : [];
}

/**
 * Order self-referential rows parents-first (parentId). Rows whose parent is
 * absent from the set are treated as roots. Cycles are broken via `visited`.
 */
function topoSort(rows: any[], parentKey: string): any[] {
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  const ordered: any[] = [];
  const visited = new Set<string>();
  const visit = (row: any) => {
    const id = String(row.id);
    if (visited.has(id)) return;
    visited.add(id);
    const pid = row[parentKey];
    if (pid != null) {
      const parentKey2 = String(pid);
      if (byId.has(parentKey2) && !visited.has(parentKey2)) {
        visit(byId.get(parentKey2));
      }
    }
    ordered.push(row);
  };
  for (const r of rows) visit(r);
  return ordered;
}

/** Null out parent refs that point outside the bundle (orphan safety). */
function nullMissingParents(rows: any[], parentKey: string): any[] {
  const ids = new Set(rows.map((r) => String(r.id)));
  return rows.map((r) => {
    const pid = r[parentKey];
    if (pid != null && !ids.has(String(pid))) {
      return { ...r, [parentKey]: null };
    }
    return r;
  });
}

/** Remap a JSON-stringified tagIds array through the tag remap table. */
function remapTagIdsString(value: unknown, remap: Map<string, string>): string {
  if (typeof value !== "string") return "[]";
  try {
    const arr = JSON.parse(value);
    if (!Array.isArray(arr)) return "[]";
    return JSON.stringify(arr.map((id: unknown) => (typeof id === "string" && remap.has(id) ? remap.get(id)! : id)));
  } catch {
    return "[]";
  }
}

export const DataService = {
  /** Build a full-data bundle for the given user. */
  async exportData(userId: string, appVersion: string): Promise<ServiceResult<ExportBundle>> {
    const [tags, areas, projects, tasks, noteFolders, notes, noteVersions, comments, webhooks] =
      await Promise.all([
        db.tag.findMany({ where: { ownerId: userId } }),
        db.area.findMany({ where: { ownerId: userId } }),
        db.project.findMany({ where: { ownerId: userId } }),
        db.task.findMany({ where: { ownerId: userId } }),
        db.noteFolder.findMany({ where: { ownerId: userId } }),
        db.note.findMany({ where: { ownerId: userId } }),
        db.noteVersion.findMany({ where: { authorId: userId } }),
        db.comment.findMany({ where: { ownerId: userId } }),
        db.webhook.findMany({ where: { ownerId: userId } }),
      ]);

    const webhookIds = webhooks.map((w) => w.id);
    const webhookTriggers = webhookIds.length
      ? await db.webhookTrigger.findMany({ where: { webhookId: { in: webhookIds } } })
      : [];

    return {
      ok: true,
      data: {
        app: "taskflow",
        schemaVersion: SCHEMA_VERSION,
        appVersion,
        exportedAt: new Date().toISOString(),
        data: {
          tags,
          areas,
          projects,
          tasks,
          noteFolders,
          notes,
          noteVersions,
          comments,
          webhooks,
          webhookTriggers,
        },
      },
    };
  },

  /**
   * Import a bundle for the user.
   * - replace: wipe the user's data, then load the file.
   * - merge-skip: add new records; existing IDs are skipped.
   * - merge-overwrite: add new, update existing (by ID).
   */
  async importData(
    userId: string,
    bundle: unknown,
    mode: ImportMode,
  ): Promise<ServiceResult<ImportStats>> {
    if (!bundle || typeof bundle !== "object") {
      return { ok: false, status: 400, error: "Invalid export file" };
    }
    const b = bundle as Partial<ExportBundle>;
    if (b.app !== "taskflow" || !b.data) {
      return { ok: false, status: 400, error: "Not a TaskFlow export file" };
    }
    const d = b.data;

    const rows = {
      tags: asArray(d.tags),
      areas: asArray(d.areas),
      projects: asArray(d.projects),
      tasks: nullMissingParents(topoSort(asArray(d.tasks), "parentId"), "parentId"),
      noteFolders: nullMissingParents(topoSort(asArray(d.noteFolders), "parentId"), "parentId"),
      notes: asArray(d.notes),
      noteVersions: asArray(d.noteVersions),
      comments: nullMissingParents(topoSort(asArray(d.comments), "parentId"), "parentId"),
      webhooks: asArray(d.webhooks),
      webhookTriggers: asArray(d.webhookTriggers),
    };

    const stat = {
      tags: newStat(),
      areas: newStat(),
      projects: newStat(),
      tasks: newStat(),
      noteFolders: newStat(),
      notes: newStat(),
      noteVersions: newStat(),
      comments: newStat(),
      webhooks: newStat(),
      webhookTriggers: newStat(),
    };

    try {
      await db.$transaction(async (tx: Prisma.TransactionClient) => {
        if (mode === "replace") {
          await wipeUser(tx, userId);
        }

        // Tags first — they build the remap used to fix tagIds on every entity.
        const tagRemap = await importTags(tx, userId, rows.tags, mode, stat.tags);

        const remap = (s: unknown) => remapTagIdsString(s, tagRemap);

        // Cleaners re-stamp ownership and clear cross-user references.
        const areas = rows.areas.map((r) => ({ ...r, ownerId: userId, visibleUserIds: "[]", tagIds: remap(r.tagIds) }));
        const projects = rows.projects.map((r) => ({ ...r, ownerId: userId, visibleUserIds: "[]", tagIds: remap(r.tagIds) }));
        const noteFolders = rows.noteFolders.map((r) => ({ ...r, ownerId: userId, visibleUserIds: "[]" }));
        const tasks = rows.tasks.map((r) => ({
          ...r,
          ownerId: userId,
          assigneeId: null,
          visibleUserIds: "[]",
          tagIds: remap(r.tagIds),
        }));
        const notes = rows.notes.map((r) => ({ ...r, ownerId: userId, visibleUserIds: "[]", tagIds: remap(r.tagIds) }));
        const comments = rows.comments.map((r) => ({ ...r, ownerId: userId }));
        const noteVersions = rows.noteVersions.map((r) => ({
          ...r,
          authorId: userId,
          visibleUserIds: "[]",
          tagIds: remap(r.tagIds),
        }));
        const webhooks = rows.webhooks.map((r) => ({ ...r, ownerId: userId }));
        const webhookTriggers = rows.webhookTriggers.map((r) => ({ ...r }));

        await insertTable(tx, "area", areas, mode, stat.areas);
        await insertTable(tx, "project", projects, mode, stat.projects);
        await insertTable(tx, "noteFolder", noteFolders, mode, stat.noteFolders);
        await insertTable(tx, "task", tasks, mode, stat.tasks);
        await insertTable(tx, "note", notes, mode, stat.notes);
        await insertTable(tx, "comment", comments, mode, stat.comments);
        await insertTable(tx, "noteVersion", noteVersions, mode, stat.noteVersions);
        await insertTable(tx, "webhook", webhooks, mode, stat.webhooks);
        await insertTable(tx, "webhookTrigger", webhookTriggers, mode, stat.webhookTriggers);
      });
    } catch (error) {
      console.error("Data import failed:", error);
      return {
        ok: false,
        status: 500,
        error: "Import failed: " + (error instanceof Error ? error.message : "unknown error"),
      };
    }

    const byTable: Record<string, number> = {};
    let created = 0;
    let updated = 0;
    let skipped = 0;
    for (const [key, s] of Object.entries(stat)) {
      byTable[key] = s.written;
      created += s.created;
      updated += s.updated;
      skipped += s.skipped;
    }

    return { ok: true, data: { created, updated, skipped, byTable } };
  },

  /** Build a ZIP of all the user's uploaded files + a manifest bound to entities. */
  async exportFilesZip(userId: string): Promise<ServiceResult<{ buffer: Buffer; filename: string }>> {
    const blobs = await db.fileBlob.findMany({
      where: { ownerId: userId },
      include: { attachments: true },
      orderBy: { createdAt: "asc" },
    });

    if (blobs.length === 0) {
      return { ok: false, status: 404, error: "No files to export" };
    }

    const storage = getStorageAdapter();
    const zip = new JSZip();
    const manifest: unknown[] = [];

    // Manifest records every blob (binding metadata survives even if bytes are
    // missing on disk); files are added separately and unreadable ones skipped.
    for (let i = 0; i < blobs.length; i++) {
      const blob = blobs[i];
      const items = blob.attachments.map((a) => ({
        attachmentId: a.id,
        entityId: a.entityId,
        entityType: a.entityType,
        displayName: a.displayName,
      }));
      const safeName = String(blob.originalName || `file-${i}`).replace(/[\\/]+/g, "_");
      const path = `files/${String(i).padStart(4, "0")}__${safeName}`;

      manifest.push({
        blobId: blob.id,
        hash: blob.hash,
        mimeType: blob.mimeType,
        size: blob.size,
        originalName: blob.originalName,
        storageKey: blob.storageKey,
        createdAt: blob.createdAt instanceof Date ? blob.createdAt.toISOString() : blob.createdAt,
        path,
        items,
      });

      const data = await storage.get(blob.storageKey);
      if (data) zip.file(path, data);
    }

    zip.file(
      "manifest.json",
      JSON.stringify(
        {
          app: "taskflow",
          exportedAt: new Date().toISOString(),
          files: manifest,
        },
        null,
        2,
      ),
    );

    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const date = new Date().toISOString().split("T")[0];
    return { ok: true, data: { buffer, filename: `taskflow-files-${date}.zip` } };
  },
};

/** Delete all of the user's data in dependency order (for `replace` mode). */
async function wipeUser(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.scheduledJob.deleteMany({ where: { ownerId: userId } });
  await tx.noteVersion.deleteMany({ where: { authorId: userId } });
  await tx.comment.deleteMany({ where: { ownerId: userId } });
  await tx.webhook.deleteMany({ where: { ownerId: userId } }); // cascades triggers + deliveries
  await tx.note.deleteMany({ where: { ownerId: userId } });
  await tx.noteFolder.deleteMany({ where: { ownerId: userId } });
  await tx.task.deleteMany({ where: { ownerId: userId } });
  await tx.project.deleteMany({ where: { ownerId: userId } });
  await tx.tag.deleteMany({ where: { ownerId: userId } });
  await tx.area.deleteMany({ where: { ownerId: userId } });
}

/**
 * Import tags, deduplicating by name within the owner. Returns a remap from
 * imported tag id → existing tag id (used to fix `tagIds` on other entities).
 */
async function importTags(
  tx: Prisma.TransactionClient,
  userId: string,
  rows: any[],
  mode: ImportMode,
  stat: Stat,
): Promise<Map<string, string>> {
  const remap = new Map<string, string>();
  if (rows.length === 0) return remap;

  const existing = mode === "replace" ? [] : await tx.tag.findMany({ where: { ownerId: userId } });
  const byName = new Map(existing.map((t) => [t.name, t]));
  const byId = new Map(existing.map((t) => [t.id, t]));

  const toCreate: any[] = [];

  for (const r of rows) {
    const id = String(r.id);
    const name = String(r.name ?? "");
    const color = r.color;

    if (mode !== "replace") {
      const sameName = byName.get(name);
      if (sameName && sameName.id !== id) {
        // Name taken by a different id → reuse it, remap references.
        remap.set(id, sameName.id);
        if (mode === "merge-overwrite") {
          await tx.tag.update({ where: { id: sameName.id }, data: { color } });
          stat.updated++;
          stat.written++;
        } else {
          stat.skipped++;
        }
        continue;
      }
      if (byId.has(id)) {
        if (mode === "merge-overwrite") {
          await tx.tag.update({ where: { id }, data: { name, color } });
          stat.updated++;
          stat.written++;
        } else {
          stat.skipped++;
        }
        continue;
      }
    }

    toCreate.push({ id, name, color, ownerId: userId });
  }

  if (toCreate.length > 0) {
    const res = await tx.tag.createMany({ data: toCreate });
    stat.created += res.count;
    stat.written += res.count;
  }

  return remap;
}

/**
 * Insert a table's rows according to the import mode.
 * Existing rows are detected up-front by id (Prisma 7's createMany has no
 * skipDuplicates for this adapter), then split into creates / updates.
 */
async function insertTable(
  tx: Prisma.TransactionClient,
  model: string,
  rows: any[],
  mode: ImportMode,
  stat: Stat,
): Promise<void> {
  if (rows.length === 0) return;
  const txAny = tx as any;

  if (mode === "replace") {
    const res = await txAny[model].createMany({ data: rows });
    stat.created += res.count;
    stat.written += res.count;
    return;
  }

  const ids = rows.map((r) => String(r.id));
  const existing =
    mode === "merge-overwrite" || mode === "merge-skip"
      ? await txAny[model].findMany({ where: { id: { in: ids } }, select: { id: true } })
      : [];
  const existingIds = new Set(existing.map((e: any) => String(e.id)));

  const toCreate = rows.filter((r) => !existingIds.has(String(r.id)));
  const toUpdate = rows.filter((r) => existingIds.has(String(r.id)));

  if (toCreate.length > 0) {
    const res = await txAny[model].createMany({ data: toCreate });
    stat.created += res.count;
    stat.written += res.count;
  }

  if (mode === "merge-skip") {
    stat.skipped += toUpdate.length;
  } else {
    // merge-overwrite: update existing rows (drop immutable id / createdAt).
    for (const r of toUpdate) {
      const id = String(r.id);
      const rest: any = { ...r };
      delete rest.id;
      delete rest.createdAt;
      await txAny[model].update({ where: { id }, data: rest });
      stat.updated++;
      stat.written++;
    }
  }
}
