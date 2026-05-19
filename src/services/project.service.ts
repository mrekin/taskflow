import { db } from "@/lib/db";
import { parseJsonFields, getNextShortIdNum } from "@/lib/api-utils";
import { fireWebhookEvent, buildProjectContext, computeChanges } from "@/lib/webhook-engine";
import {
  buildVisibilityWhereClause,
  resolveEffectiveVisibility,
  canReadEntity,
  canWriteEntity,
  parseVisibleUserIds,
  sanitizeRelation,
  sanitizeUserProfile,
} from "@/lib/visibility";
import type { ServiceResult } from "./types";

export interface CreateProjectData {
  name: string;
  description?: string | null;
  color?: string;
  icon?: string | null;
  areaId?: string | null;
  status?: string;
  metadata?: Record<string, unknown>;
  tagIds?: string[];
  visibility?: string | null;
  visibleUserIds?: string[];
}

export interface UpdateProjectData {
  name?: string;
  description?: string | null;
  color?: string;
  icon?: string | null;
  status?: string;
  areaId?: string | null;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
  tagIds?: string[];
  visibility?: string | null;
  visibleUserIds?: string[];
}

export const ProjectService = {
  async listProjects(userId: string | null, areaId?: string) {
    const isAuthenticated = !!userId;

    const projects = await db.project.findMany({
      where: {
        ...buildVisibilityWhereClause(userId, isAuthenticated),
        ...(areaId ? { areaId } : {}),
      },
      orderBy: { sortOrder: "asc" },
      include: {
        _count: { select: { tasks: true, notes: true } },
        area: { select: { id: true, name: true, color: true } },
      },
    });

    const projectIds = projects.map((p) => p.id);
    const topLevelTaskCounts = projectIds.length > 0 ? await db.task.groupBy({
      by: ["projectId"],
      where: {
        ...buildVisibilityWhereClause(userId, isAuthenticated),
        projectId: { in: projectIds },
        parentId: null,
      },
      _count: true,
    }) : [];
    const topLevelMap = new Map(
      topLevelTaskCounts.map((r) => [r.projectId, r._count])
    );

    return projects.map((project) => ({
      ...parseJsonFields(project, "project"),
      _count: {
        tasks: project._count.tasks,
        topLevelTasks: topLevelMap.get(project.id) ?? 0,
        notes: project._count.notes,
      },
    }));
  },

  async getProject(userId: string | null, id: string): Promise<ServiceResult<Record<string, unknown>>> {
    const isAuthenticated = !!userId;

    const project = await db.project.findFirst({
      where: { id },
      include: {
        tasks: {
          orderBy: { sortOrder: "asc" },
          include: {
            _count: { select: { subtasks: true } },
            subtasks: { select: { id: true, title: true, status: true, shortIdNum: true } },
            assignee: { select: { id: true, name: true, email: true, image: true, metadata: true } },
          },
        },
        notes: {
          orderBy: { updatedAt: "desc" },
        },
        area: { select: { id: true, name: true, color: true, visibility: true, ownerId: true, visibleUserIds: true } },
      },
    });

    if (!project) {
      return { ok: false, status: 404, error: "Project not found" };
    }

    const parentChain = project.areaId && project.area
      ? [{ visibility: project.area.visibility, ownerId: project.area.ownerId }]
      : [];
    const effectiveVis = resolveEffectiveVisibility(project.visibility, parentChain);
    const parsedUserIds = parseVisibleUserIds(project.visibleUserIds);

    if (!canReadEntity(userId, project.ownerId, effectiveVis, parsedUserIds, isAuthenticated)) {
      return { ok: false, status: 404, error: "Project not found" };
    }

    const sanitizedArea = sanitizeRelation(
      project.area,
      project.area?.ownerId ?? "",
      userId,
      isAuthenticated,
      [],
    );

    const { tasks, notes, area: _area, ...rest } = project;
    const result = {
      ...parseJsonFields(rest, "project"),
      area: sanitizedArea,
      _count: { tasks: tasks.length, notes: notes.length },
      tasks: tasks.map((task) => {
        const { subtasks, ...taskRest } = task;
        return {
          ...parseJsonFields(taskRest, "task"),
          assignee: task.assignee ? sanitizeUserProfile(task.assignee) : null,
          _count: { subtasks: task._count.subtasks },
          completedSubtasks: subtasks.filter((s) => s.status === "done").length,
        };
      }),
      notes: notes.map((note) => parseJsonFields(note, "note")),
    };

    return { ok: true, data: result };
  },

  async createProject(userId: string, data: CreateProjectData): Promise<ServiceResult<Record<string, unknown>>> {
    if (!data.name || typeof data.name !== "string" || data.name.trim() === "") {
      return { ok: false, status: 400, error: "Name is required" };
    }

    const maxSortProject = await db.project.findFirst({
      where: { ownerId: userId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const shortIdNum = await getNextShortIdNum(db.project, userId);

    const project = await db.project.create({
      data: {
        name: data.name.trim(),
        description: data.description ?? null,
        color: data.color ?? "#8b5cf6",
        icon: data.icon ?? null,
        status: data.status ?? "active",
        areaId: data.areaId ?? null,
        metadata: data.metadata ? JSON.stringify(data.metadata) : "{}",
        tagIds: data.tagIds ? JSON.stringify(data.tagIds) : "[]",
        visibility: data.visibility ?? null,
        visibleUserIds: JSON.stringify(data.visibleUserIds || []),
        shortIdNum,
        ownerId: userId,
        sortOrder: (maxSortProject?.sortOrder ?? -1) + 1,
      },
      include: {
        area: { select: { id: true, name: true, color: true } },
      },
    });

    try {
      fireWebhookEvent(buildProjectContext(
        { id: project.id, name: project.name, shortIdNum: project.shortIdNum, areaId: project.areaId, ownerId: project.ownerId },
        'project.created'
      ));
    } catch (webhookError) {
      console.error('[Webhook] Error in project create webhook:', webhookError);
    }

    return {
      ok: true,
      data: { ...parseJsonFields(project, "project"), _count: { tasks: 0, notes: 0 } },
    };
  },

  async updateProject(userId: string, id: string, data: UpdateProjectData): Promise<ServiceResult<Record<string, unknown>>> {
    const existing = await db.project.findFirst({ where: { id } });
    if (!existing) {
      return { ok: false, status: 404, error: "Not found or access denied" };
    }

    if (!canWriteEntity(userId, existing.ownerId)) {
      return { ok: false, status: 404, error: "Not found or access denied" };
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.description !== undefined) updateData.description = data.description;
    if (data.color !== undefined) updateData.color = data.color;
    if (data.icon !== undefined) updateData.icon = data.icon;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.areaId !== undefined) updateData.areaId = data.areaId;
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
    if (data.metadata !== undefined) updateData.metadata = JSON.stringify(data.metadata);
    if (data.tagIds !== undefined) updateData.tagIds = JSON.stringify(data.tagIds);
    if (data.visibility !== undefined) updateData.visibility = data.visibility;
    if (data.visibleUserIds !== undefined) updateData.visibleUserIds = JSON.stringify(data.visibleUserIds);

    const project = await db.project.update({
      where: { id },
      data: updateData,
      include: {
        area: { select: { id: true, name: true, color: true } },
        _count: { select: { tasks: true, notes: true } },
      },
    });

    try {
      const changes = computeChanges(
        existing as unknown as Record<string, unknown>,
        updateData,
        ['status']
      );

      if (changes.status) {
        await fireWebhookEvent(buildProjectContext(
          { id: project.id, name: project.name, shortIdNum: project.shortIdNum, areaId: project.areaId, ownerId: project.ownerId },
          'project.status_changed',
          changes
        ));
      }
    } catch (webhookError) {
      console.error('[Webhook] Error in project update webhook:', webhookError);
    }

    return {
      ok: true,
      data: {
        ...parseJsonFields(project, "project"),
        _count: { tasks: project._count.tasks, notes: project._count.notes },
      },
    };
  },

  async deleteProject(userId: string, id: string): Promise<ServiceResult<{ success: boolean }>> {
    const existing = await db.project.findFirst({ where: { id } });
    if (!existing) {
      return { ok: false, status: 404, error: "Not found or access denied" };
    }

    if (!canWriteEntity(userId, existing.ownerId)) {
      return { ok: false, status: 404, error: "Not found or access denied" };
    }

    await db.project.delete({ where: { id } });

    return { ok: true, data: { success: true } };
  },
};
