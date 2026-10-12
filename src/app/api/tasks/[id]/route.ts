import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth-utils";
import {
  authenticateRequest,
  requireApiAuth,
  requireTokenEntityAccess,
} from "@/lib/api-token";
import { TaskService } from "@/services/task.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.ok) return auth.response;
    const userId = auth.ctx.kind === "anonymous" ? null : auth.ctx.userId;

    if (auth.ctx.kind === "token") {
      const { id } = await params;
      const denied = await requireTokenEntityAccess(auth.ctx, "tasks", "read", "task", id);
      if (denied) return denied;
    }

    const { id } = await params;
    const result = await TaskService.getTask(userId, id);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Failed to fetch task:", error);
    return NextResponse.json({ error: "Failed to fetch task" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiAuth(request);
    if ("error" in authResult) return authResult.error;
    const { userId, token } = authResult;

    const { id } = await params;
    const body = await request.json();

    if (token) {
      // Also validate the move target when the task is being moved to another project
      const denied = await requireTokenEntityAccess(
        { userId, token }, "tasks", "update", "task", id,
        body.projectId !== undefined ? body.projectId : undefined,
      );
      if (denied) return denied;
    }

    const result = await TaskService.updateTask(userId, id, body);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Failed to update task:", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiAuth(request);
    if ("error" in authResult) return authResult.error;
    const { userId, token } = authResult;

    if (token) {
      const { id } = await params;
      const denied = await requireTokenEntityAccess({ userId, token }, "tasks", "delete", "task", id);
      if (denied) return denied;
    }

    const { id } = await params;
    const result = await TaskService.deleteTask(userId, id);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Failed to delete task:", error);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
