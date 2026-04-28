import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseJsonFields, getNextShortIdNum } from "@/lib/api-utils";
import { getCurrentUserId, requireAuth } from "@/lib/auth-utils";
import { fireWebhookEvent, buildProjectContext } from "@/lib/webhook-engine";

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

    // Also count top-level tasks (without parentId) for each project
    const projectIds = projects.map((p) => p.id);
    const topLevelTaskCounts = await db.task.groupBy({
      by: ["projectId"],
      where: {
        ownerId: userId,
        projectId: { in: projectIds },
        parentId: null,
      },
      _count: true,
    });
    const topLevelMap = new Map(
      topLevelTaskCounts.map((r) => [r.projectId, r._count])
    );

    const result = projects.map((project) => ({
      ...parseJsonFields(project, "project"),
      _count: {
        tasks: project._count.tasks,
        topLevelTasks: topLevelMap.get(project.id) ?? 0,
        notes: project._count.notes,
      },
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
    const { name, description, color, icon, areaId, status, metadata, tagIds } = body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const maxSortProject = await db.project.findFirst({
      where: { ownerId: userId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const shortIdNum = await getNextShortIdNum(db.project, userId);

    const project = await db.project.create({
      data: {
        name: name.trim(),
        description: description ?? null,
        color: color ?? "#8b5cf6",
        icon: icon ?? null,
        status: status ?? "active",
        areaId: areaId ?? null,
        metadata: metadata ? JSON.stringify(metadata) : "{}",
        tagIds: tagIds ? JSON.stringify(tagIds) : "[]",
        shortIdNum,
        ownerId: userId,
        sortOrder: (maxSortProject?.sortOrder ?? -1) + 1,
      },
      include: {
        area: { select: { id: true, name: true, color: true } },
      },
    });

    // Fire webhook event for project creation (non-blocking)
    try {
      fireWebhookEvent(buildProjectContext(
        { id: project.id, name: project.name, shortIdNum: project.shortIdNum, areaId: project.areaId, ownerId: project.ownerId },
        'project.created'
      ));
    } catch (webhookError) {
      console.error('[Webhook] Error in project create webhook:', webhookError);
    }

    return NextResponse.json(
      { ...parseJsonFields(project, "project"), _count: { tasks: 0, notes: 0 } },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create project:", error);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
