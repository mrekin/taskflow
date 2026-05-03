import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseJsonFields } from "@/lib/api-utils";
import { getCurrentUserId } from "@/lib/auth-utils";

function getDescendantFolderIds(
  allFolders: { id: string; parentId: string | null }[],
  rootFolderId: string | null,
): Set<string> {
  const result = new Set<string>();
  if (rootFolderId === null) {
    for (const f of allFolders) result.add(f.id);
    return result;
  }
  const queue = [rootFolderId];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    result.add(currentId);
    for (const f of allFolders) {
      if (f.parentId === currentId) queue.push(f.id);
    }
  }
  return result;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return NextResponse.json({ notes: [], folders: [] });

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId") ?? undefined;
    const folderId = searchParams.get("folderId") ?? undefined;
    const search = searchParams.get("search") ?? undefined;

    if (!search) {
      return NextResponse.json({ notes: [], folders: [] });
    }

    const searchLower = search.toLowerCase();

    const noteShortIdMatch = search.match(/^N-(\d+)$/i);
    const noteShortIdNum = noteShortIdMatch ? parseInt(noteShortIdMatch[1], 10) : null;

    const folderShortIdMatch = search.match(/^F-(\d+)$/i);
    const folderShortIdNum = folderShortIdMatch ? parseInt(folderShortIdMatch[1], 10) : null;

    const dateMatch = search.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    const dateStart = dateMatch
      ? new Date(`${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}T00:00:00.000Z`)
      : null;
    const dateEnd = dateStart ? new Date(dateStart.getTime() + 86400000) : null;

    const partialDateMatch = search.match(/^(\d{4})$/);
    const yearStart = partialDateMatch ? new Date(`${partialDateMatch[1]}-01-01T00:00:00.000Z`) : null;
    const yearEnd = yearStart ? new Date(`${parseInt(partialDateMatch![1]) + 1}-01-01T00:00:00.000Z`) : null;

    // Get folder tree for scoping
    const allFolders = await db.noteFolder.findMany({
      where: {
        ownerId: userId,
        ...(projectId ? { projectId } : {}),
      },
      select: { id: true, parentId: true, shortIdNum: true },
    });

    const scopeIds = getDescendantFolderIds(allFolders, folderId ?? null);

    // For folders: exclude the root folder itself from search results
    const folderScopeIds = new Set(scopeIds);
    if (folderId) folderScopeIds.delete(folderId);

    // Fetch all notes in scope, filter in JS for case-insensitive Unicode
    const noteWhereBase: Record<string, unknown> = {
      ownerId: userId,
      ...(projectId ? { projectId } : {}),
    };

    if (folderId) {
      noteWhereBase.folderId = { in: Array.from(scopeIds) };
    }

    const allScopedNotes = await db.note.findMany({
      where: noteWhereBase,
      orderBy: { updatedAt: "desc" },
      include: {
        project: { select: { id: true, name: true, color: true } },
        folder: { select: { id: true, name: true, parentId: true } },
      },
    });

    const matchedNotes = allScopedNotes.filter((n) => {
      if (n.title.toLowerCase().includes(searchLower)) return true;
      if (n.content.toLowerCase().includes(searchLower)) return true;
      if (noteShortIdNum !== null && n.shortIdNum === noteShortIdNum) return true;
      if (dateStart && dateEnd) {
        const created = new Date(n.createdAt);
        const updated = new Date(n.updatedAt);
        if (created >= dateStart && created < dateEnd) return true;
        if (updated >= dateStart && updated < dateEnd) return true;
      }
      if (yearStart && yearEnd) {
        const created = new Date(n.createdAt);
        const updated = new Date(n.updatedAt);
        if (created >= yearStart && created < yearEnd) return true;
        if (updated >= yearStart && updated < yearEnd) return true;
      }
      return false;
    });

    // Fetch all folders in scope, filter in JS for case-insensitive Unicode
    const allScopedFolders = await db.noteFolder.findMany({
      where: {
        id: { in: Array.from(folderScopeIds) },
        ownerId: userId,
        ...(projectId ? { projectId } : {}),
      },
      orderBy: { sortOrder: "asc" },
      include: {
        parent: { select: { id: true, name: true, parentId: true } },
        _count: { select: { children: true, notes: true } },
      },
    });

    const matchedFolders = allScopedFolders.filter((f) => {
      if (f.name.toLowerCase().includes(searchLower)) return true;
      if (folderShortIdNum !== null && f.shortIdNum === folderShortIdNum) return true;
      return false;
    });

    return NextResponse.json({
      notes: matchedNotes.map((n) => parseJsonFields(n, "note")),
      folders: matchedFolders.map((f) => parseJsonFields(f, "folder")),
    });
  } catch (error) {
    console.error("Failed to search notes:", error);
    return NextResponse.json({ error: "Failed to search notes" }, { status: 500 });
  }
}
