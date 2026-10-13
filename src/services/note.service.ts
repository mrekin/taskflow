import { db } from "@/lib/db";
import { parseJsonFields, getNextShortIdNum, jsonIdArrayContainsAny } from "@/lib/api-utils";
import {
  buildVisibilityWhereClause,
  resolveEffectiveVisibility,
  canReadEntity,
  canWriteEntity,
  parseVisibleUserIds,
  sanitizeRelation,
} from "@/lib/visibility";
import { cleanupAttachments } from "@/lib/attachment-cleanup";
import { isPublicReadonly } from "@/lib/config";
import type { ServiceResult } from "./types";

export interface ListNotesFilters {
  projectId?: string;
  folderId?: string;
  tagIds?: string[];
  updatedSince?: Date;
  limit?: number;
  offset?: number;
}

export interface SearchNotesFilters {
  search: string;
  projectId?: string;
  folderId?: string;
}

export interface CreateNoteData {
  title: string;
  content?: string;
  projectId?: string | null;
  folderId?: string | null;
  metadata?: Record<string, unknown>;
  tagIds?: string[];
  visibility?: string | null;
  visibleUserIds?: string[];
}

export interface UpdateNoteData {
  title?: string;
  content?: string;
  projectId?: string | null;
  folderId?: string | null;
  metadata?: Record<string, unknown>;
  tagIds?: string[];
  visibility?: string | null;
  visibleUserIds?: string[];
  versioningEnabled?: boolean;
}

function getDescendantFolderIds(
  allFolders: { id: string; parentId: string | null }[],
  rootFolderId: string | null,
): Set<string> {
  const result = new Set<string>();
  if (rootFolderId === null) {
    for (const f of allFolders) result.add(f.id);
    return result;
  }
  const queue = [rootFolderId];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    result.add(currentId);
    for (const f of allFolders) {
      if (f.parentId === currentId) queue.push(f.id);
    }
  }
  return result;
}

export const NoteService = {
  async listNotes(userId: string | null, filters: ListNotesFilters, opts?: { restrictProjectIds?: string[] }) {
    if (!userId && !isPublicReadonly()) return { items: [], total: 0 };

    const where = {
      ...(await buildVisibilityWhereClause(userId, !!userId)),
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(filters.folderId ? { folderId: filters.folderId } : {}),
      ...(filters.tagIds?.length ? jsonIdArrayContainsAny(filters.tagIds) : {}),
      ...(filters.updatedSince ? { updatedAt: { gt: filters.updatedSince } } : {}),
      ...(opts?.restrictProjectIds ? { AND: [{ projectId: { in: opts.restrictProjectIds } }] } : {}),
    };
    const paginated = filters.limit !== undefined || filters.offset !== undefined;

    const [notes, total] = await Promise.all([
      db.note.findMany({
        where,
        ...(paginated ? { take: filters.limit, skip: filters.offset ?? 0 } : {}),
        orderBy: { updatedAt: "desc" },
        include: {
          project: { select: { id: true, name: true, color: true } },
          folder: { select: { id: true, name: true, parentId: true } },
        },
      }),
      ...(paginated ? [db.note.count({ where })] : []),
    ]);

    const noteIds = notes.map(n => n.id);
    const attachmentCounts = await db.attachment.groupBy({
      by: ['entityId'],
      where: { entityId: { in: noteIds }, entityType: 'note' },
      _count: { id: true },
    });
    const attachmentCountMap = new Map(attachmentCounts.map(a => [a.entityId, a._count.id]));

    const items = notes.map((note) => ({
      ...parseJsonFields(note, "note"),
      _count: { attachments: attachmentCountMap.get(note.id) || 0 },
    }));

    // Callers that did not ask for pagination get the plain list; `total`
    // (match count ignoring limit/offset) is only meaningful when paginating
    return { items, total: paginated ? total : items.length };
  },

  /**
   * Search over the user's own notes and folders (title/content, N-<n>/F-<n>
   * shortIds, exact date or bare year). Case-insensitive for full Unicode via
   * JS-side lowercase matching. Ported 1:1 from the former inline
   * implementation in /api/notes/search — do not change semantics casually.
   */
  async searchNotes(
    userId: string,
    filters: SearchNotesFilters,
    opts?: { restrictProjectIds?: string[] },
  ): Promise<{ notes: Record<string, unknown>[]; folders: Record<string, unknown>[] }> {
    const projectId = filters.projectId;
    const folderId = filters.folderId;
    const search = filters.search;
    const tokenProjectScope = opts?.restrictProjectIds;

    const searchLower = search.toLowerCase();

    const noteShortIdMatch = search.match(/^N-(\d+)$/i);
    const noteShortIdNum = noteShortIdMatch ? parseInt(noteShortIdMatch[1], 10) : null;

    const folderShortIdMatch = search.match(/^F-(\d+)$/i);
    const folderShortIdNum = folderShortIdMatch ? parseInt(folderShortIdMatch[1], 10) : null;

    const dateMatch = search.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    const dateStart = dateMatch
      ? new Date(`${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}T00:00:00.000Z`)
      : null;
    const dateEnd = dateStart ? new Date(dateStart.getTime() + 86400000) : null;

    const partialDateMatch = search.match(/^(\d{4})$/);
    const yearStart = partialDateMatch ? new Date(`${partialDateMatch[1]}-01-01T00:00:00.000Z`) : null;
    const yearEnd = yearStart ? new Date(`${parseInt(partialDateMatch![1]) + 1}-01-01T00:00:00.000Z`) : null;

    // Get folder tree for scoping
    const allFolders = await db.noteFolder.findMany({
      where: {
        ownerId: userId,
        ...(projectId ? { projectId } : {}),
        ...(tokenProjectScope ? { projectId: { in: tokenProjectScope } } : {}),
      },
      select: { id: true, parentId: true, shortIdNum: true },
    });

    const scopeIds = getDescendantFolderIds(allFolders, folderId ?? null);

    // For folders: exclude the root folder itself from search results
    const folderScopeIds = new Set(scopeIds);
    if (folderId) folderScopeIds.delete(folderId);

    // Fetch all notes in scope, filter in JS for case-insensitive Unicode
    const noteWhereBase: Record<string, unknown> = {
      ownerId: userId,
      ...(projectId ? { projectId } : {}),
      ...(tokenProjectScope ? { projectId: { in: tokenProjectScope } } : {}),
    };

    if (folderId) {
      noteWhereBase.folderId = { in: Array.from(scopeIds) };
    }

    const allScopedNotes = await db.note.findMany({
      where: noteWhereBase,
      orderBy: { updatedAt: "desc" },
      include: {
        project: { select: { id: true, name: true, color: true } },
        folder: { select: { id: true, name: true, parentId: true } },
      },
    });

    const matchedNotes = allScopedNotes.filter((n) => {
      if (n.title.toLowerCase().includes(searchLower)) return true;
      if (n.content.toLowerCase().includes(searchLower)) return true;
      if (noteShortIdNum !== null && n.shortIdNum === noteShortIdNum) return true;
      if (dateStart && dateEnd) {
        const created = new Date(n.createdAt);
        const updated = new Date(n.updatedAt);
        if (created >= dateStart && created < dateEnd) return true;
        if (updated >= dateStart && updated < dateEnd) return true;
      }
      if (yearStart && yearEnd) {
        const created = new Date(n.createdAt);
        const updated = new Date(n.updatedAt);
        if (created >= yearStart && created < yearEnd) return true;
        if (updated >= yearStart && updated < yearEnd) return true;
      }
      return false;
    });

    // Fetch all folders in scope, filter in JS for case-insensitive Unicode
    const allScopedFolders = await db.noteFolder.findMany({
      where: {
        id: { in: Array.from(folderScopeIds) },
        ownerId: userId,
        ...(projectId ? { projectId } : {}),
        ...(tokenProjectScope ? { projectId: { in: tokenProjectScope } } : {}),
      },
      orderBy: { sortOrder: "asc" },
      include: {
        parent: { select: { id: true, name: true, parentId: true } },
        _count: { select: { children: true, notes: true } },
      },
    });

    const matchedFolders = allScopedFolders.filter((f) => {
      if (f.name.toLowerCase().includes(searchLower)) return true;
      if (folderShortIdNum !== null && f.shortIdNum === folderShortIdNum) return true;
      return false;
    });

    return {
      notes: matchedNotes.map((n) => parseJsonFields(n, "note")),
      folders: matchedFolders.map((f) => parseJsonFields(f, "folder")),
    };
  },

  async getNote(userId: string | null, id: string): Promise<ServiceResult<Record<string, unknown>>> {
    if (!userId && !isPublicReadonly()) return { ok: false, status: 401, error: "Authentication required" };

    const note = await db.note.findFirst({
      where: { id },
      include: {
        project: { select: { id: true, name: true, color: true, visibility: true, visibleUserIds: true, ownerId: true, areaId: true } },
        folder: { select: { id: true, name: true, parentId: true, visibility: true, visibleUserIds: true, ownerId: true } },
      },
    });

    if (!note) {
      return { ok: false, status: 404, error: "Note not found" };
    }

    const parentChain: Array<{ visibility: string | null; ownerId: string }> = [];

    if (note.folderId && note.folder) {
      let currentFolder: { id: string; parentId: string | null; visibility: string | null; ownerId: string } | null = note.folder as any;
      while (currentFolder) {
        parentChain.push({ visibility: currentFolder.visibility, ownerId: currentFolder.ownerId });
        if (currentFolder.parentId) {
          const parent = await db.noteFolder.findFirst({
            where: { id: currentFolder.parentId },
            select: { id: true, parentId: true, visibility: true, ownerId: true },
          });
          currentFolder = parent;
        } else {
          currentFolder = null;
        }
      }
    }

    if (note.projectId && note.project) {
      parentChain.push({ visibility: (note.project as any).visibility, ownerId: (note.project as any).ownerId });
      if ((note.project as any).areaId) {
        const area = await db.area.findFirst({
          where: { id: (note.project as any).areaId },
          select: { visibility: true, ownerId: true },
        });
        if (area) {
          parentChain.push({ visibility: area.visibility, ownerId: area.ownerId });
        }
      }
    }

    const effectiveVisibility = resolveEffectiveVisibility(note.visibility, parentChain);
    const noteVisibleUserIds = parseVisibleUserIds(note.visibleUserIds);

    if (!canReadEntity(userId, note.ownerId, effectiveVisibility, noteVisibleUserIds, !!userId)) {
      return { ok: false, status: 404, error: "Note not found" };
    }

    const response: Record<string, unknown> = { ...parseJsonFields(note, "note") };

    if (note.project) {
      const projectParentChain: Array<{ visibility: string | null; ownerId: string }> = [];
      if ((note.project as any).areaId) {
        const area = await db.area.findFirst({
          where: { id: (note.project as any).areaId },
          select: { visibility: true, ownerId: true },
        });
        if (area) projectParentChain.push(area);
      }
      response.project = sanitizeRelation(
        note.project as any,
        (note.project as any).ownerId,
        userId,
        !!userId,
        projectParentChain,
      );
    }

    if (note.folder) {
      response.folder = sanitizeRelation(
        note.folder as any,
        (note.folder as any).ownerId,
        userId,
        !!userId,
        parentChain.filter((_, i) => i < parentChain.length),
      );
    }

    return { ok: true, data: response };
  },

  async createNote(userId: string, data: CreateNoteData): Promise<ServiceResult<Record<string, unknown>>> {
    if (!data.title || typeof data.title !== "string" || data.title.trim() === "") {
      return { ok: false, status: 400, error: "Title is required" };
    }

    const noteProjectId = data.projectId ?? null;
    const noteFolderId = data.folderId ?? null;
    const duplicateNote = await db.note.findFirst({
      where: {
        title: data.title.trim(),
        projectId: noteProjectId,
        folderId: noteFolderId,
        ownerId: userId,
      },
    });
    if (duplicateNote) {
      return { ok: false, status: 409, error: "A note with this title already exists in this location" };
    }

    const maxSortNote = await db.note.findFirst({
      where: { ownerId: userId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const shortIdNum = await getNextShortIdNum(db.note, userId);

    const note = await db.note.create({
      data: {
        title: data.title.trim(),
        content: data.content ?? "",
        projectId: data.projectId ?? null,
        folderId: data.folderId ?? null,
        metadata: data.metadata ? JSON.stringify(data.metadata) : "{}",
        tagIds: data.tagIds ? JSON.stringify(data.tagIds) : "[]",
        shortIdNum,
        ownerId: userId,
        sortOrder: (maxSortNote?.sortOrder ?? -1) + 1,
        visibility: data.visibility ?? null,
        visibleUserIds: JSON.stringify(data.visibleUserIds || []),
      },
      include: {
        project: { select: { id: true, name: true, color: true } },
      },
    });

    return { ok: true, data: parseJsonFields(note, "note") };
  },

  async updateNote(userId: string, id: string, data: UpdateNoteData): Promise<ServiceResult<Record<string, unknown>>> {
    const existing = await db.note.findFirst({ where: { id } });
    if (!existing) {
      return { ok: false, status: 404, error: "Not found or access denied" };
    }

    if (!canWriteEntity(userId, existing.ownerId)) {
      return { ok: false, status: 404, error: "Not found or access denied" };
    }

    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData.title = data.title.trim();
    if (data.content !== undefined) updateData.content = data.content;
    if (data.projectId !== undefined) updateData.projectId = data.projectId;
    if (data.folderId !== undefined) updateData.folderId = data.folderId;
    if (data.metadata !== undefined) updateData.metadata = JSON.stringify(data.metadata);
    if (data.tagIds !== undefined) updateData.tagIds = JSON.stringify(data.tagIds);
    if (data.visibility !== undefined) updateData.visibility = data.visibility;
    if (data.visibleUserIds !== undefined) updateData.visibleUserIds = JSON.stringify(data.visibleUserIds);
    if (data.versioningEnabled !== undefined) updateData.versioningEnabled = data.versioningEnabled;

    if (data.title !== undefined || data.folderId !== undefined || data.projectId !== undefined) {
      const checkTitle = data.title !== undefined ? data.title.trim() : existing.title;
      const checkProjectId = data.projectId !== undefined ? data.projectId : existing.projectId;
      const checkFolderId = data.folderId !== undefined ? data.folderId : existing.folderId;
      const duplicateNote = await db.note.findFirst({
        where: {
          title: checkTitle,
          projectId: checkProjectId ?? null,
          folderId: checkFolderId ?? null,
          ownerId: userId,
          id: { not: id },
        },
      });
      if (duplicateNote) {
        return { ok: false, status: 409, error: "A note with this title already exists in this location" };
      }
    }

    const note = await db.note.update({
      where: { id },
      data: updateData,
      include: {
        project: { select: { id: true, name: true, color: true } },
      },
    });

    return { ok: true, data: parseJsonFields(note, "note") };
  },

  async deleteNote(userId: string, id: string): Promise<ServiceResult<{ success: boolean }>> {
    const existing = await db.note.findFirst({ where: { id } });
    if (!existing) {
      return { ok: false, status: 404, error: "Not found or access denied" };
    }

    if (!canWriteEntity(userId, existing.ownerId)) {
      return { ok: false, status: 404, error: "Not found or access denied" };
    }

    await cleanupAttachments([{ id, type: 'note' }]);
    await db.note.delete({ where: { id } });

    return { ok: true, data: { success: true } };
  },
};
