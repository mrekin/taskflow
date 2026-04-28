import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseJsonFields } from "@/lib/api-utils";
import { getCurrentUserId, requireAuth } from "@/lib/auth-utils";

// GET /api/notes/[id] - Get single note
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const { id } = await params;
    const note = await db.note.findFirst({
      where: { id, ownerId: userId },
      include: {
        project: { select: { id: true, name: true, color: true } },
      },
    });

    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    return NextResponse.json(parseJsonFields(note, "note"));
  } catch (error) {
    console.error("Failed to fetch note:", error);
    return NextResponse.json({ error: "Failed to fetch note" }, { status: 500 });
  }
}

// PUT /api/notes/[id] - Update note
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
    const { title, content, projectId, metadata, tagIds } = body;

    const existing = await db.note.findFirst({ where: { id, ownerId: userId } });
    if (!existing) {
      return NextResponse.json({ error: "Not found or access denied" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title.trim();
    if (content !== undefined) updateData.content = content;
    if (projectId !== undefined) updateData.projectId = projectId;
    if (metadata !== undefined) updateData.metadata = JSON.stringify(metadata);
    if (tagIds !== undefined) updateData.tagIds = JSON.stringify(tagIds);

    const note = await db.note.update({
      where: { id },
      data: updateData,
      include: {
        project: { select: { id: true, name: true, color: true } },
      },
    });

    return NextResponse.json(parseJsonFields(note, "note"));
  } catch (error) {
    console.error("Failed to update note:", error);
    return NextResponse.json({ error: "Failed to update note" }, { status: 500 });
  }
}

// DELETE /api/notes/[id] - Delete note
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ("error" in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;

    const existing = await db.note.findFirst({ where: { id, ownerId: userId } });
    if (!existing) {
      return NextResponse.json({ error: "Not found or access denied" }, { status: 404 });
    }

    await db.note.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete note:", error);
    return NextResponse.json({ error: "Failed to delete note" }, { status: 500 });
  }
}
