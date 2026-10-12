import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  requireApiAuth,
  requireTokenEntityAccess,
} from "@/lib/api-token";
import { NoteService } from "@/services/note.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.ok) return auth.response;
    const userId = auth.ctx.kind === "anonymous" ? null : auth.ctx.userId;

    if (auth.ctx.kind === "token") {
      const { id } = await params;
      const denied = await requireTokenEntityAccess(auth.ctx, "notes", "read", "note", id);
      if (denied) return denied;
    }

    const { id } = await params;
    const result = await NoteService.getNote(userId, id);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Failed to fetch note:", error);
    return NextResponse.json({ error: "Failed to fetch note" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiAuth(request);
    if ("error" in authResult) return authResult.error;
    const { userId, token } = authResult;

    const { id } = await params;
    const body = await request.json();

    if (token) {
      const denied = await requireTokenEntityAccess(
        { userId, token }, "notes", "update", "note", id,
        body.projectId !== undefined ? body.projectId : undefined,
      );
      if (denied) return denied;
    }

    const result = await NoteService.updateNote(userId, id, body);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Failed to update note:", error);
    return NextResponse.json({ error: "Failed to update note" }, { status: 500 });
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

    if (token) {
      const { id } = await params;
      const denied = await requireTokenEntityAccess({ userId, token }, "notes", "delete", "note", id);
      if (denied) return denied;
    }

    const { id } = await params;
    const result = await NoteService.deleteNote(userId, id);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Failed to delete note:", error);
    return NextResponse.json({ error: "Failed to delete note" }, { status: 500 });
  }
}
