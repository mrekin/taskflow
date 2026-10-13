import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, ensureNoBearer } from "@/lib/api-token";
import { requireAuth } from "@/lib/auth-utils";
import { ReleaseService } from "@/services/release.service";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.ok) return auth.response;
    // Read-only for API tokens (mutations below stay session-only); visibility
    // is resolved by ReleaseService from the requesting user
    const userId = auth.ctx.kind === "anonymous" ? null : auth.ctx.userId;

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId") ?? undefined;

    const releases = await ReleaseService.listReleases(userId, { projectId });
    return NextResponse.json(releases);
  } catch (error) {
    console.error("Failed to fetch releases:", error);
    return NextResponse.json({ error: "Failed to fetch releases" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const blocked = await ensureNoBearer(request);
    if (blocked) return blocked;
    const authResult = await requireAuth();
    if ("error" in authResult) return authResult.error;
    const { userId } = authResult;

    const body = await request.json();
    const result = await ReleaseService.createRelease(userId, body);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    console.error("Failed to create release:", error);
    return NextResponse.json({ error: "Failed to create release" }, { status: 500 });
  }
}
