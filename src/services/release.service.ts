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
import { RELEASE_STATUSES } from "@/lib/constants";
import type { ServiceResult } from "./types";

export interface ListReleasesFilters {
  projectId?: string;
  updatedSince?: Date;
}

export interface CreateReleaseData {
  title: string;
  description?: string | null;
  version?: string | null;
  status?: string;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  actualReleaseDate?: string | null;
  projectId: string;
  metadata?: Record<string, unknown>;
  tagIds?: string[];
  visibility?: string | null;
  visibleUserIds?: string[];
}

export interface UpdateReleaseData {
  title?: string;
  description?: string | null;
  version?: string | null;
  status?: string;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  actualReleaseDate?: string | null;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
  tagIds?: string[];
  visibility?: string | null;
  visibleUserIds?: string[];
}

function isValidReleaseStatus(status: string): boolean {
  return (RELEASE_STATUSES as readonly string[]).includes(status);
}

export const ReleaseService = {
  async listReleases(userId: string | null, filters: ListReleasesFilters = {}) {
    const isAuthenticated = !!userId;

    const releases = await db.release.findMany({
      where: {
        ...(await buildVisibilityWhereClause(userId, isAuthenticated)),
        ...(filters.projectId ? { projectId: filters.projectId } : {}),
        ...(filters.updatedSince ? { updatedAt: { gt: filters.updatedSince } } : {}),
      },
      orderBy: { sortOrder: "asc" },
      include: {
        _count: { select: { tasks: true, notes: true, folders: true } },
        project: { select: { id: true, name: true, color: true } },
      },
    });

    return releases.map((release) => ({
      ...parseJsonFields(release, "release"),
    }));
  },

  async getRelease(userId: string | null, id: string): Promise<ServiceResult<Record<string, unknown>>> {
    const isAuthenticated = !!userId;

    const release = await db.release.findFirst({
      where: { id },
      include: {
        _count: { select: { tasks: true, notes: true, folders: true } },
        project: { select: { id: true, name: true, color: true, visibility: true, ownerId: true } },
      },
    });

    if (!release) {
      return { ok: false, status: 404, error: "Release not found" };
    }

    // Visibility falls back up the parent chain: release → project
    const parentChain = release.project
      ? [{ visibility: release.project.visibility, ownerId: release.project.ownerId }]
      : [];
    const effectiveVis = resolveEffectiveVisibility(release.visibility, parentChain);
    const parsedUserIds = parseVisibleUserIds(release.visibleUserIds);

    if (!canReadEntity(userId, release.ownerId, effectiveVis, parsedUserIds, isAuthenticated)) {
      return { ok: false, status: 404, error: "Release not found" };
    }

    const sanitizedProject = sanitizeRelation(
      release.project,
      release.project?.ownerId ?? "",
      userId,
      isAuthenticated,
      [],
    );

    const { project: _project, ...rest } = release;
    const result = {
      ...parseJsonFields(rest, "release"),
      project: sanitizedProject,
    };

    return { ok: true, data: result };
  },

  async createRelease(userId: string, data: CreateReleaseData): Promise<ServiceResult<Record<string, unknown>>> {
    if (!data.title || typeof data.title !== "string" || data.title.trim() === "") {
      return { ok: false, status: 400, error: "Title is required" };
    }
    if (!data.projectId || typeof data.projectId !== "string") {
      return { ok: false, status: 400, error: "Project is required" };
    }
    const project = await db.project.findFirst({ where: { id: data.projectId } });
    if (!project) {
      return { ok: false, status: 404, error: "Project not found" };
    }
    if (data.status !== undefined && !isValidReleaseStatus(data.status)) {
      return { ok: false, status: 400, error: `Invalid status: "${data.status}"` };
    }

    const maxSortRelease = await db.release.findFirst({
      where: { ownerId: userId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const shortIdNum = await getNextShortIdNum(db.release, userId);

    const release = await db.release.create({
      data: {
        title: data.title.trim(),
        description: data.description ?? null,
        version: data.version ?? null,
        status: data.status ?? "planned",
        plannedStartDate: data.plannedStartDate ? new Date(data.plannedStartDate) : null,
        plannedEndDate: data.plannedEndDate ? new Date(data.plannedEndDate) : null,
        actualReleaseDate: data.actualReleaseDate ? new Date(data.actualReleaseDate) : null,
        projectId: data.projectId,
        metadata: data.metadata ? JSON.stringify(data.metadata) : "{}",
        tagIds: data.tagIds ? JSON.stringify(data.tagIds) : "[]",
        visibility: data.visibility ?? null,
        visibleUserIds: JSON.stringify(data.visibleUserIds || []),
        shortIdNum,
        ownerId: userId,
        sortOrder: (maxSortRelease?.sortOrder ?? -1) + 1,
      },
      include: {
        project: { select: { id: true, name: true, color: true } },
      },
    });

    return {
      ok: true,
      data: {
        ...parseJsonFields(release, "release"),
        _count: { tasks: 0, notes: 0, folders: 0 },
      },
    };
  },

  async updateRelease(userId: string, id: string, data: UpdateReleaseData): Promise<ServiceResult<Record<string, unknown>>> {
    const existing = await db.release.findFirst({ where: { id } });
    if (!existing) {
      return { ok: false, status: 404, error: "Not found or access denied" };
    }

    if (!canWriteEntity(userId, existing.ownerId)) {
      return { ok: false, status: 404, error: "Not found or access denied" };
    }

    if (data.status !== undefined && !isValidReleaseStatus(data.status)) {
      return { ok: false, status: 400, error: `Invalid status: "${data.status}"` };
    }

    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData.title = data.title.trim();
    if (data.description !== undefined) updateData.description = data.description;
    if (data.version !== undefined) updateData.version = data.version;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.plannedStartDate !== undefined) updateData.plannedStartDate = data.plannedStartDate ? new Date(data.plannedStartDate) : null;
    if (data.plannedEndDate !== undefined) updateData.plannedEndDate = data.plannedEndDate ? new Date(data.plannedEndDate) : null;
    if (data.actualReleaseDate !== undefined) updateData.actualReleaseDate = data.actualReleaseDate ? new Date(data.actualReleaseDate) : null;
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
    if (data.metadata !== undefined) updateData.metadata = JSON.stringify(data.metadata);
    if (data.tagIds !== undefined) updateData.tagIds = JSON.stringify(data.tagIds);
    if (data.visibility !== undefined) updateData.visibility = data.visibility;
    if (data.visibleUserIds !== undefined) updateData.visibleUserIds = JSON.stringify(data.visibleUserIds);

    const release = await db.release.update({
      where: { id },
      data: updateData,
      include: {
        _count: { select: { tasks: true, notes: true, folders: true } },
        project: { select: { id: true, name: true, color: true } },
      },
    });

    return {
      ok: true,
      data: {
        ...parseJsonFields(release, "release"),
        _count: {
          tasks: release._count.tasks,
          notes: release._count.notes,
          folders: release._count.folders,
        },
      },
    };
  },

  async deleteRelease(userId: string, id: string): Promise<ServiceResult<{ success: boolean }>> {
    const existing = await db.release.findFirst({ where: { id } });
    if (!existing) {
      return { ok: false, status: 404, error: "Not found or access denied" };
    }

    if (!canWriteEntity(userId, existing.ownerId)) {
      return { ok: false, status: 404, error: "Not found or access denied" };
    }

    // Linked tasks/notes/folders keep existing — releaseId is nullified (SetNull)
    await db.release.delete({ where: { id } });

    return { ok: true, data: { success: true } };
  },
};
