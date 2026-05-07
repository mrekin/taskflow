import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseJsonFields } from "@/lib/api-utils";
import { getCurrentUserId, requireAuth } from "@/lib/auth-utils";
import { resolveEffectiveVisibility, canReadEntity, canWriteEntity, parseVisibleUserIds } from "@/lib/visibility";

// GET /api/areas/[id] - Get single area with projects
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const isAuthenticated = !!userId;
    if (!isAuthenticated) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const { id } = await params;
    const area = await db.area.findFirst({
      where: { id },
      include: {
        projects: {
          orderBy: { sortOrder: "asc" },
          include: {
            _count: { select: { tasks: true } },
          },
        },
      },
    });

    if (!area) {
      return NextResponse.json({ error: "Area not found" }, { status: 404 });
    }

    const effectiveVis = resolveEffectiveVisibility(area.visibility, []);
    const visibleUserIds = parseVisibleUserIds(area.visibleUserIds);
    if (!canReadEntity(userId, area.ownerId, effectiveVis, visibleUserIds, isAuthenticated)) {
      return NextResponse.json({ error: "Area not found" }, { status: 404 });
    }

    const filteredProjects = area.projects.filter((project) => {
      const projEffectiveVis = resolveEffectiveVisibility(project.visibility, [{ visibility: area.visibility, ownerId: area.ownerId }]);
      const projVisibleUserIds = parseVisibleUserIds(project.visibleUserIds);
      return canReadEntity(userId, project.ownerId, projEffectiveVis, projVisibleUserIds, isAuthenticated);
    });

    const result = {
      ...parseJsonFields(area, "area"),
      _count: { projects: filteredProjects.length },
      projects: filteredProjects.map((project) => ({
        ...parseJsonFields(project, "project"),
        _count: { tasks: project._count.tasks },
      })),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch area:", error);
    return NextResponse.json({ error: "Failed to fetch area" }, { status: 500 });
  }
}

// PUT /api/areas/[id] - Update area
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
    const { name, description, color, icon, sortOrder, metadata, tagIds, visibility, visibleUserIds } = body;

    const existing = await db.area.findFirst({ where: { id } });
    if (!existing || !canWriteEntity(userId, existing.ownerId)) {
      return NextResponse.json({ error: "Not found or access denied" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description;
    if (color !== undefined) updateData.color = color;
    if (icon !== undefined) updateData.icon = icon;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (metadata !== undefined) updateData.metadata = JSON.stringify(metadata);
    if (tagIds !== undefined) updateData.tagIds = JSON.stringify(tagIds);
    if (visibility !== undefined) updateData.visibility = visibility;
    if (visibleUserIds !== undefined) updateData.visibleUserIds = JSON.stringify(visibleUserIds);

    const area = await db.area.update({
      where: { id },
      data: updateData,
      include: {
        _count: { select: { projects: true } },
      },
    });

    return NextResponse.json({
      ...parseJsonFields(area, "area"),
      _count: { projects: area._count.projects },
    });
  } catch (error) {
    console.error("Failed to update area:", error);
    return NextResponse.json({ error: "Failed to update area" }, { status: 500 });
  }
}

// DELETE /api/areas/[id] - Delete area (cascades to projects)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ("error" in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;

    const existing = await db.area.findFirst({ where: { id } });
    if (!existing || !canWriteEntity(userId, existing.ownerId)) {
      return NextResponse.json({ error: "Not found or access denied" }, { status: 404 });
    }

    await db.area.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete area:", error);
    return NextResponse.json({ error: "Failed to delete area" }, { status: 500 });
  }
}
