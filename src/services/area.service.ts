import { db } from "@/lib/db";
import { parseJsonFields, getNextShortIdNum } from "@/lib/api-utils";
import {
  buildVisibilityWhereClause,
  resolveEffectiveVisibility,
  canReadEntity,
  canWriteEntity,
  parseVisibleUserIds,
} from "@/lib/visibility";
import type { ServiceResult } from "./types";

export interface CreateAreaData {
  name: string;
  description?: string | null;
  color?: string;
  icon?: string | null;
  metadata?: Record<string, unknown>;
  tagIds?: string[];
  visibility?: string | null;
  visibleUserIds?: string[];
}

export interface UpdateAreaData {
  name?: string;
  description?: string | null;
  color?: string;
  icon?: string | null;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
  tagIds?: string[];
  visibility?: string | null;
  visibleUserIds?: string[];
}

export const AreaService = {
  async listAreas(userId: string | null) {
    const isAuthenticated = !!userId;
    if (!isAuthenticated) return [];

    const areas = await db.area.findMany({
      where: buildVisibilityWhereClause(userId, isAuthenticated),
      orderBy: { sortOrder: "asc" },
      include: {
        _count: { select: { projects: true } },
      },
    });

    return areas
      .filter((area) => {
        const effectiveVis = resolveEffectiveVisibility(area.visibility, []);
        const visibleUserIds = parseVisibleUserIds(area.visibleUserIds);
        return canReadEntity(userId!, area.ownerId, effectiveVis, visibleUserIds, isAuthenticated);
      })
      .map((area) => ({
        ...parseJsonFields(area, "area"),
        _count: { projects: area._count.projects },
      }));
  },

  async getArea(userId: string | null, id: string): Promise<ServiceResult<Record<string, unknown>>> {
    const isAuthenticated = !!userId;
    if (!isAuthenticated) return { ok: false, status: 401, error: "Authentication required" };

    const area = await db.area.findFirst({
      where: { id },
      include: {
        projects: {
          orderBy: { sortOrder: "asc" },
          include: {
            _count: { select: { tasks: true } },
          },
        },
      },
    });

    if (!area) {
      return { ok: false, status: 404, error: "Area not found" };
    }

    const effectiveVis = resolveEffectiveVisibility(area.visibility, []);
    const visibleUserIds = parseVisibleUserIds(area.visibleUserIds);
    if (!canReadEntity(userId!, area.ownerId, effectiveVis, visibleUserIds, isAuthenticated)) {
      return { ok: false, status: 404, error: "Area not found" };
    }

    const filteredProjects = area.projects.filter((project) => {
      const projEffectiveVis = resolveEffectiveVisibility(project.visibility, [{ visibility: area.visibility, ownerId: area.ownerId }]);
      const projVisibleUserIds = parseVisibleUserIds(project.visibleUserIds);
      return canReadEntity(userId!, project.ownerId, projEffectiveVis, projVisibleUserIds, isAuthenticated);
    });

    const result = {
      ...parseJsonFields(area, "area"),
      _count: { projects: filteredProjects.length },
      projects: filteredProjects.map((project) => ({
        ...parseJsonFields(project, "project"),
        _count: { tasks: project._count.tasks },
      })),
    };

    return { ok: true, data: result };
  },

  async createArea(userId: string, data: CreateAreaData): Promise<ServiceResult<Record<string, unknown>>> {
    if (!data.name || typeof data.name !== "string" || data.name.trim() === "") {
      return { ok: false, status: 400, error: "Name is required" };
    }

    const maxSortArea = await db.area.findFirst({
      where: { ownerId: userId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const shortIdNum = await getNextShortIdNum(db.area, userId);

    const area = await db.area.create({
      data: {
        name: data.name.trim(),
        description: data.description ?? null,
        color: data.color ?? "#6366f1",
        icon: data.icon ?? null,
        metadata: data.metadata ? JSON.stringify(data.metadata) : "{}",
        tagIds: data.tagIds ? JSON.stringify(data.tagIds) : "[]",
        visibility: data.visibility ?? null,
        visibleUserIds: JSON.stringify(data.visibleUserIds || []),
        shortIdNum,
        ownerId: userId,
        sortOrder: (maxSortArea?.sortOrder ?? -1) + 1,
      },
    });

    return {
      ok: true,
      data: { ...parseJsonFields(area, "area"), _count: { projects: 0 } },
    };
  },

  async updateArea(userId: string, id: string, data: UpdateAreaData): Promise<ServiceResult<Record<string, unknown>>> {
    const existing = await db.area.findFirst({ where: { id } });
    if (!existing || !canWriteEntity(userId, existing.ownerId)) {
      return { ok: false, status: 404, error: "Not found or access denied" };
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.description !== undefined) updateData.description = data.description;
    if (data.color !== undefined) updateData.color = data.color;
    if (data.icon !== undefined) updateData.icon = data.icon;
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
    if (data.metadata !== undefined) updateData.metadata = JSON.stringify(data.metadata);
    if (data.tagIds !== undefined) updateData.tagIds = JSON.stringify(data.tagIds);
    if (data.visibility !== undefined) updateData.visibility = data.visibility;
    if (data.visibleUserIds !== undefined) updateData.visibleUserIds = JSON.stringify(data.visibleUserIds);

    const area = await db.area.update({
      where: { id },
      data: updateData,
      include: {
        _count: { select: { projects: true } },
      },
    });

    return {
      ok: true,
      data: {
        ...parseJsonFields(area, "area"),
        _count: { projects: area._count.projects },
      },
    };
  },

  async deleteArea(userId: string, id: string): Promise<ServiceResult<{ success: boolean }>> {
    const existing = await db.area.findFirst({ where: { id } });
    if (!existing || !canWriteEntity(userId, existing.ownerId)) {
      return { ok: false, status: 404, error: "Not found or access denied" };
    }

    await db.area.delete({ where: { id } });

    return { ok: true, data: { success: true } };
  },
};
