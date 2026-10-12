import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  authenticateRequest,
  requireApiAuth,
  tokenHasAnyRead,
  getTokenProjectScope,
  logToken,
} from "@/lib/api-token";
import { AreaService } from "@/services/area.service";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.ok) return auth.response;
    const userId = auth.ctx.kind === "anonymous" ? null : auth.ctx.userId;

    if (auth.ctx.kind === "token" && !tokenHasAnyRead(auth.ctx.token)) {
      logToken(`"${auth.ctx.token.name}" (${auth.ctx.token.tokenPrefix}): missing any read permission for areas`);
      return NextResponse.json({ error: "API token missing permission: read" }, { status: 403 });
    }

    const result = await AreaService.listAreas(userId);

    if (auth.ctx.kind === "token") {
      // Only areas that contain at least one in-scope project
      const scope = await getTokenProjectScope(auth.ctx);
      const projects = await db.project.findMany({
        where: { id: { in: [...scope] } },
        select: { id: true, areaId: true },
      });
      const areaIds = new Set(projects.map((p) => p.areaId).filter((id): id is string => !!id));
      // listAreas spreads parsed fields, so `id` exists at runtime but is not in the inferred type
      return NextResponse.json(result.filter((a) => areaIds.has(((a as unknown as { id: string }).id))));
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch areas:", error);
    return NextResponse.json({ error: "Failed to fetch areas" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireApiAuth(request);
    if ("error" in authResult) return authResult.error;
    const { userId, token } = authResult;

    if (token) {
      // Area management is not exposed to API tokens
      return NextResponse.json({ error: "API tokens are not allowed on this endpoint" }, { status: 403 });
    }

    const body = await request.json();
    const result = await AreaService.createArea(userId, body);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    console.error("Failed to create area:", error);
    return NextResponse.json({ error: "Failed to create area" }, { status: 500 });
  }
}
