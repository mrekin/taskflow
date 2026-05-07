import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-utils";
import { canDeleteComment } from "@/lib/visibility";

// PUT /api/comments/[id] - Update comment content
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
    const { content } = body;

    if (!content || typeof content !== "string" || content.trim() === "") {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 }
      );
    }

    const existing = await db.comment.findFirst({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Not found or access denied" },
        { status: 404 }
      );
    }

    const task = await db.task.findFirst({
      where: { id: existing.taskId },
      select: { ownerId: true },
    });

    const isCommentAuthor = existing.ownerId === userId;
    const isTaskOwner = task?.ownerId === userId;

    if (!isCommentAuthor && !isTaskOwner) {
      return NextResponse.json(
        { error: "Not found or access denied" },
        { status: 404 }
      );
    }

    const comment = await db.comment.update({
      where: { id },
      data: { content: content.trim() },
      include: {
        owner: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    return NextResponse.json(comment);
  } catch (error) {
    console.error("Failed to update comment:", error);
    return NextResponse.json(
      { error: "Failed to update comment" },
      { status: 500 }
    );
  }
}

// DELETE /api/comments/[id] - Delete comment
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ("error" in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;

    const existing = await db.comment.findFirst({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Not found or access denied" },
        { status: 404 }
      );
    }

    const task = await db.task.findFirst({
      where: { id: existing.taskId },
      select: { ownerId: true },
    });

    if (!canDeleteComment(userId, existing.ownerId, task?.ownerId ?? "")) {
      return NextResponse.json(
        { error: "Not found or access denied" },
        { status: 404 }
      );
    }

    await db.comment.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete comment:", error);
    return NextResponse.json(
      { error: "Failed to delete comment" },
      { status: 500 }
    );
  }
}
