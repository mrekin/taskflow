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
import { isPaginated, parseDateParam, parsePaginationParams, parseTagIdsParam } from "@/lib/api-utils";
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
    const dueFrom = parseDateParam(searchParams.get("dueFrom"), "dueFrom");
    if (dueFrom.error) return NextResponse.json({ error: dueFrom.error }, { status: 400 });
    const dueTo = parseDateParam(searchParams.get("dueTo"), "dueTo", true);
    if (dueTo.error) return NextResponse.json({ error: dueTo.error }, { status: 400 });
    const pagination = parsePaginationParams(searchParams);
    if (pagination.error) return NextResponse.json({ error: pagination.error }, { status: 400 });

    const filters = {
      projectId: searchParams.get("projectId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      parentId: searchParams.get("parentId") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      assigneeId: searchParams.get("assigneeId") ?? undefined,
      tagIds: parseTagIdsParam(searchParams.get("tagIds")),
      dueFrom: dueFrom.value,
      dueTo: dueTo.value,
      limit: pagination.limit,
      offset: pagination.offset,
    };

    const result = await TaskService.listTasks(userId, filters,
      restrictProjectIds ? { restrictProjectIds } : undefined);
    // Backward compat: bare array unless the client asked for pagination,
    // then the full match count travels in X-Total-Count
    if (isPaginated(pagination)) {
      return NextResponse.json(result.items, { headers: { "X-Total-Count": String(result.total) } });
    }
    return NextResponse.json(result.items);
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
