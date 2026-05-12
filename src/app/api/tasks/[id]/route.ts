import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseJsonFields } from "@/lib/api-utils";
import { getCurrentUserId, requireAuth } from "@/lib/auth-utils";
import { fireWebhookEvent, buildTaskContext, resolveTaskAreaId, computeChanges } from "@/lib/webhook-engine";
import { createScheduledJob, deleteScheduledJobsForEntity } from "@/lib/scheduler";
import { resolveEffectiveVisibility, canReadEntity, canWriteEntity, parseVisibleUserIds, sanitizeRelation, sanitizeUserProfile } from "@/lib/visibility";

// GET /api/tasks/[id] - Get single task with subtasks and comments
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const isAuthenticated = !!userId;

    const { id } = await params;
    const task = await db.task.findFirst({
      where: { id },
      include: {
        subtasks: {
          orderBy: { sortOrder: "asc" },
          include: {
            _count: { select: { subtasks: true } },
            subtasks: { select: { id: true, title: true, status: true, priority: true, parentId: true, shortIdNum: true } },
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
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
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
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
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
    const result = {
      ...parseJsonFields(rest, "task"),
      assignee: task.assignee ? sanitizeUserProfile(task.assignee) : null,
      project: sanitizedProject,
      parent: sanitizedParent,
      _count: { subtasks: subtasks.length },
      completedSubtasks: subtasks.filter((s) => s.status === "done").length,
      subtasks: subtasks.map((sub) => {
        const { subtasks: _, ...subRest } = sub;
        return {
          ...parseJsonFields(subRest, "task"),
          assignee: sub.assignee ? sanitizeUserProfile(sub.assignee) : null,
          _count: { subtasks: sub._count.subtasks },
          completedSubtasks: sub.subtasks.filter((s) => s.status === "done").length,
        };
      }),
      comments: comments.map((c) => ({
        ...c,
        owner: sanitizeUserProfile(c.owner) ?? { id: c.owner.id, name: null, image: null },
      })),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch task:", error);
    return NextResponse.json({ error: "Failed to fetch task" }, { status: 500 });
  }
}

// PUT /api/tasks/[id] - Update task
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ("error" in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;
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
      sortOrder,
      metadata,
      tagIds,
      visibility,
      visibleUserIds,
    } = body;

    const existing = await db.task.findFirst({ where: { id } });
    if (!existing || !canWriteEntity(userId, existing.ownerId)) {
      return NextResponse.json({ error: "Not found or access denied" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;
    if (priority !== undefined) updateData.priority = priority;
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
    if (projectId !== undefined) updateData.projectId = projectId;
    if (parentId !== undefined) updateData.parentId = parentId || null;
    if (assigneeId !== undefined) updateData.assigneeId = assigneeId || null;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (metadata !== undefined) updateData.metadata = JSON.stringify(metadata);
    if (tagIds !== undefined) updateData.tagIds = JSON.stringify(tagIds);
    if (visibility !== undefined) updateData.visibility = visibility;
    if (visibleUserIds !== undefined) updateData.visibleUserIds = JSON.stringify(visibleUserIds);

    const task = await db.task.update({
      where: { id },
      data: updateData,
      include: {
        assignee: { select: { id: true, name: true, email: true, image: true, metadata: true } },
        project: { select: { id: true, name: true, color: true, areaId: true } },
        parent: { select: { id: true, title: true } },
        _count: { select: { subtasks: true } },
        subtasks: { select: { id: true, title: true, status: true, priority: true, parentId: true, shortIdNum: true } },
      },
    });

    // Fire webhook events + manage scheduled jobs
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

      // Fire "assigned to me" webhook when assignee changes to a specific user
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

      if (dueDate !== undefined) {
        await deleteScheduledJobsForEntity(task.id, 'due_date_reached');
        if (dueDate) {
          await createScheduledJob({
            type: 'due_date_reached',
            fireAt: new Date(dueDate),
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
    return NextResponse.json({
      ...parseJsonFields(rest, "task"),
      assignee: task.assignee ? sanitizeUserProfile(task.assignee) : null,
      _count: { subtasks: task._count.subtasks },
      completedSubtasks: subtasks.filter((s) => s.status === "done").length,
    });
  } catch (error) {
    console.error("Failed to update task:", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

// DELETE /api/tasks/[id] - Delete task (cascades to subtasks)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ("error" in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;

    const existing = await db.task.findFirst({ where: { id } });
    if (!existing || !canWriteEntity(userId, existing.ownerId)) {
      return NextResponse.json({ error: "Not found or access denied" }, { status: 404 });
    }

    await db.task.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete task:", error);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
