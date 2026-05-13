import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-utils";
import { canDeleteComment, sanitizeUserProfile } from "@/lib/visibility";

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
        owner: { select: { id: true, name: true, email: true, image: true, metadata: true } },
      },
    });

    return NextResponse.json({
      ...comment,
      owner: sanitizeUserProfile(comment.owner) ?? { id: comment.owner.id, name: null, image: null },
    });
  } catch (error) {
    console.error("Failed to update comment:", error);
    return NextResponse.json(
      { error: "Failed to update comment" },
      { status: 500 }
    );
  }
}

// DELETE /api/comments/[id] - Soft-delete comment (replies preserved)
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

    // Check if comment has replies
    const replyCount = await db.comment.count({
      where: { parentId: id },
    });

    if (replyCount > 0) {
      // Soft-delete: mark as deleted, clear content, preserve replies
      const comment = await db.comment.update({
        where: { id },
        data: { deleted: true, content: "" },
        include: {
          owner: { select: { id: true, name: true, email: true, image: true, metadata: true } },
        },
      });

      return NextResponse.json({
        ...comment,
        owner: sanitizeUserProfile(comment.owner) ?? { id: comment.owner.id, name: null, image: null },
      });
    }

    // No replies — hard delete
    await db.comment.delete({ where: { id } });

    return NextResponse.json({ success: true, deleted: true });
  } catch (error) {
    console.error("Failed to delete comment:", error);
    return NextResponse.json(
      { error: "Failed to delete comment" },
      { status: 500 }
    );
  }
}
