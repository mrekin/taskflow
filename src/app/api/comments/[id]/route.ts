import { NextRequest, NextResponse } from "next/server";
import {
  requireApiAuth,
  requireTokenEntityAccess,
} from "@/lib/api-token";
import { CommentService } from "@/services/comment.service";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiAuth(request);
    if ("error" in authResult) return authResult.error;
    const { userId, token } = authResult;

    const { id } = await params;

    if (token) {
      const denied = await requireTokenEntityAccess({ userId, token }, "comments", "update", "comment", id);
      if (denied) return denied;
    }

    const body = await request.json();
    const result = await CommentService.updateComment(userId, id, body.content);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Failed to update comment:", error);
    return NextResponse.json({ error: "Failed to update comment" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiAuth(request);
    if ("error" in authResult) return authResult.error;
    const { userId, token } = authResult;

    const { id } = await params;

    if (token) {
      const denied = await requireTokenEntityAccess({ userId, token }, "comments", "delete", "comment", id);
      if (denied) return denied;
    }

    const result = await CommentService.deleteComment(userId, id);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Failed to delete comment:", error);
    return NextResponse.json({ error: "Failed to delete comment" }, { status: 500 });
  }
}
