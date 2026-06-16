import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, requireAuth } from "@/lib/auth-utils";
import { NoteVersionService } from "@/services/note-version.service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
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
    const authResult = await requireAuth();
    if ("error" in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;
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
    const authResult = await requireAuth();
    if ("error" in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;
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
