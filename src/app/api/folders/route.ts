import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  requireApiAuth,
  requireTokenCreateAccess,
  requireTokenPermission,
  getTokenProjectScope,
} from "@/lib/api-token";
import { isPaginated, parsePaginationParams } from "@/lib/api-utils";
import { FolderService } from "@/services/folder.service";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.ok) return auth.response;

    let restrictProjectIds: string[] | undefined;
    if (auth.ctx.kind === "token") {
      const denied = requireTokenPermission(auth.ctx.token, "notes", "read");
      if (denied) return denied;
      const scope = await getTokenProjectScope(auth.ctx);
      if (scope.size === 0) return NextResponse.json([]);
      restrictProjectIds = [...scope];
    } else if (auth.ctx.kind === "anonymous") {
      return NextResponse.json([]);
    }
    const userId = auth.ctx.userId;

    const { searchParams } = new URL(request.url);
    const pagination = parsePaginationParams(searchParams);
    if (pagination.error) return NextResponse.json({ error: pagination.error }, { status: 400 });

    const filters = {
      projectId: searchParams.get("projectId") ?? undefined,
      parentId: searchParams.get("parentId") ?? undefined,
      limit: pagination.limit,
      offset: pagination.offset,
    };

    const result = await FolderService.listFolders(userId, filters,
      restrictProjectIds ? { restrictProjectIds } : undefined);
    // Backward compat: bare array unless the client asked for pagination,
    // then the full match count travels in X-Total-Count
    if (isPaginated(pagination)) {
      return NextResponse.json(result.items, { headers: { "X-Total-Count": String(result.total) } });
    }
    return NextResponse.json(result.items);
  } catch (error) {
    console.error("Failed to fetch folders:", error);
    return NextResponse.json({ error: "Failed to fetch folders" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireApiAuth(request);
    if ("error" in authResult) return authResult.error;
    const { userId, token } = authResult;

    const body = await request.json();

    if (token) {
      // Folders follow notes permissions 1:1 (create)
      const denied = await requireTokenCreateAccess({ userId, token }, "notes", body.projectId ?? null);
      if (denied) return denied;
    }

    const result = await FolderService.createFolder(userId, body);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    console.error("Failed to create folder:", error);
    return NextResponse.json({ error: "Failed to create folder" }, { status: 500 });
  }
}
