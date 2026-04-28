import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseJsonFields } from "@/lib/api-utils";
import { getCurrentUserId, requireAuth } from "@/lib/auth-utils";

// GET /api/tasks - List tasks with optional filters
export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return NextResponse.json([]);

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const parentId = searchParams.get("parentId") ?? undefined;

    const tasks = await db.task.findMany({
      where: {
        ownerId: userId,
        ...(projectId ? { projectId } : {}),
        ...(status ? { status } : {}),
        ...(parentId !== undefined ? { parentId: parentId || null } : {}),
      },
      orderBy: { sortOrder: "asc" },
      include: {
        _count: { select: { subtasks: true } },
        subtasks: { select: { id: true, title: true, status: true, priority: true, parentId: true } },
        assignee: { select: { id: true, name: true, email: true, image: true } },
        project: { select: { id: true, name: true, color: true } },
      },
    });

    const result = tasks.map((task) => ({
      ...parseJsonFields(task),
      _count: { subtasks: task._count.subtasks },
      completedSubtasks: task.subtasks.filter((s) => s.status === "done").length,
    }));

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
    } = body;

    if (!title || typeof title !== "string" || title.trim() === "") {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    // Get the max sortOrder for tasks in the same project/status context
    const maxSortTask = await db.task.findFirst({
      where: {
        ownerId: userId,
        ...(projectId ? { projectId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const task = await db.task.create({
      data: {
        title: title.trim(),
        description: description ?? null,
        status: status ?? "todo",
        priority: priority ?? "medium",
        dueDate: dueDate ? new Date(dueDate) : null,
        projectId: projectId ?? null,
        parentId: parentId ?? null,
        assigneeId: assigneeId ?? null,
        metadata: metadata ? JSON.stringify(metadata) : "{}",
        tagIds: tagIds ? JSON.stringify(tagIds) : "[]",
        ownerId: userId,
        sortOrder: (maxSortTask?.sortOrder ?? -1) + 1,
      },
      include: {
        assignee: { select: { id: true, name: true, email: true, image: true } },
        project: { select: { id: true, name: true, color: true } },
      },
    });

    return NextResponse.json(
      {
        ...parseJsonFields(task),
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
