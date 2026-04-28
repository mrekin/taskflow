import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserId, requireAuth } from "@/lib/auth-utils";

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

    const comments = await db.comment.findMany({
      where: {
        taskId,
        ownerId: userId,
      },
      orderBy: { createdAt: "asc" },
      include: {
        owner: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    return NextResponse.json(comments);
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

    const comment = await db.comment.create({
      data: {
        content: content.trim(),
        taskId,
        ownerId: userId,
      },
      include: {
        owner: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error("Failed to create comment:", error);
    return NextResponse.json(
      { error: "Failed to create comment" },
      { status: 500 }
    );
  }
}
