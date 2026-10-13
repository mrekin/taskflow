import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-utils";
import { authenticateRequest, ensureNoBearer } from "@/lib/api-token";
import { ReleaseService } from "@/services/release.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.ok) return auth.response;
    // Read-only for API tokens (mutations below stay session-only)
    const userId = auth.ctx.kind === "anonymous" ? null : auth.ctx.userId;
    const { id } = await params;
    const result = await ReleaseService.getRelease(userId, id);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Failed to fetch release:", error);
    return NextResponse.json({ error: "Failed to fetch release" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const blocked = await ensureNoBearer(request);
    if (blocked) return blocked;
    const authResult = await requireAuth();
    if ("error" in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;
    const body = await request.json();
    const result = await ReleaseService.updateRelease(userId, id, body);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Failed to update release:", error);
    return NextResponse.json({ error: "Failed to update release" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const blocked = await ensureNoBearer(request);
    if (blocked) return blocked;
    const authResult = await requireAuth();
    if ("error" in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;
    const result = await ReleaseService.deleteRelease(userId, id);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Failed to delete release:", error);
    return NextResponse.json({ error: "Failed to delete release" }, { status: 500 });
  }
}
