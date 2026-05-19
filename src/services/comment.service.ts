import { db } from "@/lib/db";
import {
  canReadEntity,
  canDeleteComment,
  resolveEffectiveVisibility,
  parseVisibleUserIds,
  sanitizeUserProfile,
} from "@/lib/visibility";
import { cleanupAttachments } from "@/lib/attachment-cleanup";
import type { ServiceResult } from "./types";

export interface CreateCommentData {
  content: string;
  taskId: string;
  parentId?: string | null;
}

export const CommentService = {
  async listComments(userId: string | null, taskId: string): Promise<ServiceResult<Record<string, unknown>[]>> {
    if (!userId) return { ok: true, data: [] };

    const task = await db.task.findFirst({
      where: { id: taskId },
      select: { id: true, ownerId: true, visibility: true, visibleUserIds: true, projectId: true },
    });

    if (!task) {
      return { ok: true, data: [] };
    }

    const parentChain: Array<{ visibility: string | null; ownerId: string }> = [];

    if (task.projectId) {
      const project = await db.project.findFirst({
        where: { id: task.projectId },
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

    const effectiveVisibility = resolveEffectiveVisibility(task.visibility, parentChain);
    const taskVisibleUserIds = parseVisibleUserIds(task.visibleUserIds);

    if (!canReadEntity(userId, task.ownerId, effectiveVisibility, taskVisibleUserIds, !!userId)) {
      return { ok: true, data: [] };
    }

    const comments = await db.comment.findMany({
      where: { taskId },
      orderBy: { createdAt: "asc" },
      include: {
        owner: { select: { id: true, name: true, email: true, image: true, metadata: true } },
      },
    });

    const sanitized = comments.map((c) => ({
      ...c,
      owner: sanitizeUserProfile(c.owner) ?? { id: c.owner.id, name: null, image: null },
    }));

    return { ok: true, data: sanitized };
  },

  async createComment(userId: string, data: CreateCommentData): Promise<ServiceResult<Record<string, unknown>>> {
    if (!data.content || typeof data.content !== "string" || data.content.trim() === "") {
      return { ok: false, status: 400, error: "Content is required" };
    }

    if (!data.taskId || typeof data.taskId !== "string" || data.taskId.trim() === "") {
      return { ok: false, status: 400, error: "taskId is required" };
    }

    const task = await db.task.findFirst({
      where: { id: data.taskId },
      select: { id: true, ownerId: true, visibility: true, visibleUserIds: true, projectId: true },
    });

    if (!task) {
      return { ok: false, status: 404, error: "Task not found" };
    }

    const parentChain: Array<{ visibility: string | null; ownerId: string }> = [];

    if (task.projectId) {
      const project = await db.project.findFirst({
        where: { id: task.projectId },
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

    const effectiveVisibility = resolveEffectiveVisibility(task.visibility, parentChain);
    const taskVisibleUserIds = parseVisibleUserIds(task.visibleUserIds);

    if (!canReadEntity(userId, task.ownerId, effectiveVisibility, taskVisibleUserIds, !!userId)) {
      return { ok: false, status: 404, error: "Task not found" };
    }

    const comment = await db.comment.create({
      data: {
        content: data.content.trim(),
        taskId: data.taskId,
        ownerId: userId,
        parentId: data.parentId || null,
      },
      include: {
        owner: { select: { id: true, name: true, email: true, image: true, metadata: true } },
      },
    });

    return {
      ok: true,
      data: {
        ...comment,
        owner: sanitizeUserProfile(comment.owner) ?? { id: comment.owner.id, name: null, image: null },
      },
    };
  },

  async updateComment(userId: string, id: string, content: string): Promise<ServiceResult<Record<string, unknown>>> {
    if (!content || typeof content !== "string" || content.trim() === "") {
      return { ok: false, status: 400, error: "Content is required" };
    }

    const existing = await db.comment.findFirst({ where: { id } });
    if (!existing) {
      return { ok: false, status: 404, error: "Not found or access denied" };
    }

    const task = await db.task.findFirst({
      where: { id: existing.taskId },
      select: { ownerId: true },
    });

    const isCommentAuthor = existing.ownerId === userId;
    const isTaskOwner = task?.ownerId === userId;

    if (!isCommentAuthor && !isTaskOwner) {
      return { ok: false, status: 404, error: "Not found or access denied" };
    }

    const comment = await db.comment.update({
      where: { id },
      data: { content: content.trim() },
      include: {
        owner: { select: { id: true, name: true, email: true, image: true, metadata: true } },
      },
    });

    return {
      ok: true,
      data: {
        ...comment,
        owner: sanitizeUserProfile(comment.owner) ?? { id: comment.owner.id, name: null, image: null },
      },
    };
  },

  async deleteComment(userId: string, id: string): Promise<ServiceResult<Record<string, unknown>>> {
    const existing = await db.comment.findFirst({ where: { id } });
    if (!existing) {
      return { ok: false, status: 404, error: "Not found or access denied" };
    }

    const task = await db.task.findFirst({
      where: { id: existing.taskId },
      select: { ownerId: true },
    });

    if (!canDeleteComment(userId, existing.ownerId, task?.ownerId ?? "")) {
      return { ok: false, status: 404, error: "Not found or access denied" };
    }

    const replyCount = await db.comment.count({
      where: { parentId: id },
    });

    if (replyCount > 0) {
      const comment = await db.comment.update({
        where: { id },
        data: { deleted: true, content: "" },
        include: {
          owner: { select: { id: true, name: true, email: true, image: true, metadata: true } },
        },
      });

      return {
        ok: true,
        data: {
          ...comment,
          owner: sanitizeUserProfile(comment.owner) ?? { id: comment.owner.id, name: null, image: null },
        },
      };
    }

    await cleanupAttachments([{ id, type: 'comment' }]);
    await db.comment.delete({ where: { id } });

    return { ok: true, data: { success: true, deleted: true } };
  },
};
