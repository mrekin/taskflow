import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-utils";

// PUT /api/tags/[id] - Update a tag
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
    const { name, color } = body;

    const existing = await db.tag.findFirst({ where: { id, ownerId: userId } });
    if (!existing) {
      return NextResponse.json({ error: "Not found or access denied" }, { status: 404 });
    }

    // If name is being changed, check for duplicate
    if (name !== undefined && name.trim() !== existing.name) {
      const duplicate = await db.tag.findFirst({
        where: { name: name.trim(), ownerId: userId },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: "A tag with this name already exists" },
          { status: 409 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (color !== undefined) updateData.color = color;

    const tag = await db.tag.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(tag);
  } catch (error) {
    console.error("Failed to update tag:", error);
    return NextResponse.json({ error: "Failed to update tag" }, { status: 500 });
  }
}

// DELETE /api/tags/[id] - Delete a tag and clean up tagIds in all entities
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ("error" in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;

    const existing = await db.tag.findFirst({ where: { id, ownerId: userId } });
    if (!existing) {
      return NextResponse.json({ error: "Not found or access denied" }, { status: 404 });
    }

    await db.tag.delete({ where: { id } });

    // Clean up tagIds in all entities - remove this tag's ID
    const tagId = id;

    const areas = await db.area.findMany({ where: { ownerId: userId } });
    for (const area of areas) {
      const ids: string[] = JSON.parse(area.tagIds || "[]");
      if (ids.includes(tagId)) {
        await db.area.update({
          where: { id: area.id },
          data: { tagIds: JSON.stringify(ids.filter((i) => i !== tagId)) },
        });
      }
    }

    const projects = await db.project.findMany({ where: { ownerId: userId } });
    for (const project of projects) {
      const ids: string[] = JSON.parse(project.tagIds || "[]");
      if (ids.includes(tagId)) {
        await db.project.update({
          where: { id: project.id },
          data: { tagIds: JSON.stringify(ids.filter((i) => i !== tagId)) },
        });
      }
    }

    const tasks = await db.task.findMany({ where: { ownerId: userId } });
    for (const task of tasks) {
      const ids: string[] = JSON.parse(task.tagIds || "[]");
      if (ids.includes(tagId)) {
        await db.task.update({
          where: { id: task.id },
          data: { tagIds: JSON.stringify(ids.filter((i) => i !== tagId)) },
        });
      }
    }

    const notes = await db.note.findMany({ where: { ownerId: userId } });
    for (const note of notes) {
      const ids: string[] = JSON.parse(note.tagIds || "[]");
      if (ids.includes(tagId)) {
        await db.note.update({
          where: { id: note.id },
          data: { tagIds: JSON.stringify(ids.filter((i) => i !== tagId)) },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete tag:", error);
    return NextResponse.json({ error: "Failed to delete tag" }, { status: 500 });
  }
}
