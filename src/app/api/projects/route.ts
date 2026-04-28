import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseJsonFields } from "@/lib/api-utils";
import { getCurrentUserId, requireAuth } from "@/lib/auth-utils";

// GET /api/projects - List projects with task counts
export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return NextResponse.json([]);

    const { searchParams } = new URL(request.url);
    const areaId = searchParams.get("areaId") ?? undefined;

    const projects = await db.project.findMany({
      where: {
        ownerId: userId,
        ...(areaId ? { areaId } : {}),
      },
      orderBy: { sortOrder: "asc" },
      include: {
        _count: { select: { tasks: true, notes: true } },
        area: { select: { id: true, name: true, color: true } },
      },
    });

    const result = projects.map((project) => ({
      ...parseJsonFields(project),
      _count: { tasks: project._count.tasks, notes: project._count.notes },
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch projects:", error);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}

// POST /api/projects - Create new project
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if ("error" in authResult) return authResult.error;
    const { userId } = authResult;

    const body = await request.json();
    const { name, description, color, icon, areaId, metadata, tagIds } = body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const maxSortProject = await db.project.findFirst({
      where: { ownerId: userId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const project = await db.project.create({
      data: {
        name: name.trim(),
        description: description ?? null,
        color: color ?? "#8b5cf6",
        icon: icon ?? null,
        areaId: areaId ?? null,
        metadata: metadata ? JSON.stringify(metadata) : "{}",
        tagIds: tagIds ? JSON.stringify(tagIds) : "[]",
        ownerId: userId,
        sortOrder: (maxSortProject?.sortOrder ?? -1) + 1,
      },
      include: {
        area: { select: { id: true, name: true, color: true } },
      },
    });

    return NextResponse.json(
      { ...parseJsonFields(project), _count: { tasks: 0, notes: 0 } },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create project:", error);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
