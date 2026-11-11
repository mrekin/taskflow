import { NextRequest, NextResponse } from "next/server";
import {
  requireApiAuth,
  requireTokenEntityAccess,
} from "@/lib/api-token";
import { NoteCommentService } from "@/services/note-comment.service";

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
      const denied = await requireTokenEntityAccess({ userId, token }, "comments", "update", "noteComment", id);
      if (denied) return denied;
    }

    const body = await request.json();
    const result = await NoteCommentService.updateNoteComment(userId, id, {
      content: body.content,
      resolved: body.resolved,
      quote: body.quote,
      prefix: body.prefix,
      suffix: body.suffix,
      offset: body.offset,
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Failed to update note comment:", error);
    return NextResponse.json({ error: "Failed to update note comment" }, { status: 500 });
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
      const denied = await requireTokenEntityAccess({ userId, token }, "comments", "delete", "noteComment", id);
      if (denied) return denied;
    }

    const result = await NoteCommentService.deleteNoteComment(userId, id);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Failed to delete note comment:", error);
    return NextResponse.json({ error: "Failed to delete note comment" }, { status: 500 });
  }
}
