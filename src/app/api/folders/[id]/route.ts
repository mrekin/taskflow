import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseJsonFields } from "@/lib/api-utils";
import { getCurrentUserId, requireAuth } from "@/lib/auth-utils";

// GET /api/folders/[id] - Get single folder
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const { id } = await params;
    const folder = await db.noteFolder.findFirst({
      where: { id, ownerId: userId },
      include: {
        parent: { select: { id: true, name: true, parentId: true } },
        _count: { select: { children: true, notes: true } },
      },
    });

    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    return NextResponse.json(parseJsonFields(folder, "folder"));
  } catch (error) {
    console.error("Failed to fetch folder:", error);
    return NextResponse.json({ error: "Failed to fetch folder" }, { status: 500 });
  }
}

// PUT /api/folders/[id] - Update folder
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
    const { name, parentId } = body;

    const existing = await db.noteFolder.findFirst({ where: { id, ownerId: userId } });
    if (!existing) {
      return NextResponse.json({ error: "Not found or access denied" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();

    // Check duplicate name after rename or move
    const newName = name !== undefined ? name.trim() : existing.name;
    const newParentId = parentId !== undefined ? (parentId || null) : existing.parentId;
    if (name !== undefined || parentId !== undefined) {
      const duplicate = await db.noteFolder.findFirst({
        where: {
          name: newName,
          parentId: newParentId,
          ownerId: userId,
          id: { not: id },
        },
      });
      if (duplicate) {
        return NextResponse.json({ error: "A folder with this name already exists in this location" }, { status: 409 });
      }
    }

    if (parentId !== undefined) {
      // Prevent circular reference: a folder can't be its own ancestor
      if (parentId === id) {
        return NextResponse.json(
          { error: "A folder cannot be its own parent" },
          { status: 400 }
        );
      }

      // Walk up from the proposed parent to check for cycles and depth
      if (parentId) {
        let depth = 1;
        let currentId: string | null = parentId;
        const visited = new Set<string>();
        while (currentId) {
          if (currentId === id) {
            return NextResponse.json(
              { error: "Circular reference detected" },
              { status: 400 }
            );
          }
          if (visited.has(currentId)) break;
          visited.add(currentId);
          depth++;
          if (depth > 4) {
            return NextResponse.json(
              { error: "Maximum folder nesting depth (3) reached" },
              { status: 400 }
            );
          }
          const parent = await db.noteFolder.findFirst({
            where: { id: currentId, ownerId: userId },
            select: { parentId: true },
          });
          currentId = parent?.parentId ?? null;
        }
      }
      updateData.parentId = parentId || null;
    }

    const folder = await db.noteFolder.update({
      where: { id },
      data: updateData,
      include: {
        parent: { select: { id: true, name: true, parentId: true } },
        _count: { select: { children: true, notes: true } },
      },
    });

    return NextResponse.json(parseJsonFields(folder, "folder"));
  } catch (error) {
    console.error("Failed to update folder:", error);
    return NextResponse.json({ error: "Failed to update folder" }, { status: 500 });
  }
}

// DELETE /api/folders/[id] - Delete folder
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ("error" in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;

    const existing = await db.noteFolder.findFirst({
      where: { id, ownerId: userId },
      include: { _count: { select: { children: true, notes: true } } },
    });

    if (!existing) {
      return NextResponse.json({ error: "Not found or access denied" }, { status: 404 });
    }

    if ((existing._count?.children ?? 0) > 0 || (existing._count?.notes ?? 0) > 0) {
      return NextResponse.json(
        { error: "Cannot delete non-empty folder. Move or delete its contents first." },
        { status: 400 }
      );
    }

    await db.noteFolder.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete folder:", error);
    return NextResponse.json({ error: "Failed to delete folder" }, { status: 500 });
  }
}
