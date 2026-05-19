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
import type { ServiceResult } from "./types";

export interface ListFoldersFilters {
  projectId?: string;
  parentId?: string;
}

export interface CreateFolderData {
  name: string;
  projectId?: string | null;
  parentId?: string | null;
  visibility?: string | null;
  visibleUserIds?: string[];
}

export interface UpdateFolderData {
  name?: string;
  parentId?: string | null;
  visibility?: string | null;
  visibleUserIds?: string[];
}

export const FolderService = {
  async listFolders(userId: string | null, filters: ListFoldersFilters) {
    if (!userId) return [];

    const folders = await db.noteFolder.findMany({
      where: {
        ...buildVisibilityWhereClause(userId, !!userId),
        ...(filters.projectId ? { projectId: filters.projectId } : {}),
        ...(filters.parentId !== undefined ? { parentId: filters.parentId || null } : {}),
      },
      orderBy: { sortOrder: "asc" },
      include: {
        parent: { select: { id: true, name: true, parentId: true } },
        _count: { select: { children: true, notes: true } },
      },
    });

    return folders.map((folder) => parseJsonFields(folder, "folder"));
  },

  async getFolder(userId: string | null, id: string): Promise<ServiceResult<Record<string, unknown>>> {
    if (!userId) return { ok: false, status: 401, error: "Authentication required" };

    const folder = await db.noteFolder.findFirst({
      where: { id },
      include: {
        parent: { select: { id: true, name: true, parentId: true, visibility: true, visibleUserIds: true, ownerId: true } },
        _count: { select: { children: true, notes: true } },
      },
    });

    if (!folder) {
      return { ok: false, status: 404, error: "Folder not found" };
    }

    const parentChain: Array<{ visibility: string | null; ownerId: string }> = [];

    let currentParent = folder.parent as { id: string; parentId: string | null; visibility: string | null; ownerId: string } | null;
    while (currentParent) {
      parentChain.push({ visibility: currentParent.visibility, ownerId: currentParent.ownerId });
      if (currentParent.parentId) {
        const parent = await db.noteFolder.findFirst({
          where: { id: currentParent.parentId },
          select: { id: true, parentId: true, visibility: true, ownerId: true },
        });
        currentParent = parent;
      } else {
        currentParent = null;
      }
    }

    if (folder.projectId) {
      const project = await db.project.findFirst({
        where: { id: folder.projectId },
        select: { visibility: true, ownerId: true, areaId: true },
      });
      if (project) {
        parentChain.push({ visibility: project.visibility, ownerId: project.ownerId });
        if (project.areaId) {
          const area = await db.area.findFirst({
            where: { id: project.areaId },
            select: { visibility: true, ownerId: true },
          });
          if (area) {
            parentChain.push({ visibility: area.visibility, ownerId: area.ownerId });
          }
        }
      }
    }

    const effectiveVisibility = resolveEffectiveVisibility(folder.visibility, parentChain);
    const folderVisibleUserIds = parseVisibleUserIds(folder.visibleUserIds);

    if (!canReadEntity(userId, folder.ownerId, effectiveVisibility, folderVisibleUserIds, !!userId)) {
      return { ok: false, status: 404, error: "Folder not found" };
    }

    const response: Record<string, unknown> = { ...parseJsonFields(folder, "folder") };

    if (folder.parent) {
      response.parent = sanitizeRelation(
        folder.parent as any,
        (folder.parent as any).ownerId,
        userId,
        !!userId,
        parentChain,
      );
    }

    return { ok: true, data: response };
  },

  async createFolder(userId: string, data: CreateFolderData): Promise<ServiceResult<Record<string, unknown>>> {
    if (!data.name || typeof data.name !== "string" || data.name.trim() === "") {
      return { ok: false, status: 400, error: "Name is required" };
    }

    const duplicate = await db.noteFolder.findFirst({
      where: {
        name: data.name.trim(),
        parentId: data.parentId ?? null,
        ownerId: userId,
      },
    });
    if (duplicate) {
      return { ok: false, status: 409, error: "A folder with this name already exists in this location" };
    }

    if (data.parentId) {
      let depth = 1;
      let currentParentId: string | null = data.parentId;
      while (currentParentId) {
        depth++;
        if (depth > 4) {
          return { ok: false, status: 400, error: "Maximum folder nesting depth (3) reached" };
        }
        const parent = await db.noteFolder.findFirst({
          where: { id: currentParentId },
          select: { parentId: true },
        });
        currentParentId = parent?.parentId ?? null;
      }
    }

    const maxSortFolder = await db.noteFolder.findFirst({
      where: { ownerId: userId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const shortIdNum = await getNextShortIdNum(db.noteFolder, userId);

    const folder = await db.noteFolder.create({
      data: {
        name: data.name.trim(),
        projectId: data.projectId ?? null,
        parentId: data.parentId ?? null,
        shortIdNum,
        ownerId: userId,
        sortOrder: (maxSortFolder?.sortOrder ?? -1) + 1,
        visibility: data.visibility ?? null,
        visibleUserIds: JSON.stringify(data.visibleUserIds || []),
      },
      include: {
        parent: { select: { id: true, name: true, parentId: true } },
        _count: { select: { children: true, notes: true } },
      },
    });

    return { ok: true, data: parseJsonFields(folder, "folder") };
  },

  async updateFolder(userId: string, id: string, data: UpdateFolderData): Promise<ServiceResult<Record<string, unknown>>> {
    const existing = await db.noteFolder.findFirst({ where: { id } });
    if (!existing) {
      return { ok: false, status: 404, error: "Not found or access denied" };
    }

    if (!canWriteEntity(userId, existing.ownerId)) {
      return { ok: false, status: 404, error: "Not found or access denied" };
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.visibility !== undefined) updateData.visibility = data.visibility;
    if (data.visibleUserIds !== undefined) updateData.visibleUserIds = JSON.stringify(data.visibleUserIds);

    const newName = data.name !== undefined ? data.name.trim() : existing.name;
    const newParentId = data.parentId !== undefined ? (data.parentId || null) : existing.parentId;
    if (data.name !== undefined || data.parentId !== undefined) {
      const duplicate = await db.noteFolder.findFirst({
        where: {
          name: newName,
          parentId: newParentId,
          ownerId: userId,
          id: { not: id },
        },
      });
      if (duplicate) {
        return { ok: false, status: 409, error: "A folder with this name already exists in this location" };
      }
    }

    if (data.parentId !== undefined) {
      if (data.parentId === id) {
        return { ok: false, status: 400, error: "A folder cannot be its own parent" };
      }

      if (data.parentId) {
        let depth = 1;
        let currentId: string | null = data.parentId;
        const visited = new Set<string>();
        while (currentId) {
          if (currentId === id) {
            return { ok: false, status: 400, error: "Circular reference detected" };
          }
          if (visited.has(currentId)) break;
          visited.add(currentId);
          depth++;
          if (depth > 4) {
            return { ok: false, status: 400, error: "Maximum folder nesting depth (3) reached" };
          }
          const parent = await db.noteFolder.findFirst({
            where: { id: currentId },
            select: { parentId: true },
          });
          currentId = parent?.parentId ?? null;
        }
      }
      updateData.parentId = data.parentId || null;
    }

    const folder = await db.noteFolder.update({
      where: { id },
      data: updateData,
      include: {
        parent: { select: { id: true, name: true, parentId: true } },
        _count: { select: { children: true, notes: true } },
      },
    });

    return { ok: true, data: parseJsonFields(folder, "folder") };
  },

  async deleteFolder(userId: string, id: string): Promise<ServiceResult<{ success: boolean }>> {
    const existing = await db.noteFolder.findFirst({ where: { id } });

    if (!existing) {
      return { ok: false, status: 404, error: "Not found or access denied" };
    }

    if (!canWriteEntity(userId, existing.ownerId)) {
      return { ok: false, status: 404, error: "Not found or access denied" };
    }

    await db.noteFolder.delete({ where: { id } });

    return { ok: true, data: { success: true } };
  },
};
