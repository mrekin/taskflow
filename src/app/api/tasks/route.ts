import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseJsonFields, getNextShortIdNum } from "@/lib/api-utils";
import { getCurrentUserId, requireAuth } from "@/lib/auth-utils";
import { fireWebhookEvent, buildTaskContext, resolveTaskAreaId } from "@/lib/webhook-engine";
import { createScheduledJob } from "@/lib/scheduler";
import { buildVisibilityWhereClause, sanitizeUserProfile } from "@/lib/visibility";

// GET /api/tasks - List tasks with optional filters
export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return NextResponse.json([]);
    const isAuthenticated = !!userId;

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const parentId = searchParams.get("parentId") ?? undefined;
    const search = searchParams.get("search") ?? undefined;
    const assigneeId = searchParams.get("assigneeId") ?? undefined;

    const visibilityClause = buildVisibilityWhereClause(userId, isAuthenticated);
    const filterWhere: Record<string, unknown> = {
      ...(projectId ? { projectId } : {}),
      ...(status ? { status } : {}),
      ...(assigneeId ? { assigneeId } : {}),
    };

    let where: Record<string, unknown>;

    if (search) {
      const shortIdMatch = search.match(/^T-(\d+)$/i);
      const shortIdNum = shortIdMatch ? parseInt(shortIdMatch[1], 10) : null;

      const dateMatch = search.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      const dateStart = dateMatch
        ? new Date(`${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}T00:00:00.000Z`)
        : null;
      const dateEnd = dateStart ? new Date(dateStart.getTime() + 86400000) : null;

      const taskConditions: Record<string, unknown>[] = [
        { title: { contains: search } },
        { description: { contains: search } },
        { comments: { some: { content: { contains: search } } } },
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
        { title: { contains: search } },
        { description: { contains: search } },
      ];

      if (shortIdNum !== null) {
        subtaskConditions.push({ shortIdNum });
      }

      taskConditions.push({ subtasks: { some: { OR: subtaskConditions } } });
      taskConditions.push({ assignee: { OR: [{ name: { contains: search } }, { email: { contains: search } }] } });

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
          ...(parentId !== undefined ? [{ parentId: parentId || null }] : []),
        ],
      };
    }

    const tasks = await db.task.findMany({
      where,
      orderBy: { sortOrder: "asc" },
      include: {
        _count: { select: { subtasks: true } },
        subtasks: { select: { id: true, title: true, status: true, priority: true, parentId: true, shortIdNum: true, assigneeId: true, assignee: { select: { id: true, name: true, email: true, image: true, metadata: true } } } },
        assignee: { select: { id: true, name: true, email: true, image: true, metadata: true } },
        project: { select: { id: true, name: true, color: true } },
      },
    });

    const result = tasks.map((task) => {
      const { subtasks, ...rest } = task;
      const parsed = parseJsonFields(rest, "task");
      return {
        ...parsed,
        assignee: task.assignee ? sanitizeUserProfile(task.assignee) : null,
        _count: { subtasks: task._count.subtasks },
        completedSubtasks: subtasks.filter((s) => s.status === "done").length,
        subtasks: subtasks.map((s) => ({
          ...s,
          shortId: `T-${s.shortIdNum}`,
          assignee: s.assignee ? sanitizeUserProfile(s.assignee) : null,
        })),
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch tasks:", error);
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

// POST /api/tasks - Create new task
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if ("error" in authResult) return authResult.error;
    const { userId } = authResult;

    const body = await request.json();
    const {
      title,
      description,
      status,
      priority,
      dueDate,
      projectId,
      parentId,
      assigneeId,
      metadata,
      tagIds,
      visibility,
      visibleUserIds,
    } = body;

    if (!title || typeof title !== "string" || title.trim() === "") {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    let resolvedProjectId = projectId ?? null;
    if (parentId) {
      const parent = await db.task.findFirst({
        where: { id: parentId, ownerId: userId },
        select: { projectId: true },
      });
      if (!parent) {
        return NextResponse.json({ error: "Parent task not found" }, { status: 404 });
      }
      resolvedProjectId = parent.projectId;
    }

    const maxSortTask = await db.task.findFirst({
      where: {
        ownerId: userId,
        ...(resolvedProjectId ? { projectId: resolvedProjectId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const shortIdNum = await getNextShortIdNum(db.task, userId);

    const task = await db.task.create({
      data: {
        title: title.trim(),
        description: description ?? null,
        status: status ?? "todo",
        priority: priority ?? "medium",
        dueDate: dueDate ? new Date(dueDate) : null,
        projectId: resolvedProjectId,
        parentId: parentId ?? null,
        assigneeId: assigneeId ?? null,
        metadata: metadata ? JSON.stringify(metadata) : "{}",
        tagIds: tagIds ? JSON.stringify(tagIds) : "[]",
        visibility: visibility ?? null,
        visibleUserIds: JSON.stringify(visibleUserIds || []),
        shortIdNum,
        ownerId: userId,
        sortOrder: (maxSortTask?.sortOrder ?? -1) + 1,
      },
      include: {
        assignee: { select: { id: true, name: true, email: true, image: true, metadata: true } },
        project: { select: { id: true, name: true, color: true } },
      },
    });

    // Fire webhook event for task creation (non-blocking)
    try {
      const areaId = await resolveTaskAreaId(task.projectId);
      fireWebhookEvent(buildTaskContext(
        { id: task.id, title: task.title, shortIdNum: task.shortIdNum, projectId: task.projectId, ownerId: task.ownerId },
        'task.created',
        undefined,
        areaId
      ));

      // Fire "assigned to me" webhook if task is created with an assignee different from creator
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

    // Create scheduled job for due date webhook
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

    return NextResponse.json(
      {
        ...parseJsonFields(task, "task"),
        assignee: task.assignee ? sanitizeUserProfile(task.assignee) : null,
        _count: { subtasks: 0 },
        completedSubtasks: 0,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create task:", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
