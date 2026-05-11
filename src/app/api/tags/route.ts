import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserId, requireAuth } from "@/lib/auth-utils";
import { buildVisibilityWhereClause } from "@/lib/visibility";

// GET /api/tags - List all tags for owner + tags from visible entities
export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const isAuthenticated = !!userId;
    if (!isAuthenticated) return NextResponse.json([]);

    const ownTags = await db.tag.findMany({
      where: { ownerId: userId },
    });

    const visibleProjects = await db.project.findMany({
      where: buildVisibilityWhereClause(userId, isAuthenticated),
      select: { tagIds: true },
    });
    const visibleAreas = await db.area.findMany({
      where: buildVisibilityWhereClause(userId, isAuthenticated),
      select: { tagIds: true },
    });
    const visibleTasks = await db.task.findMany({
      where: buildVisibilityWhereClause(userId, isAuthenticated),
      select: { tagIds: true },
    });
    const visibleNotes = await db.note.findMany({
      where: buildVisibilityWhereClause(userId, isAuthenticated),
      select: { tagIds: true },
    });

    const tagIdSet = new Set(ownTags.map((t) => t.id));
    for (const entity of [...visibleProjects, ...visibleAreas, ...visibleTasks, ...visibleNotes]) {
      try {
        const ids: string[] = JSON.parse(entity.tagIds || "[]");
        for (const id of ids) {
          if (typeof id === "string") tagIdSet.add(id);
        }
      } catch {
        // ignore parse errors
      }
    }

    const tags = tagIdSet.size > 0
      ? await db.tag.findMany({
          where: { id: { in: [...tagIdSet] } },
          orderBy: { name: "asc" },
        })
      : [];

    return NextResponse.json(tags);
  } catch (error) {
    console.error("Failed to fetch tags:", error);
    return NextResponse.json({ error: "Failed to fetch tags" }, { status: 500 });
  }
}

// POST /api/tags - Create a new tag
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if ("error" in authResult) return authResult.error;
    const { userId } = authResult;

    const body = await request.json();
    const { name, color } = body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Check for duplicate name for same owner
    const existing = await db.tag.findFirst({
      where: { name: name.trim(), ownerId: userId },
    });

    if (existing) {
      return NextResponse.json(
        { error: "A tag with this name already exists" },
        { status: 409 }
      );
    }

    const tag = await db.tag.create({
      data: {
        name: name.trim(),
        color: color ?? "#6366f1",
        ownerId: userId,
      },
    });

    return NextResponse.json(tag, { status: 201 });
  } catch (error) {
    console.error("Failed to create tag:", error);
    return NextResponse.json({ error: "Failed to create tag" }, { status: 500 });
  }
}
