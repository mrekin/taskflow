import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  requireApiAuth,
  requireTokenPermission,
  tokenHasAnyRead,
  getTokenProjectScope,
  logToken,
} from "@/lib/api-token";
import { ProjectService } from "@/services/project.service";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.ok) return auth.response;
    const userId = auth.ctx.kind === "anonymous" ? null : auth.ctx.userId;

    let scope: Set<string> | null = null;
    if (auth.ctx.kind === "token") {
      if (!tokenHasAnyRead(auth.ctx.token)) {
        logToken(`"${auth.ctx.token.name}" (${auth.ctx.token.tokenPrefix}): missing any read permission for projects`);
        return NextResponse.json({ error: "API token missing permission: read" }, { status: 403 });
      }
      // 'all' scope resolves to the user's visible projects, 'projects' to the stored
      // intersection — either way the same post-filter yields the scoped list
      scope = await getTokenProjectScope(auth.ctx);
    }

    const { searchParams } = new URL(request.url);
    const areaId = searchParams.get("areaId") ?? undefined;

    const result = await ProjectService.listProjects(userId, areaId);
    // listProjects spreads parsed fields, so `id` exists at runtime but is not in the inferred type
    const data = scope ? result.filter((p) => scope!.has(((p as unknown as { id: string }).id))) : result;
    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to fetch projects:", error);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireApiAuth(request);
    if ("error" in authResult) return authResult.error;
    const { userId, token } = authResult;

    if (token) {
      // Project management is not exposed to API tokens
      return NextResponse.json({ error: "API tokens are not allowed on this endpoint" }, { status: 403 });
    }

    const body = await request.json();
    const result = await ProjectService.createProject(userId, body);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    console.error("Failed to create project:", error);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
