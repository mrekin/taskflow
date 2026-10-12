import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  requireApiAuth,
  tokenHasAnyRead,
  logToken,
} from "@/lib/api-token";
import { TagService } from "@/services/tag.service";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.ok) return auth.response;
    const userId = auth.ctx.kind === "anonymous" ? null : auth.ctx.userId;

    if (auth.ctx.kind === "token" && !tokenHasAnyRead(auth.ctx.token)) {
      // Tags are user-level metadata: any read permission unlocks the list, no project filter
      logToken(`"${auth.ctx.token.name}" (${auth.ctx.token.tokenPrefix}): missing any read permission for tags`);
      return NextResponse.json({ error: "API token missing permission: read" }, { status: 403 });
    }

    const result = await TagService.listTags(userId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch tags:", error);
    return NextResponse.json({ error: "Failed to fetch tags" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireApiAuth(request);
    if ("error" in authResult) return authResult.error;
    const { userId, token } = authResult;

    if (token) {
      // Tag management is not exposed to API tokens (user-level, no project scope)
      return NextResponse.json({ error: "API tokens are not allowed on this endpoint" }, { status: 403 });
    }

    const body = await request.json();
    const result = await TagService.createTag(userId, body);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    console.error("Failed to create tag:", error);
    return NextResponse.json({ error: "Failed to create tag" }, { status: 500 });
  }
}
