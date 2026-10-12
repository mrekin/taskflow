import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  requireApiAuth,
  requireTokenEntityAccess,
} from "@/lib/api-token";
import { NoteVersionService } from "@/services/note-version.service";

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
    const result = await NoteVersionService.listVersions(userId, id);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Failed to list note versions:", error);
    return NextResponse.json({ error: "Failed to list versions" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiAuth(request);
    if ("error" in authResult) return authResult.error;
    const { userId, token } = authResult;

    const { id } = await params;

    if (token) {
      const denied = await requireTokenEntityAccess({ userId, token }, "notes", "update", "note", id);
      if (denied) return denied;
    }

    const body = await request.json();
    const result = await NoteVersionService.createVersion(userId, id, {
      title: body.title,
      content: body.content,
      projectId: body.projectId,
      tagIds: body.tagIds,
      visibility: body.visibility,
      visibleUserIds: body.visibleUserIds,
      comment: body.comment,
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    console.error("Failed to create note version:", error);
    return NextResponse.json({ error: "Failed to create version" }, { status: 500 });
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
      const denied = await requireTokenEntityAccess({ userId, token }, "notes", "update", "note", id);
      if (denied) return denied;
    }

    const { numbers } = await request.json();
    if (!Array.isArray(numbers)) {
      return NextResponse.json({ error: "numbers must be an array" }, { status: 400 });
    }

    const result = await NoteVersionService.deleteVersions(
      userId,
      id,
      numbers.map((n) => Number(n)).filter((n) => Number.isFinite(n))
    );

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Failed to delete note versions:", error);
    return NextResponse.json({ error: "Failed to delete versions" }, { status: 500 });
  }
}
