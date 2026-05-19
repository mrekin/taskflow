import { db } from "@/lib/db";
import { buildVisibilityWhereClause } from "@/lib/visibility";
import type { ServiceResult } from "./types";

export interface CreateTagData {
  name: string;
  color?: string;
}

export interface UpdateTagData {
  name?: string;
  color?: string;
}

export const TagService = {
  async listTags(userId: string | null) {
    const isAuthenticated = !!userId;
    if (!isAuthenticated) return [];

    const ownTags = await db.tag.findMany({
      where: { ownerId: userId },
    });

    const visibleProjects = await db.project.findMany({
      where: buildVisibilityWhereClause(userId, isAuthenticated),
      select: { tagIds: true },
    });
    const visibleAreas = await db.area.findMany({
      where: buildVisibilityWhereClause(userId, isAuthenticated),
      select: { tagIds: true },
    });
    const visibleTasks = await db.task.findMany({
      where: buildVisibilityWhereClause(userId, isAuthenticated),
      select: { tagIds: true },
    });
    const visibleNotes = await db.note.findMany({
      where: buildVisibilityWhereClause(userId, isAuthenticated),
      select: { tagIds: true },
    });

    const tagIdSet = new Set(ownTags.map((t) => t.id));
    for (const entity of [...visibleProjects, ...visibleAreas, ...visibleTasks, ...visibleNotes]) {
      try {
        const ids: string[] = JSON.parse(entity.tagIds || "[]");
        for (const id of ids) {
          if (typeof id === "string") tagIdSet.add(id);
        }
      } catch {
        // ignore parse errors
      }
    }

    const tags = tagIdSet.size > 0
      ? await db.tag.findMany({
          where: { id: { in: [...tagIdSet] } },
          orderBy: { name: "asc" },
        })
      : [];

    return tags;
  },

  async createTag(userId: string, data: CreateTagData): Promise<ServiceResult<Record<string, unknown>>> {
    if (!data.name || typeof data.name !== "string" || data.name.trim() === "") {
      return { ok: false, status: 400, error: "Name is required" };
    }

    const existing = await db.tag.findFirst({
      where: { name: data.name.trim(), ownerId: userId },
    });

    if (existing) {
      return { ok: false, status: 409, error: "A tag with this name already exists" };
    }

    const tag = await db.tag.create({
      data: {
        name: data.name.trim(),
        color: data.color ?? "#6366f1",
        ownerId: userId,
      },
    });

    return { ok: true, data: tag };
  },

  async updateTag(userId: string, id: string, data: UpdateTagData): Promise<ServiceResult<Record<string, unknown>>> {
    const existing = await db.tag.findFirst({ where: { id, ownerId: userId } });
    if (!existing) {
      return { ok: false, status: 404, error: "Not found or access denied" };
    }

    if (data.name !== undefined && data.name.trim() !== existing.name) {
      const duplicate = await db.tag.findFirst({
        where: { name: data.name.trim(), ownerId: userId },
      });
      if (duplicate) {
        return { ok: false, status: 409, error: "A tag with this name already exists" };
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.color !== undefined) updateData.color = data.color;

    const tag = await db.tag.update({
      where: { id },
      data: updateData,
    });

    return { ok: true, data: tag };
  },

  async deleteTag(userId: string, id: string): Promise<ServiceResult<{ success: boolean }>> {
    const existing = await db.tag.findFirst({ where: { id, ownerId: userId } });
    if (!existing) {
      return { ok: false, status: 404, error: "Not found or access denied" };
    }

    await db.tag.delete({ where: { id } });

    const tagId = id;

    const areas = await db.area.findMany({ where: { ownerId: userId } });
    for (const area of areas) {
      const ids: string[] = JSON.parse(area.tagIds || "[]");
      if (ids.includes(tagId)) {
        await db.area.update({
          where: { id: area.id },
          data: { tagIds: JSON.stringify(ids.filter((i) => i !== tagId)) },
        });
      }
    }

    const projects = await db.project.findMany({ where: { ownerId: userId } });
    for (const project of projects) {
      const ids: string[] = JSON.parse(project.tagIds || "[]");
      if (ids.includes(tagId)) {
        await db.project.update({
          where: { id: project.id },
          data: { tagIds: JSON.stringify(ids.filter((i) => i !== tagId)) },
        });
      }
    }

    const tasks = await db.task.findMany({ where: { ownerId: userId } });
    for (const task of tasks) {
      const ids: string[] = JSON.parse(task.tagIds || "[]");
      if (ids.includes(tagId)) {
        await db.task.update({
          where: { id: task.id },
          data: { tagIds: JSON.stringify(ids.filter((i) => i !== tagId)) },
        });
      }
    }

    const notes = await db.note.findMany({ where: { ownerId: userId } });
    for (const note of notes) {
      const ids: string[] = JSON.parse(note.tagIds || "[]");
      if (ids.includes(tagId)) {
        await db.note.update({
          where: { id: note.id },
          data: { tagIds: JSON.stringify(ids.filter((i) => i !== tagId)) },
        });
      }
    }

    return { ok: true, data: { success: true } };
  },
};
