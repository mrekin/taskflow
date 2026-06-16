import { db } from "@/lib/db";
import { parseJsonFields } from "@/lib/api-utils";
import { canWriteEntity } from "@/lib/visibility";
import type { Prisma } from "@/generated/prisma/client";
import { NoteService } from "@/services/note.service";
import type { ServiceResult } from "@/services/types";
import type { NoteVersion, NoteVersionAuthor, NoteVersionMeta } from "@/lib/types";

/**
 * App-level cap on the number of versions kept per note.
 * When exceeded, the oldest non-"kept" versions are pruned FIFO.
 * Configured via NOTE_VERSIONS_MAX env var (default 100).
 */
function getVersionCap(): number {
  const raw = parseInt(process.env.NOTE_VERSIONS_MAX || "100", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 100;
}

export interface CreateVersionData {
  title: string;
  content: string;
  projectId?: string | null;
  tagIds?: string[];
  visibility?: string | null;
  visibleUserIds?: string[];
  comment?: string | null;
}

/**
 * FIFO prune of oldest non-kept versions when count exceeds the cap.
 * Runs inside the caller's transaction. If every version is `kept`, nothing is
 * deleted (count may stay above cap by design — no infinite loop).
 */
async function pruneIfOverCap(tx: Prisma.TransactionClient, noteId: string): Promise<void> {
  const cap = getVersionCap();
  const total = await tx.noteVersion.count({ where: { noteId } });
  if (total <= cap) return;

  const victims = await tx.noteVersion.findMany({
    where: { noteId, kept: false },
    orderBy: { number: "asc" },
    select: { id: true },
    take: total - cap,
  });
  if (victims.length === 0) return;

  await tx.noteVersion.deleteMany({ where: { id: { in: victims.map((v) => v.id) } } });
}

/** Next incremental version number (max+1, starts at 0). */
async function nextVersionNumber(tx: Prisma.TransactionClient, noteId: string): Promise<number> {
  const max = await tx.noteVersion.findFirst({
    where: { noteId },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  return (max?.number ?? -1) + 1;
}

async function loadAuthors(authorIds: string[]): Promise<Map<string, NoteVersionAuthor>> {
  const map = new Map<string, NoteVersionAuthor>();
  if (authorIds.length === 0) return map;
  const users = await db.user.findMany({
    where: { id: { in: authorIds } },
    select: { id: true, name: true, image: true },
  });
  for (const u of users) {
    map.set(u.id, { id: u.id, name: u.name, image: u.image ?? null });
  }
  return map;
}

/** The versioned field set, serialized exactly as stored on the Note model. */
function serializeState(data: CreateVersionData) {
  return {
    title: data.title,
    content: data.content,
    projectId: data.projectId ?? null,
    tagIds: JSON.stringify(data.tagIds ?? []),
    visibility: data.visibility ?? null,
    visibleUserIds: JSON.stringify(data.visibleUserIds ?? []),
  };
}

export const NoteVersionService = {
  /** List version metadata (no full content) for a note, newest first. */
  async listVersions(
    userId: string | null,
    noteId: string,
  ): Promise<ServiceResult<NoteVersionMeta[]>> {
    const readable = await NoteService.getNote(userId, noteId);
    if (!readable.ok) return { ok: false, status: readable.status, error: readable.error };

    const rows = await db.noteVersion.findMany({
      where: { noteId },
      orderBy: { number: "desc" },
      select: {
        id: true,
        noteId: true,
        number: true,
        operation: true,
        comment: true,
        authorId: true,
        kept: true,
        createdAt: true,
      },
    });

    const authors = await loadAuthors(rows.map((r) => r.authorId));
    return {
      ok: true,
      data: rows.map((r): NoteVersionMeta => ({
        id: r.id,
        noteId: r.noteId,
        number: r.number,
        operation: r.operation as NoteVersionMeta["operation"],
        comment: r.comment,
        authorId: r.authorId,
        author: authors.get(r.authorId) ?? { id: r.authorId, name: null, image: null },
        kept: r.kept,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  },

  /** Full version state for viewing a specific version. */
  async getVersion(
    userId: string | null,
    noteId: string,
    number: number,
  ): Promise<ServiceResult<NoteVersion>> {
    const readable = await NoteService.getNote(userId, noteId);
    if (!readable.ok) return { ok: false, status: readable.status, error: readable.error };

    const row = await db.noteVersion.findFirst({
      where: { noteId, number },
    });
    if (!row) return { ok: false, status: 404, error: "Version not found" };

    const authors = await loadAuthors([row.authorId]);
    return {
      ok: true,
      data: {
        id: row.id,
        noteId: row.noteId,
        number: row.number,
        operation: row.operation as NoteVersion["operation"],
        comment: row.comment,
        authorId: row.authorId,
        author: authors.get(row.authorId) ?? { id: row.authorId, name: null, image: null },
        kept: row.kept,
        createdAt: row.createdAt.toISOString(),
        title: row.title,
        content: row.content,
        projectId: row.projectId,
        tagIds: JSON.parse(row.tagIds || "[]"),
        visibility: row.visibility,
        visibleUserIds: JSON.parse(row.visibleUserIds || "[]"),
      },
    };
  },

  /**
   * Manual save: persist the full note state AND create a new version in one
   * transaction, then prune over the cap. Returns the updated note + new version.
   */
  async createVersion(
    userId: string,
    noteId: string,
    data: CreateVersionData,
  ): Promise<ServiceResult<{ note: Record<string, unknown>; version: Pick<NoteVersionMeta, "number" | "operation"> }>> {
    const existing = await db.note.findFirst({ where: { id: noteId } });
    if (!existing) return { ok: false, status: 404, error: "Not found or access denied" };
    if (!canWriteEntity(userId, existing.ownerId)) {
      return { ok: false, status: 404, error: "Not found or access denied" };
    }

    const state = serializeState(data);

    const txResult = await db.$transaction(async (tx): Promise<{ kind: "dup" } | { kind: "ok"; versionNumber: number }> => {
      // Duplicate-title guard (mirrors NoteService.updateNote)
      if (data.title && data.title.trim() && existing.title !== data.title.trim()) {
        const duplicate = await tx.note.findFirst({
          where: {
            title: data.title.trim(),
            projectId: state.projectId,
            folderId: existing.folderId,
            ownerId: userId,
            id: { not: noteId },
          },
          select: { id: true },
        });
        if (duplicate) return { kind: "dup" };
      }

      const number = await nextVersionNumber(tx, noteId);

      await tx.note.update({
        where: { id: noteId },
        data: {
          title: state.title,
          content: state.content,
          projectId: state.projectId,
          tagIds: state.tagIds,
          visibility: state.visibility,
          visibleUserIds: state.visibleUserIds,
        },
      });

      await tx.noteVersion.create({
        data: {
          noteId,
          number,
          ...state,
          operation: "manual",
          comment: data.comment?.trim() ? data.comment.trim() : null,
          authorId: userId,
        },
      });

      await pruneIfOverCap(tx, noteId);

      return { kind: "ok", versionNumber: number };
    });

    if (txResult.kind === "dup") {
      return { ok: false, status: 409, error: "A note with this title already exists in this location" };
    }

    const updated = await db.note.findUnique({
      where: { id: noteId },
      include: { project: { select: { id: true, name: true, color: true } } },
    });
    if (!updated) return { ok: false, status: 404, error: "Not found" };

    return {
      ok: true,
      data: {
        note: parseJsonFields(updated, "note"),
        version: { number: txResult.versionNumber, operation: "manual" },
      },
    };
  },

  /**
   * Restore a version: create a NEW version carrying the selected version's full
   * state, apply that state to the live note. Comment records the source version.
   */
  async restoreVersion(
    userId: string,
    noteId: string,
    number: number,
  ): Promise<ServiceResult<{ note: Record<string, unknown>; version: Pick<NoteVersionMeta, "number" | "operation"> }>> {
    const existing = await db.note.findFirst({ where: { id: noteId } });
    if (!existing) return { ok: false, status: 404, error: "Not found or access denied" };
    if (!canWriteEntity(userId, existing.ownerId)) {
      return { ok: false, status: 404, error: "Not found or access denied" };
    }

    let versionNumber = 0;
    try {
      versionNumber = await db.$transaction(async (tx) => {
        const source = await tx.noteVersion.findFirst({ where: { noteId, number } });
        if (!source) throw new NotFoundError();

        const next = await nextVersionNumber(tx, noteId);

        await tx.noteVersion.create({
          data: {
            noteId,
            number: next,
            title: source.title,
            content: source.content,
            projectId: source.projectId,
            tagIds: source.tagIds,
            visibility: source.visibility,
            visibleUserIds: source.visibleUserIds,
            operation: "restore",
            comment: `restored from v${number}`,
            authorId: userId,
          },
        });

        await tx.note.update({
          where: { id: noteId },
          data: {
            title: source.title,
            content: source.content,
            projectId: source.projectId,
            tagIds: source.tagIds,
            visibility: source.visibility,
            visibleUserIds: source.visibleUserIds,
          },
        });

        await pruneIfOverCap(tx, noteId);
        return next;
      });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return { ok: false, status: 404, error: "Version not found" };
      }
      throw err;
    }

    const updated = await db.note.findUnique({
      where: { id: noteId },
      include: { project: { select: { id: true, name: true, color: true } } },
    });
    if (!updated) return { ok: false, status: 404, error: "Not found" };

    return {
      ok: true,
      data: {
        note: parseJsonFields(updated, "note"),
        version: { number: versionNumber, operation: "restore" },
      },
    };
  },

  /** Delete the given versions. Numbers are immutable — gaps remain. */
  async deleteVersions(
    userId: string,
    noteId: string,
    numbers: number[],
  ): Promise<ServiceResult<{ deleted: number }>> {
    const existing = await db.note.findFirst({ where: { id: noteId } });
    if (!existing) return { ok: false, status: 404, error: "Not found or access denied" };
    if (!canWriteEntity(userId, existing.ownerId)) {
      return { ok: false, status: 404, error: "Not found or access denied" };
    }
    if (!numbers.length) return { ok: true, data: { deleted: 0 } };

    const result = await db.noteVersion.deleteMany({
      where: { noteId, number: { in: numbers } },
    });
    return { ok: true, data: { deleted: result.count } };
  },

  /** Toggle the kept flag protecting a version from FIFO auto-prune. */
  async setKept(
    userId: string,
    noteId: string,
    number: number,
    kept: boolean,
  ): Promise<ServiceResult<{ kept: boolean }>> {
    const existing = await db.note.findFirst({ where: { id: noteId } });
    if (!existing) return { ok: false, status: 404, error: "Not found or access denied" };
    if (!canWriteEntity(userId, existing.ownerId)) {
      return { ok: false, status: 404, error: "Not found or access denied" };
    }

    await db.noteVersion.updateMany({
      where: { noteId, number },
      data: { kept },
    });
    return { ok: true, data: { kept } };
  },
};

class NotFoundError extends Error {}
