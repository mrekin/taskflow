import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, requireAuth } from "@/lib/auth-utils";
import { TaskService } from "@/services/task.service";

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return NextResponse.json([]);

    const { searchParams } = new URL(request.url);
    const filters = {
      projectId: searchParams.get("projectId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      parentId: searchParams.get("parentId") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      assigneeId: searchParams.get("assigneeId") ?? undefined,
    };

    const result = await TaskService.listTasks(userId, filters);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch tasks:", error);
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if ("error" in authResult) return authResult.error;
    const { userId } = authResult;

    const body = await request.json();
    const result = await TaskService.createTask(userId, body);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    console.error("Failed to create task:", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
