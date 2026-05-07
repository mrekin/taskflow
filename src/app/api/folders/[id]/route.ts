import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseJsonFields } from "@/lib/api-utils";
import { getCurrentUserId, requireAuth } from "@/lib/auth-utils";
import {
  canReadEntity,
  canWriteEntity,
  resolveEffectiveVisibility,
  parseVisibleUserIds,
  sanitizeRelation,
} from "@/lib/visibility";

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
      where: { id },
      include: {
        parent: { select: { id: true, name: true, parentId: true, visibility: true, visibleUserIds: true, ownerId: true } },
        _count: { select: { children: true, notes: true } },
      },
    });

    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    const parentChain: Array<{ visibility: string | null; ownerId: string }> = [];

    let currentParent = folder.parent as { id: string; parentId: string | null; visibility: string | null; ownerId: string } | null;
    while (currentParent) {
      parentChain.push({ visibility: currentParent.visibility, ownerId: currentParent.ownerId });
      if (currentParent.parentId) {
        const parent = await db.noteFolder.findFirst({
          where: { id: currentParent.parentId },
          select: { id: true, parentId: true, visibility: true, ownerId: true },
        });
        currentParent = parent;
      } else {
        currentParent = null;
      }
    }

    if (folder.projectId) {
      const project = await db.project.findFirst({
        where: { id: folder.projectId },
        select: { visibility: true, ownerId: true, areaId: true },
      });
      if (project) {
        parentChain.push({ visibility: project.visibility, ownerId: project.ownerId });
        if (project.areaId) {
          const area = await db.area.findFirst({
            where: { id: project.areaId },
            select: { visibility: true, ownerId: true },
          });
          if (area) {
            parentChain.push({ visibility: area.visibility, ownerId: area.ownerId });
          }
        }
      }
    }

    const effectiveVisibility = resolveEffectiveVisibility(folder.visibility, parentChain);
    const folderVisibleUserIds = parseVisibleUserIds(folder.visibleUserIds);

    if (!canReadEntity(userId, folder.ownerId, effectiveVisibility, folderVisibleUserIds, !!userId)) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    const response: Record<string, unknown> = { ...parseJsonFields(folder, "folder") };

    if (folder.parent) {
      response.parent = sanitizeRelation(
        folder.parent as any,
        (folder.parent as any).ownerId,
        userId,
        !!userId,
        parentChain,
      );
    }

    return NextResponse.json(response);
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
    const { name, parentId, visibility, visibleUserIds } = body;

    const existing = await db.noteFolder.findFirst({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found or access denied" }, { status: 404 });
    }

    if (!canWriteEntity(userId, existing.ownerId)) {
      return NextResponse.json({ error: "Not found or access denied" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (visibility !== undefined) updateData.visibility = visibility;
    if (visibleUserIds !== undefined) updateData.visibleUserIds = JSON.stringify(visibleUserIds);

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
      if (parentId === id) {
        return NextResponse.json(
          { error: "A folder cannot be its own parent" },
          { status: 400 }
        );
      }

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
            where: { id: currentId },
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

    const existing = await db.noteFolder.findFirst({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: "Not found or access denied" }, { status: 404 });
    }

    if (!canWriteEntity(userId, existing.ownerId)) {
      return NextResponse.json({ error: "Not found or access denied" }, { status: 404 });
    }

    await db.noteFolder.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete folder:", error);
    return NextResponse.json({ error: "Failed to delete folder" }, { status: 500 });
  }
}
