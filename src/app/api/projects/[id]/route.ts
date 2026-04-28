import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseJsonFields } from "@/lib/api-utils";
import { getCurrentUserId, requireAuth } from "@/lib/auth-utils";

// GET /api/projects/[id] - Get single project with tasks and notes
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const { id } = await params;
    const project = await db.project.findFirst({
      where: { id, ownerId: userId },
      include: {
        tasks: {
          orderBy: { sortOrder: "asc" },
          include: {
            _count: { select: { subtasks: true } },
            subtasks: { select: { id: true, status: true } },
            assignee: { select: { id: true, name: true, email: true, image: true } },
          },
        },
        notes: {
          orderBy: { updatedAt: "desc" },
        },
        area: { select: { id: true, name: true, color: true } },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const result = {
      ...parseJsonFields(project),
      _count: { tasks: project.tasks.length, notes: project.notes.length },
      tasks: project.tasks.map((task) => ({
        ...parseJsonFields(task),
        _count: { subtasks: task._count.subtasks },
        completedSubtasks: task.subtasks.filter((s) => s.status === "done").length,
      })),
      notes: project.notes.map((note) => parseJsonFields(note)),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch project:", error);
    return NextResponse.json({ error: "Failed to fetch project" }, { status: 500 });
  }
}

// PUT /api/projects/[id] - Update project
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
    const { name, description, color, icon, status, areaId, sortOrder, metadata, tagIds } = body;

    const existing = await db.project.findFirst({ where: { id, ownerId: userId } });
    if (!existing) {
      return NextResponse.json({ error: "Not found or access denied" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description;
    if (color !== undefined) updateData.color = color;
    if (icon !== undefined) updateData.icon = icon;
    if (status !== undefined) updateData.status = status;
    if (areaId !== undefined) updateData.areaId = areaId;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (metadata !== undefined) updateData.metadata = JSON.stringify(metadata);
    if (tagIds !== undefined) updateData.tagIds = JSON.stringify(tagIds);

    const project = await db.project.update({
      where: { id },
      data: updateData,
      include: {
        area: { select: { id: true, name: true, color: true } },
        _count: { select: { tasks: true, notes: true } },
      },
    });

    return NextResponse.json({
      ...parseJsonFields(project),
      _count: { tasks: project._count.tasks, notes: project._count.notes },
    });
  } catch (error) {
    console.error("Failed to update project:", error);
    return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
  }
}

// DELETE /api/projects/[id] - Delete project (cascades to tasks)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ("error" in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;

    const existing = await db.project.findFirst({ where: { id, ownerId: userId } });
    if (!existing) {
      return NextResponse.json({ error: "Not found or access denied" }, { status: 404 });
    }

    await db.project.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete project:", error);
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
  }
}
