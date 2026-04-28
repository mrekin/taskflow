import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseJsonFields } from "@/lib/api-utils";
import { getCurrentUserId, requireAuth } from "@/lib/auth-utils";
import { fireWebhookEvent, buildTaskContext, resolveTaskAreaId, computeChanges } from "@/lib/webhook-engine";

// GET /api/tasks/[id] - Get single task with subtasks and comments
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const { id } = await params;
    const task = await db.task.findFirst({
      where: { id, ownerId: userId },
      include: {
        subtasks: {
          orderBy: { sortOrder: "asc" },
          include: {
            _count: { select: { subtasks: true } },
            subtasks: { select: { id: true, title: true, status: true, priority: true, parentId: true, shortIdNum: true } },
            assignee: { select: { id: true, name: true, email: true, image: true } },
          },
        },
        assignee: { select: { id: true, name: true, email: true, image: true } },
        project: { select: { id: true, name: true, color: true } },
        parent: { select: { id: true, title: true } },
        comments: {
          orderBy: { createdAt: "asc" },
          include: {
            owner: { select: { id: true, name: true, email: true, image: true } },
          },
        },
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const { subtasks, comments, ...rest } = task;
    const result = {
      ...parseJsonFields(rest, "task"),
      _count: { subtasks: subtasks.length },
      completedSubtasks: subtasks.filter((s) => s.status === "done").length,
      subtasks: subtasks.map((sub) => {
        const { subtasks: _, ...subRest } = sub;
        return {
          ...parseJsonFields(subRest, "task"),
          _count: { subtasks: sub._count.subtasks },
          completedSubtasks: sub.subtasks.filter((s) => s.status === "done").length,
        };
      }),
      comments,
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
    } = body;

    const existing = await db.task.findFirst({ where: { id, ownerId: userId } });
    if (!existing) {
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

    const task = await db.task.update({
      where: { id },
      data: updateData,
      include: {
        assignee: { select: { id: true, name: true, email: true, image: true } },
        project: { select: { id: true, name: true, color: true, areaId: true } },
        parent: { select: { id: true, title: true } },
        _count: { select: { subtasks: true } },
        subtasks: { select: { id: true, title: true, status: true, priority: true, parentId: true, shortIdNum: true } },
      },
    });

    // Fire webhook events if relevant fields changed
    try {
      const changes = computeChanges(
        existing as unknown as Record<string, unknown>,
        updateData,
        ['status', 'dueDate']
      );

      if (Object.keys(changes).length > 0) {
        const areaId = task.project?.areaId ?? await resolveTaskAreaId(task.projectId);

        if (changes.status) {
          await fireWebhookEvent(buildTaskContext(
            { id: task.id, title: task.title, shortIdNum: task.shortIdNum, projectId: task.projectId, ownerId: task.ownerId },
            'task.status_changed',
            changes,
            areaId
          ));
        }

        if (changes.dueDate) {
          await fireWebhookEvent(buildTaskContext(
            { id: task.id, title: task.title, shortIdNum: task.shortIdNum, projectId: task.projectId, ownerId: task.ownerId },
            'task.due_date_reached',
            changes,
            areaId
          ));
        }
      }
    } catch (webhookError) {
      console.error('[Webhook] Error in task update webhook:', webhookError);
      // Don't fail the request if webhook fails
    }

    const { subtasks, ...rest } = task;
    return NextResponse.json({
      ...parseJsonFields(rest, "task"),
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

    const existing = await db.task.findFirst({ where: { id, ownerId: userId } });
    if (!existing) {
      return NextResponse.json({ error: "Not found or access denied" }, { status: 404 });
    }

    await db.task.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete task:", error);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
