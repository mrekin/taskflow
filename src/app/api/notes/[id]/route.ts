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
import { cleanupAttachments } from "@/lib/attachment-cleanup";

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
      where: { id },
      include: {
        project: { select: { id: true, name: true, color: true, visibility: true, visibleUserIds: true, ownerId: true, areaId: true } },
        folder: { select: { id: true, name: true, parentId: true, visibility: true, visibleUserIds: true, ownerId: true } },
      },
    });

    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    const parentChain: Array<{ visibility: string | null; ownerId: string }> = [];

    if (note.folderId && note.folder) {
      let currentFolder: { id: string; parentId: string | null; visibility: string | null; ownerId: string } | null = note.folder as any;
      while (currentFolder) {
        parentChain.push({ visibility: currentFolder.visibility, ownerId: currentFolder.ownerId });
        if (currentFolder.parentId) {
          const parent = await db.noteFolder.findFirst({
            where: { id: currentFolder.parentId },
            select: { id: true, parentId: true, visibility: true, ownerId: true },
          });
          currentFolder = parent;
        } else {
          currentFolder = null;
        }
      }
    }

    if (note.projectId && note.project) {
      parentChain.push({ visibility: (note.project as any).visibility, ownerId: (note.project as any).ownerId });
      if ((note.project as any).areaId) {
        const area = await db.area.findFirst({
          where: { id: (note.project as any).areaId },
          select: { visibility: true, ownerId: true },
        });
        if (area) {
          parentChain.push({ visibility: area.visibility, ownerId: area.ownerId });
        }
      }
    }

    const effectiveVisibility = resolveEffectiveVisibility(note.visibility, parentChain);
    const noteVisibleUserIds = parseVisibleUserIds(note.visibleUserIds);

    if (!canReadEntity(userId, note.ownerId, effectiveVisibility, noteVisibleUserIds, !!userId)) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    const response: Record<string, unknown> = { ...parseJsonFields(note, "note") };

    if (note.project) {
      const projectParentChain: Array<{ visibility: string | null; ownerId: string }> = [];
      if ((note.project as any).areaId) {
        const area = await db.area.findFirst({
          where: { id: (note.project as any).areaId },
          select: { visibility: true, ownerId: true },
        });
        if (area) projectParentChain.push(area);
      }
      response.project = sanitizeRelation(
        note.project as any,
        (note.project as any).ownerId,
        userId,
        !!userId,
        projectParentChain,
      );
    }

    if (note.folder) {
      response.folder = sanitizeRelation(
        note.folder as any,
        (note.folder as any).ownerId,
        userId,
        !!userId,
        parentChain.filter((_, i) => i < parentChain.length),
      );
    }

    return NextResponse.json(response);
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
    const { title, content, projectId, folderId, metadata, tagIds, visibility, visibleUserIds } = body;

    const existing = await db.note.findFirst({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found or access denied" }, { status: 404 });
    }

    if (!canWriteEntity(userId, existing.ownerId)) {
      return NextResponse.json({ error: "Not found or access denied" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title.trim();
    if (content !== undefined) updateData.content = content;
    if (projectId !== undefined) updateData.projectId = projectId;
    if (folderId !== undefined) updateData.folderId = folderId;
    if (metadata !== undefined) updateData.metadata = JSON.stringify(metadata);
    if (tagIds !== undefined) updateData.tagIds = JSON.stringify(tagIds);
    if (visibility !== undefined) updateData.visibility = visibility;
    if (visibleUserIds !== undefined) updateData.visibleUserIds = JSON.stringify(visibleUserIds);

    if (title !== undefined || folderId !== undefined || projectId !== undefined) {
      const checkTitle = title !== undefined ? title.trim() : existing.title;
      const checkProjectId = projectId !== undefined ? projectId : existing.projectId;
      const checkFolderId = folderId !== undefined ? folderId : existing.folderId;
      const duplicateNote = await db.note.findFirst({
        where: {
          title: checkTitle,
          projectId: checkProjectId ?? null,
          folderId: checkFolderId ?? null,
          ownerId: userId,
          id: { not: id },
        },
      });
      if (duplicateNote) {
        return NextResponse.json({ error: "A note with this title already exists in this location" }, { status: 409 });
      }
    }

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

    const existing = await db.note.findFirst({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found or access denied" }, { status: 404 });
    }

    if (!canWriteEntity(userId, existing.ownerId)) {
      return NextResponse.json({ error: "Not found or access denied" }, { status: 404 });
    }

    await cleanupAttachments([{ id, type: 'note' }]);
    await db.note.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete note:", error);
    return NextResponse.json({ error: "Failed to delete note" }, { status: 500 });
  }
}
