import { db } from "@/lib/db";
import { parseJsonFields, getNextShortIdNum } from "@/lib/api-utils";
import { fireWebhookEvent, buildTaskContext, resolveTaskAreaId, computeChanges } from "@/lib/webhook-engine";
import { createScheduledJob, deleteScheduledJobsForEntity } from "@/lib/scheduler";
import {
  buildVisibilityWhereClause,
  resolveEffectiveVisibility,
  canReadEntity,
  canWriteEntity,
  parseVisibleUserIds,
  sanitizeRelation,
  sanitizeUserProfile,
} from "@/lib/visibility";
import { cleanupAttachments } from "@/lib/attachment-cleanup";
import type { ServiceResult } from "./types";
import type { TaskPrice } from "@/lib/types";
import { summarize } from "@/lib/prices";

export interface ListTasksFilters {
  projectId?: string;
  status?: string;
  parentId?: string;
  search?: string;
  assigneeId?: string;
}

export interface CreateTaskData {
  title: string;
  description?: string | null;
  status?: string;
  priority?: string;
  dueDate?: string | null;
  projectId?: string | null;
  parentId?: string | null;
  assigneeId?: string | null;
  metadata?: Record<string, unknown>;
  tagIds?: string[];
  visibility?: string | null;
  visibleUserIds?: string[];
  prices?: TaskPrice[];
  currency?: string;
}

export interface UpdateTaskData {
  title?: string;
  description?: string | null;
  status?: string;
  priority?: string;
  dueDate?: string | null;
  projectId?: string | null;
  parentId?: string | null;
  assigneeId?: string | null;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
  tagIds?: string[];
  visibility?: string | null;
  visibleUserIds?: string[];
  prices?: TaskPrice[];
  currency?: string;
}

function extractPricesFromMetadata(metadata: Record<string, unknown>): TaskPrice[] {
  if (!Array.isArray(metadata.prices)) return [];
  return metadata.prices as TaskPrice[];
}

function extractCurrencyFromMetadata(metadata: Record<string, unknown>): string | undefined {
  return typeof metadata.currency === 'string' ? metadata.currency : undefined;
}

export const TaskService = {
  async listTasks(userId: string, filters: ListTasksFilters) {
    const isAuthenticated = !!userId;
    const visibilityClause = buildVisibilityWhereClause(userId, isAuthenticated);
    const filterWhere: Record<string, unknown> = {
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
    };

    let where: Record<string, unknown>;

    if (filters.search) {
      const shortIdMatch = filters.search.match(/^T-(\d+)$/i);
      const shortIdNum = shortIdMatch ? parseInt(shortIdMatch[1], 10) : null;

      const dateMatch = filters.search.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      const dateStart = dateMatch
        ? new Date(`${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}T00:00:00.000Z`)
        : null;
      const dateEnd = dateStart ? new Date(dateStart.getTime() + 86400000) : null;

      const taskConditions: Record<string, unknown>[] = [
        { title: { contains: filters.search } },
        { description: { contains: filters.search } },
        { comments: { some: { content: { contains: filters.search } } } },
      ];

      if (shortIdNum !== null) {
        taskConditions.push({ shortIdNum });
      }

      if (dateStart && dateEnd) {
        taskConditions.push({ dueDate: { gte: dateStart, lt: dateEnd } });
        taskConditions.push({ createdAt: { gte: dateStart, lt: dateEnd } });
        taskConditions.push({ updatedAt: { gte: dateStart, lt: dateEnd } });
      }

      const subtaskConditions: Record<string, unknown>[] = [
        { title: { contains: filters.search } },
        { description: { contains: filters.search } },
      ];

      if (shortIdNum !== null) {
        subtaskConditions.push({ shortIdNum });
      }

      taskConditions.push({ subtasks: { some: { OR: subtaskConditions } } });
      taskConditions.push({ assignee: { OR: [{ name: { contains: filters.search } }, { email: { contains: filters.search } }] } });

      where = {
        AND: [
          visibilityClause,
          filterWhere,
          { parentId: null },
          { OR: taskConditions },
        ],
      };
    } else {
      where = {
        AND: [
          visibilityClause,
          filterWhere,
          ...(filters.parentId !== undefined ? [{ parentId: filters.parentId || null }] : []),
        ],
      };
    }

    const tasks = await db.task.findMany({
      where,
      orderBy: { sortOrder: "asc" },
      include: {
        _count: { select: { subtasks: true } },
        subtasks: { select: { id: true, title: true, status: true, priority: true, parentId: true, shortIdNum: true, assigneeId: true, ownerId: true, metadata: true, assignee: { select: { id: true, name: true, email: true, image: true, metadata: true } } } },
        assignee: { select: { id: true, name: true, email: true, image: true, metadata: true } },
        project: { select: { id: true, name: true, color: true } },
      },
    });

    const taskIds = tasks.map(t => t.id);
    const attachmentCounts = await db.attachment.groupBy({
      by: ['entityId'],
      where: { entityId: { in: taskIds }, entityType: 'task' },
      _count: { id: true },
    });
    const attachmentCountMap = new Map(attachmentCounts.map(a => [a.entityId, a._count.id]));

    return tasks.map((task) => {
      const { subtasks, ...rest } = task;
      const parsed = parseJsonFields(rest, "task");
      const prices = extractPricesFromMetadata(parsed.metadata as Record<string, unknown>);
      const currency = extractCurrencyFromMetadata(parsed.metadata as Record<string, unknown>);
      const subtaskPrices = subtasks.flatMap((s) => {
        try {
          const sMeta = JSON.parse((s as Record<string, unknown>).metadata as string || '{}');
          return extractPricesFromMetadata(sMeta);
        } catch { return []; }
      });
      const allPrices = [...prices, ...subtaskPrices];
      // Fallback: if task has no currency but subtasks with prices do, inherit from subtask
      const resolvedCurrency = currency || (() => {
        for (const s of subtasks) {
          try {
            const sMeta = JSON.parse((s as Record<string, unknown>).metadata as string || '{}');
            const sCurrency = extractCurrencyFromMetadata(sMeta);
            const sPrices = extractPricesFromMetadata(sMeta);
            if (sPrices.length > 0 && sCurrency) return sCurrency;
          } catch { /* skip */ }
        }
        return undefined;
      })();
      return {
        ...parsed,
        assignee: task.assignee ? sanitizeUserProfile(task.assignee) : null,
        _count: { subtasks: task._count.subtasks, attachments: attachmentCountMap.get(task.id) || 0 },
        completedSubtasks: subtasks.filter((s) => s.status === "done").length,
        prices,
        currency: resolvedCurrency,
        priceSummary: allPrices.length > 0 ? summarize(allPrices) : undefined,
        subtasks: subtasks.map((s) => {
          const sParsed = (() => {
            try {
              const sMeta = JSON.parse((s as Record<string, unknown>).metadata as string || '{}');
              const sPrices = extractPricesFromMetadata(sMeta);
              return { prices: sPrices, currency: extractCurrencyFromMetadata(sMeta) };
            } catch { return { prices: [], currency: undefined }; }
          })();
          return {
            ...s,
            shortId: `T-${s.shortIdNum}`,
            assignee: s.assignee ? sanitizeUserProfile(s.assignee) : null,
            prices: sParsed.prices,
            currency: sParsed.currency,
          };
        }),
      };
    });
  },

  async getTask(userId: string | null, id: string): Promise<ServiceResult<Record<string, unknown>>> {
    const isAuthenticated = !!userId;

    const task = await db.task.findFirst({
      where: { id },
      include: {
        subtasks: {
          orderBy: { sortOrder: "asc" },
          include: {
            _count: { select: { subtasks: true } },
            subtasks: { select: { id: true, title: true, status: true, priority: true, parentId: true, shortIdNum: true, metadata: true } },
            assignee: { select: { id: true, name: true, email: true, image: true, metadata: true } },
          },
        },
        assignee: { select: { id: true, name: true, email: true, image: true, metadata: true } },
        project: { select: { id: true, name: true, color: true } },
        parent: { select: { id: true, title: true } },
        comments: {
          orderBy: { createdAt: "asc" },
          include: {
            owner: { select: { id: true, name: true, email: true, image: true, metadata: true } },
          },
        },
      },
    });

    if (!task) {
      return { ok: false, status: 404, error: "Task not found" };
    }

    const parentChain: Array<{ visibility: string | null; ownerId: string }> = [];
    let projectOwnerId: string | null = null;
    let areaParentChain: Array<{ visibility: string | null; ownerId: string }> = [];
    let parentTaskOwnerId: string | null = null;
    let projectAreaChain: Array<{ visibility: string | null; ownerId: string }> = [];

    if (task.projectId) {
      const project = await db.project.findUnique({
        where: { id: task.projectId },
        select: { visibility: true, ownerId: true, areaId: true },
      });
      if (project) {
        projectOwnerId = project.ownerId;
        const projectEntry = { visibility: project.visibility, ownerId: project.ownerId };
        parentChain.push(projectEntry);
        projectAreaChain.push(projectEntry);
        if (project.areaId) {
          const area = await db.area.findUnique({
            where: { id: project.areaId },
            select: { visibility: true, ownerId: true },
          });
          if (area) {
            const areaEntry = { visibility: area.visibility, ownerId: area.ownerId };
            parentChain.push(areaEntry);
            projectAreaChain.push(areaEntry);
            areaParentChain.push(areaEntry);
          }
        }
      }
    }

    if (task.parentId) {
      const parentTask = await db.task.findUnique({
        where: { id: task.parentId },
        select: { visibility: true, ownerId: true },
      });
      if (parentTask) {
        parentTaskOwnerId = parentTask.ownerId;
        parentChain.push({ visibility: parentTask.visibility, ownerId: parentTask.ownerId });
      }
    }

    const effectiveVis = resolveEffectiveVisibility(task.visibility, parentChain);
    const parsedUserIds = parseVisibleUserIds(task.visibleUserIds);
    if (!canReadEntity(userId, task.ownerId, effectiveVis, parsedUserIds, isAuthenticated)) {
      return { ok: false, status: 404, error: "Task not found" };
    }

    const sanitizedProject = sanitizeRelation(
      task.project,
      projectOwnerId ?? '',
      userId,
      isAuthenticated,
      areaParentChain,
    );
    const sanitizedParent = sanitizeRelation(
      task.parent,
      parentTaskOwnerId ?? '',
      userId,
      isAuthenticated,
      projectAreaChain,
    );

    const { subtasks, comments, project, parent, ...rest } = task;
    const parsedTask = parseJsonFields(rest, "task");
    const taskPrices = extractPricesFromMetadata(parsedTask.metadata as Record<string, unknown>);
    const taskCurrency = extractCurrencyFromMetadata(parsedTask.metadata as Record<string, unknown>);

    const mappedSubtasks = subtasks.map((sub) => {
      const { subtasks: _, ...subRest } = sub;
      const subParsed = parseJsonFields(subRest, "task");
      const subPrices = extractPricesFromMetadata(subParsed.metadata as Record<string, unknown>);
      const subCurrency = extractCurrencyFromMetadata(subParsed.metadata as Record<string, unknown>);
      return {
        ...subParsed,
        assignee: sub.assignee ? sanitizeUserProfile(sub.assignee) : null,
        _count: { subtasks: sub._count.subtasks },
        completedSubtasks: sub.subtasks.filter((s) => s.status === "done").length,
        prices: subPrices,
        currency: subCurrency,
      };
    });

    const allPrices = [...taskPrices, ...mappedSubtasks.flatMap((s) => s.prices)];
    // Fallback: if task has no currency but subtasks with prices do, inherit from subtask
    const resolvedTaskCurrency = taskCurrency || mappedSubtasks.find((s) => s.prices.length > 0 && s.currency)?.currency;

    const result = {
      ...parsedTask,
      assignee: task.assignee ? sanitizeUserProfile(task.assignee) : null,
      project: sanitizedProject,
      parent: sanitizedParent,
      _count: { subtasks: subtasks.length },
      completedSubtasks: subtasks.filter((s) => s.status === "done").length,
      prices: taskPrices,
      currency: resolvedTaskCurrency,
      priceSummary: allPrices.length > 0 ? summarize(allPrices) : undefined,
      subtasks: mappedSubtasks,
      comments: comments.map((c) => ({
        ...c,
        owner: sanitizeUserProfile(c.owner) ?? { id: c.owner.id, name: null, image: null },
      })),
    };

    return { ok: true, data: result };
  },

  async createTask(userId: string, data: CreateTaskData): Promise<ServiceResult<Record<string, unknown>>> {
    if (!data.title || typeof data.title !== "string" || data.title.trim() === "") {
      return { ok: false, status: 400, error: "Title is required" };
    }

    let resolvedProjectId = data.projectId ?? null;
    let inheritedCurrency: string | undefined;
    if (data.parentId) {
      const parent = await db.task.findFirst({
        where: { id: data.parentId, ownerId: userId },
        select: { projectId: true, metadata: true },
      });
      if (!parent) {
        return { ok: false, status: 404, error: "Parent task not found" };
      }
      resolvedProjectId = parent.projectId;
      try {
        const parentMeta = JSON.parse(parent.metadata || '{}');
        inheritedCurrency = extractCurrencyFromMetadata(parentMeta);
      } catch { /* ignore */ }
    }

    const resolvedCurrency = data.currency || inheritedCurrency;
    const taskMetadata: Record<string, unknown> = {
      ...(data.metadata || {}),
      ...(data.prices ? { prices: data.prices } : {}),
      ...(resolvedCurrency ? { currency: resolvedCurrency } : {}),
    };

    const maxSortTask = await db.task.findFirst({
      where: {
        ownerId: userId,
        ...(resolvedProjectId ? { projectId: resolvedProjectId } : {}),
        ...(data.status ? { status: data.status } : {}),
      },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const shortIdNum = await getNextShortIdNum(db.task, userId);

    const task = await db.task.create({
      data: {
        title: data.title.trim(),
        description: data.description ?? null,
        status: data.status ?? "todo",
        priority: data.priority ?? "medium",
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        projectId: resolvedProjectId,
        parentId: data.parentId ?? null,
        assigneeId: data.assigneeId ?? null,
        metadata: JSON.stringify(taskMetadata),
        tagIds: data.tagIds ? JSON.stringify(data.tagIds) : "[]",
        visibility: data.visibility ?? null,
        visibleUserIds: JSON.stringify(data.visibleUserIds || []),
        shortIdNum,
        ownerId: userId,
        sortOrder: (maxSortTask?.sortOrder ?? -1) + 1,
      },
      include: {
        assignee: { select: { id: true, name: true, email: true, image: true, metadata: true } },
        project: { select: { id: true, name: true, color: true } },
      },
    });

    try {
      const areaId = await resolveTaskAreaId(task.projectId);
      fireWebhookEvent(buildTaskContext(
        { id: task.id, title: task.title, shortIdNum: task.shortIdNum, projectId: task.projectId, ownerId: task.ownerId },
        'task.created',
        undefined,
        areaId
      ));

      if (task.assigneeId && task.assigneeId !== userId) {
        fireWebhookEvent(buildTaskContext(
          { id: task.id, title: task.title, shortIdNum: task.shortIdNum, projectId: task.projectId, ownerId: task.assigneeId },
          'task.assigned_to_me',
          { assigneeId: { from: null, to: task.assigneeId } },
          areaId
        ));
      }
    } catch (webhookError) {
      console.error('[Webhook] Error in task create webhook:', webhookError);
    }

    if (task.dueDate) {
      try {
        await createScheduledJob({
          type: 'due_date_reached',
          fireAt: task.dueDate,
          entityId: task.id,
          entityType: 'task',
          ownerId: task.ownerId,
          payload: {
            title: task.title,
            shortIdNum: task.shortIdNum,
            projectId: task.projectId,
          },
        });
      } catch (schedulerError) {
        console.error('[Scheduler] Error creating scheduled job:', schedulerError);
      }
    }

    const createdParsed = parseJsonFields(task, "task");
    const createdPrices = extractPricesFromMetadata(createdParsed.metadata as Record<string, unknown>);
    const createdCurrency = extractCurrencyFromMetadata(createdParsed.metadata as Record<string, unknown>);

    return {
      ok: true,
      data: {
        ...createdParsed,
        assignee: task.assignee ? sanitizeUserProfile(task.assignee) : null,
        _count: { subtasks: 0 },
        completedSubtasks: 0,
        prices: createdPrices,
        currency: createdCurrency,
      },
    };
  },

  async updateTask(userId: string, id: string, data: UpdateTaskData): Promise<ServiceResult<Record<string, unknown>>> {
    const existing = await db.task.findFirst({ where: { id } });
    if (!existing || !canWriteEntity(userId, existing.ownerId)) {
      return { ok: false, status: 404, error: "Not found or access denied" };
    }

    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData.title = data.title.trim();
    if (data.description !== undefined) updateData.description = data.description;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.dueDate !== undefined) updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    if (data.projectId !== undefined) updateData.projectId = data.projectId;
    if (data.parentId !== undefined) updateData.parentId = data.parentId || null;
    if (data.assigneeId !== undefined) updateData.assigneeId = data.assigneeId || null;
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
    if (data.tagIds !== undefined) updateData.tagIds = JSON.stringify(data.tagIds);
    if (data.visibility !== undefined) updateData.visibility = data.visibility;
    if (data.visibleUserIds !== undefined) updateData.visibleUserIds = JSON.stringify(data.visibleUserIds);

    // Merge prices/currency into metadata
    if (data.prices !== undefined || data.currency !== undefined || data.metadata !== undefined) {
      let existingMeta: Record<string, unknown>;
      try {
        existingMeta = JSON.parse(existing.metadata as string || '{}');
      } catch {
        existingMeta = {};
      }
      if (data.metadata) {
        existingMeta = { ...existingMeta, ...data.metadata };
      }
      if (data.prices !== undefined) {
        existingMeta.prices = data.prices;
      }
      if (data.currency !== undefined) {
        existingMeta.currency = data.currency;
      }
      updateData.metadata = JSON.stringify(existingMeta);
    }

    // Propagate currency to parent if subtask sets currency and parent has none
    if (data.currency && existing.parentId) {
      const parent = await db.task.findFirst({
        where: { id: existing.parentId, ownerId: userId },
        select: { metadata: true },
      });
      if (parent) {
        try {
          const parentMeta = JSON.parse(parent.metadata as string || '{}');
          const parentCurrency = extractCurrencyFromMetadata(parentMeta);
          if (!parentCurrency) {
            parentMeta.currency = data.currency;
            await db.task.update({
              where: { id: existing.parentId },
              data: { metadata: JSON.stringify(parentMeta) },
            });
          }
        } catch { /* ignore */ }
      }
    }

    const task = await db.task.update({
      where: { id },
      data: updateData,
      include: {
        assignee: { select: { id: true, name: true, email: true, image: true, metadata: true } },
        project: { select: { id: true, name: true, color: true, areaId: true } },
        parent: { select: { id: true, title: true } },
        _count: { select: { subtasks: true } },
        subtasks: { select: { id: true, title: true, status: true, priority: true, parentId: true, shortIdNum: true, metadata: true } },
      },
    });

    try {
      const changes = computeChanges(
        existing as unknown as Record<string, unknown>,
        updateData,
        ['status', 'priority', 'assigneeId']
      );

      if (changes.status) {
        const areaId = task.project?.areaId ?? await resolveTaskAreaId(task.projectId);
        await fireWebhookEvent(buildTaskContext(
          { id: task.id, title: task.title, shortIdNum: task.shortIdNum, projectId: task.projectId, ownerId: task.ownerId },
          'task.status_changed',
          changes,
          areaId
        ));
      }

      if (changes.priority) {
        const areaId = task.project?.areaId ?? await resolveTaskAreaId(task.projectId);
        await fireWebhookEvent(buildTaskContext(
          { id: task.id, title: task.title, shortIdNum: task.shortIdNum, projectId: task.projectId, ownerId: task.ownerId },
          'task.priority_changed',
          changes,
          areaId
        ));
      }

      if (changes.assigneeId && changes.assigneeId.to) {
        const newAssigneeId = changes.assigneeId.to as string;
        const areaId = task.project?.areaId ?? await resolveTaskAreaId(task.projectId);
        await fireWebhookEvent(buildTaskContext(
          { id: task.id, title: task.title, shortIdNum: task.shortIdNum, projectId: task.projectId, ownerId: newAssigneeId },
          'task.assigned_to_me',
          { assigneeId: changes.assigneeId },
          areaId
        ));
      }

      if (data.dueDate !== undefined) {
        await deleteScheduledJobsForEntity(task.id, 'due_date_reached');
        if (data.dueDate) {
          await createScheduledJob({
            type: 'due_date_reached',
            fireAt: new Date(data.dueDate),
            entityId: task.id,
            entityType: 'task',
            ownerId: task.ownerId,
            payload: {
              title: task.title,
              shortIdNum: task.shortIdNum,
              projectId: task.projectId,
            },
          });
        }
      }
    } catch (webhookError) {
      console.error('[Webhook/Scheduler] Error in task update:', webhookError);
    }

    const { subtasks, ...rest } = task;
    const updatedParsed = parseJsonFields(rest, "task");
    const updatedPrices = extractPricesFromMetadata(updatedParsed.metadata as Record<string, unknown>);
    const updatedCurrency = extractCurrencyFromMetadata(updatedParsed.metadata as Record<string, unknown>);

    const subtaskPrices = subtasks.flatMap((s) => {
      try {
        const sMeta = JSON.parse((s as Record<string, unknown>).metadata as string || '{}');
        return extractPricesFromMetadata(sMeta);
      } catch { return []; }
    });
    const allPrices = [...updatedPrices, ...subtaskPrices];

    return {
      ok: true,
      data: {
        ...updatedParsed,
        assignee: task.assignee ? sanitizeUserProfile(task.assignee) : null,
        _count: { subtasks: task._count.subtasks },
        completedSubtasks: subtasks.filter((s) => s.status === "done").length,
        prices: updatedPrices,
        currency: updatedCurrency,
        priceSummary: allPrices.length > 0 ? summarize(allPrices) : undefined,
      },
    };
  },

  async deleteTask(userId: string, id: string): Promise<ServiceResult<{ success: boolean }>> {
    const existing = await db.task.findFirst({ where: { id } });
    if (!existing || !canWriteEntity(userId, existing.ownerId)) {
      return { ok: false, status: 404, error: "Not found or access denied" };
    }

    const entityRefs: Array<{ id: string; type: 'task' | 'note' | 'comment' }> = [{ id, type: 'task' }];
    const queue = [id];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const subtasks = await db.task.findMany({ where: { parentId: currentId }, select: { id: true } });
      for (const st of subtasks) {
        entityRefs.push({ id: st.id, type: 'task' });
        queue.push(st.id);
      }
      const comments = await db.comment.findMany({ where: { taskId: currentId }, select: { id: true } });
      for (const c of comments) {
        entityRefs.push({ id: c.id, type: 'comment' });
      }
    }
    await cleanupAttachments(entityRefs);

    await db.task.delete({ where: { id } });

    return { ok: true, data: { success: true } };
  },
};
