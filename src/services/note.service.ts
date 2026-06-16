import { db } from "@/lib/db";
import { parseJsonFields, getNextShortIdNum } from "@/lib/api-utils";
import {
  buildVisibilityWhereClause,
  resolveEffectiveVisibility,
  canReadEntity,
  canWriteEntity,
  parseVisibleUserIds,
  sanitizeRelation,
} from "@/lib/visibility";
import { cleanupAttachments } from "@/lib/attachment-cleanup";
import type { ServiceResult } from "./types";

export interface ListNotesFilters {
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

export const NoteService = {
  async listNotes(userId: string | null, filters: ListNotesFilters) {
    if (!userId) return [];

    const notes = await db.note.findMany({
      where: {
        ...buildVisibilityWhereClause(userId, !!userId),
        ...(filters.projectId ? { projectId: filters.projectId } : {}),
        ...(filters.folderId ? { folderId: filters.folderId } : {}),
      },
      orderBy: { updatedAt: "desc" },
      include: {
        project: { select: { id: true, name: true, color: true } },
        folder: { select: { id: true, name: true, parentId: true } },
      },
    });

    const noteIds = notes.map(n => n.id);
    const attachmentCounts = await db.attachment.groupBy({
      by: ['entityId'],
      where: { entityId: { in: noteIds }, entityType: 'note' },
      _count: { id: true },
    });
    const attachmentCountMap = new Map(attachmentCounts.map(a => [a.entityId, a._count.id]));

    return notes.map((note) => ({
      ...parseJsonFields(note, "note"),
      _count: { attachments: attachmentCountMap.get(note.id) || 0 },
    }));
  },

  async getNote(userId: string | null, id: string): Promise<ServiceResult<Record<string, unknown>>> {
    if (!userId) return { ok: false, status: 401, error: "Authentication required" };

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
