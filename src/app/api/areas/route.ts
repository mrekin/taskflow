import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseJsonFields, getNextShortIdNum } from "@/lib/api-utils";
import { getCurrentUserId, requireAuth } from "@/lib/auth-utils";
import { buildVisibilityWhereClause, resolveEffectiveVisibility, canReadEntity, parseVisibleUserIds } from "@/lib/visibility";

// GET /api/areas - List all areas with project counts
export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const isAuthenticated = !!userId;
    if (!isAuthenticated) return NextResponse.json([]);

    const areas = await db.area.findMany({
      where: buildVisibilityWhereClause(userId, isAuthenticated),
      orderBy: { sortOrder: "asc" },
      include: {
        _count: { select: { projects: true } },
      },
    });

    const result = areas
      .filter((area) => {
        const effectiveVis = resolveEffectiveVisibility(area.visibility, []);
        const visibleUserIds = parseVisibleUserIds(area.visibleUserIds);
        return canReadEntity(userId, area.ownerId, effectiveVis, visibleUserIds, isAuthenticated);
      })
      .map((area) => ({
        ...parseJsonFields(area, "area"),
        _count: { projects: area._count.projects },
      }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch areas:", error);
    return NextResponse.json({ error: "Failed to fetch areas" }, { status: 500 });
  }
}

// POST /api/areas - Create new area
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if ("error" in authResult) return authResult.error;
    const { userId } = authResult;

    const body = await request.json();
    const { name, description, color, icon, metadata, tagIds, visibility, visibleUserIds } = body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const maxSortArea = await db.area.findFirst({
      where: { ownerId: userId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const shortIdNum = await getNextShortIdNum(db.area, userId);

    const area = await db.area.create({
      data: {
        name: name.trim(),
        description: description ?? null,
        color: color ?? "#6366f1",
        icon: icon ?? null,
        metadata: metadata ? JSON.stringify(metadata) : "{}",
        tagIds: tagIds ? JSON.stringify(tagIds) : "[]",
        visibility: visibility ?? null,
        visibleUserIds: JSON.stringify(visibleUserIds || []),
        shortIdNum,
        ownerId: userId,
        sortOrder: (maxSortArea?.sortOrder ?? -1) + 1,
      },
    });

    return NextResponse.json(
      { ...parseJsonFields(area, "area"), _count: { projects: 0 } },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create area:", error);
    return NextResponse.json({ error: "Failed to create area" }, { status: 500 });
  }
}
