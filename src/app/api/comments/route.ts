import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  requireApiAuth,
  requireTokenPermission,
  getTokenProjectScope,
  tokenAllowsProject,
  resolveEntityProjectId,
} from "@/lib/api-token";
import { CommentService } from "@/services/comment.service";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.ok) return auth.response;
    const userId = auth.ctx.kind === "anonymous" ? null : auth.ctx.userId;

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId");

    if (!taskId) {
      return NextResponse.json({ error: "taskId query parameter is required" }, { status: 400 });
    }

    if (auth.ctx.kind === "token") {
      const denied = requireTokenPermission(auth.ctx.token, "comments", "read");
      if (denied) return denied;
      // Keep the service's lenient shape: out-of-scope task looks like "no comments"
      const scope = await getTokenProjectScope(auth.ctx);
      const taskProjectId = await resolveEntityProjectId("task", taskId);
      if (!tokenAllowsProject(scope, taskProjectId)) return NextResponse.json([]);
    } else if (auth.ctx.kind === "anonymous") {
      return NextResponse.json([]);
    }

    const result = await CommentService.listComments(userId, taskId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Failed to fetch comments:", error);
    return NextResponse.json({ error: "Failed to fetch comments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireApiAuth(request);
    if ("error" in authResult) return authResult.error;
    const { userId, token } = authResult;

    const body = await request.json();

    if (token) {
      const permDenied = requireTokenPermission(token, "comments", "create");
      if (permDenied) return permDenied;
      // Match the service's "unknown task" contract: out-of-scope reads as not found
      const scope = await getTokenProjectScope({ userId, token });
      const taskProjectId = body.taskId ? await resolveEntityProjectId("task", body.taskId) : null;
      if (!tokenAllowsProject(scope, taskProjectId)) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 });
      }
    }

    const result = await CommentService.createComment(userId, body);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    console.error("Failed to create comment:", error);
    return NextResponse.json({ error: "Failed to create comment" }, { status: 500 });
  }
}
