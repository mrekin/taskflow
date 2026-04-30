import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseJsonFields, getNextShortIdNum } from "@/lib/api-utils";
import { getCurrentUserId, requireAuth } from "@/lib/auth-utils";

// GET /api/notes - List notes with optional project filter
export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return NextResponse.json([]);

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId") ?? undefined;
    const folderId = searchParams.get("folderId") ?? undefined;

    const notes = await db.note.findMany({
      where: {
        ownerId: userId,
        ...(projectId ? { projectId } : {}),
        ...(folderId ? { folderId } : {}),
      },
      orderBy: { updatedAt: "desc" },
      include: {
        project: { select: { id: true, name: true, color: true } },
        folder: { select: { id: true, name: true, parentId: true } },
      },
    });

    const result = notes.map((note) => parseJsonFields(note, "note"));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch notes:", error);
    return NextResponse.json({ error: "Failed to fetch notes" }, { status: 500 });
  }
}

// POST /api/notes - Create new note
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if ("error" in authResult) return authResult.error;
    const { userId } = authResult;

    const body = await request.json();
    const { title, content, projectId, folderId, metadata, tagIds } = body;

    if (!title || typeof title !== "string" || title.trim() === "") {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    // Check duplicate note title in same folder/project scope
    const noteProjectId = projectId ?? null;
    const noteFolderId = folderId ?? null;
    const duplicateNote = await db.note.findFirst({
      where: {
        title: title.trim(),
        projectId: noteProjectId,
        folderId: noteFolderId,
        ownerId: userId,
      },
    });
    if (duplicateNote) {
      return NextResponse.json({ error: "A note with this title already exists in this location" }, { status: 409 });
    }

    const maxSortNote = await db.note.findFirst({
      where: { ownerId: userId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const shortIdNum = await getNextShortIdNum(db.note, userId);

    const note = await db.note.create({
      data: {
        title: title.trim(),
        content: content ?? "",
        projectId: projectId ?? null,
        folderId: folderId ?? null,
        metadata: metadata ? JSON.stringify(metadata) : "{}",
        tagIds: tagIds ? JSON.stringify(tagIds) : "[]",
        shortIdNum,
        ownerId: userId,
        sortOrder: (maxSortNote?.sortOrder ?? -1) + 1,
      },
      include: {
        project: { select: { id: true, name: true, color: true } },
      },
    });

    return NextResponse.json(parseJsonFields(note, "note"), { status: 201 });
  } catch (error) {
    console.error("Failed to create note:", error);
    return NextResponse.json({ error: "Failed to create note" }, { status: 500 });
  }
}
