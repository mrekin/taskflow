import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserId, requireAuth } from "@/lib/auth-utils";
import {
  canReadEntity,
  resolveEffectiveVisibility,
  parseVisibleUserIds,
  sanitizeUserProfile,
} from "@/lib/visibility";

// GET /api/comments?taskId=xxx - List comments for a task
export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return NextResponse.json([]);

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId");

    if (!taskId) {
      return NextResponse.json(
        { error: "taskId query parameter is required" },
        { status: 400 }
      );
    }

    const task = await db.task.findFirst({
      where: { id: taskId },
      select: { id: true, ownerId: true, visibility: true, visibleUserIds: true, projectId: true },
    });

    if (!task) {
      return NextResponse.json([]);
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
      return NextResponse.json([]);
    }

    const comments = await db.comment.findMany({
      where: { taskId },
      orderBy: { createdAt: "asc" },
      include: {
        owner: { select: { id: true, name: true, email: true, image: true, metadata: true } },
      },
    });

    return NextResponse.json(comments.map((c) => ({
      ...c,
      owner: sanitizeUserProfile(c.owner) ?? { id: c.owner.id, name: null, image: null },
    })));
  } catch (error) {
    console.error("Failed to fetch comments:", error);
    return NextResponse.json(
      { error: "Failed to fetch comments" },
      { status: 500 }
    );
  }
}

// POST /api/comments - Create a new comment
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if ("error" in authResult) return authResult.error;
    const { userId } = authResult;

    const body = await request.json();
    const { content, taskId } = body;

    if (!content || typeof content !== "string" || content.trim() === "") {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 }
      );
    }

    if (!taskId || typeof taskId !== "string" || taskId.trim() === "") {
      return NextResponse.json(
        { error: "taskId is required" },
        { status: 400 }
      );
    }

    const task = await db.task.findFirst({
      where: { id: taskId },
      select: { id: true, ownerId: true, visibility: true, visibleUserIds: true, projectId: true },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
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
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const comment = await db.comment.create({
      data: {
        content: content.trim(),
        taskId,
        ownerId: userId,
      },
      include: {
        owner: { select: { id: true, name: true, email: true, image: true, metadata: true } },
      },
    });

    return NextResponse.json({
      ...comment,
      owner: sanitizeUserProfile(comment.owner) ?? { id: comment.owner.id, name: null, image: null },
    }, { status: 201 });
  } catch (error) {
    console.error("Failed to create comment:", error);
    return NextResponse.json(
      { error: "Failed to create comment" },
      { status: 500 }
    );
  }
}
