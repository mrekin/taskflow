import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseJsonFields, getNextShortIdNum } from "@/lib/api-utils";
import { getCurrentUserId, requireAuth } from "@/lib/auth-utils";

// GET /api/folders - List folders with optional filters
export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return NextResponse.json([]);

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId") ?? undefined;
    const parentId = searchParams.get("parentId") ?? undefined;

    const folders = await db.noteFolder.findMany({
      where: {
        ownerId: userId,
        ...(projectId ? { projectId } : {}),
        ...(parentId !== undefined ? { parentId: parentId || null } : {}),
      },
      orderBy: { sortOrder: "asc" },
      include: {
        parent: { select: { id: true, name: true, parentId: true } },
        _count: { select: { children: true, notes: true } },
      },
    });

    const result = folders.map((folder) => parseJsonFields(folder, "folder"));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch folders:", error);
    return NextResponse.json({ error: "Failed to fetch folders" }, { status: 500 });
  }
}

// POST /api/folders - Create new folder
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if ("error" in authResult) return authResult.error;
    const { userId } = authResult;

    const body = await request.json();
    const { name, projectId, parentId } = body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Check duplicate folder name at same level
    const duplicate = await db.noteFolder.findFirst({
      where: {
        name: name.trim(),
        parentId: parentId ?? null,
        ownerId: userId,
      },
    });
    if (duplicate) {
      return NextResponse.json({ error: "A folder with this name already exists in this location" }, { status: 409 });
    }

    // Check max nesting depth (3 levels)
    if (parentId) {
      let depth = 1;
      let currentParentId: string | null = parentId;
      while (currentParentId) {
        depth++;
        if (depth > 4) {
          return NextResponse.json(
            { error: "Maximum folder nesting depth (3) reached" },
            { status: 400 }
          );
        }
        const parent = await db.noteFolder.findFirst({
          where: { id: currentParentId, ownerId: userId },
          select: { parentId: true },
        });
        currentParentId = parent?.parentId ?? null;
      }
    }

    const maxSortFolder = await db.noteFolder.findFirst({
      where: { ownerId: userId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const shortIdNum = await getNextShortIdNum(db.noteFolder, userId);

    const folder = await db.noteFolder.create({
      data: {
        name: name.trim(),
        projectId: projectId ?? null,
        parentId: parentId ?? null,
        shortIdNum,
        ownerId: userId,
        sortOrder: (maxSortFolder?.sortOrder ?? -1) + 1,
      },
      include: {
        parent: { select: { id: true, name: true, parentId: true } },
        _count: { select: { children: true, notes: true } },
      },
    });

    return NextResponse.json(parseJsonFields(folder, "folder"), { status: 201 });
  } catch (error) {
    console.error("Failed to create folder:", error);
    return NextResponse.json({ error: "Failed to create folder" }, { status: 500 });
  }
}
