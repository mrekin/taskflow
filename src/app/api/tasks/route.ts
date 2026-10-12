import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-utils";
import {
  authenticateRequest,
  requireApiAuth,
  requireTokenCreateAccess,
  requireTokenEntityAccess,
  requireTokenPermission,
  getTokenProjectScope,
  resolveEntityProjectId,
} from "@/lib/api-token";
import { TaskService } from "@/services/task.service";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.ok) return auth.response;

    let restrictProjectIds: string[] | undefined;
    if (auth.ctx.kind === "token") {
      const denied = requireTokenPermission(auth.ctx.token, "tasks", "read");
      if (denied) return denied;
      const scope = await getTokenProjectScope(auth.ctx);
      if (scope.size === 0) return NextResponse.json([]);
      restrictProjectIds = [...scope];
    } else if (auth.ctx.kind === "anonymous") {
      return NextResponse.json([]);
    }
    const userId = auth.ctx.userId;

    const { searchParams } = new URL(request.url);
    const filters = {
      projectId: searchParams.get("projectId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      parentId: searchParams.get("parentId") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      assigneeId: searchParams.get("assigneeId") ?? undefined,
    };

    const result = await TaskService.listTasks(userId, filters,
      restrictProjectIds ? { restrictProjectIds } : undefined);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch tasks:", error);
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireApiAuth(request);
    if ("error" in authResult) return authResult.error;
    const { userId, token } = authResult;

    const body = await request.json();

    if (token) {
      // A subtask without an explicit project inherits the parent task's project
      const targetProjectId = body.projectId ?? (body.parentId ? await resolveEntityProjectId("task", body.parentId) : null);
      const denied = await requireTokenCreateAccess({ userId, token }, "tasks", targetProjectId);
      if (denied) return denied;
    }

    const result = await TaskService.createTask(userId, body);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    console.error("Failed to create task:", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
