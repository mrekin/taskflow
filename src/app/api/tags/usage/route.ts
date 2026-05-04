import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth-utils";

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return NextResponse.json({});

    const tagIds = new Map<string, number>();

    const countTag = (raw: string | null) => {
      const ids: string[] = JSON.parse(raw || "[]");
      for (const id of ids) {
        tagIds.set(id, (tagIds.get(id) ?? 0) + 1);
      }
    };

    const [areas, projects, tasks, notes] = await Promise.all([
      db.area.findMany({ where: { ownerId: userId }, select: { tagIds: true } }),
      db.project.findMany({ where: { ownerId: userId }, select: { tagIds: true } }),
      db.task.findMany({ where: { ownerId: userId }, select: { tagIds: true } }),
      db.note.findMany({ where: { ownerId: userId }, select: { tagIds: true } }),
    ]);

    for (const e of areas) countTag(e.tagIds);
    for (const e of projects) countTag(e.tagIds);
    for (const e of tasks) countTag(e.tagIds);
    for (const e of notes) countTag(e.tagIds);

    const result: Record<string, number> = {};
    for (const [id, count] of tagIds) {
      result[id] = count;
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch tag usage:", error);
    return NextResponse.json({ error: "Failed to fetch tag usage" }, { status: 500 });
  }
}
