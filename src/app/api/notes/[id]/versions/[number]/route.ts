import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  requireApiAuth,
  requireTokenEntityAccess,
} from "@/lib/api-token";
import { NoteVersionService } from "@/services/note-version.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; number: string }> }
) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.ok) return auth.response;
    const userId = auth.ctx.kind === "anonymous" ? null : auth.ctx.userId;

    const { id, number } = await params;
    const num = parseInt(number, 10);
    if (!Number.isFinite(num)) {
      return NextResponse.json({ error: "Invalid version number" }, { status: 400 });
    }

    if (auth.ctx.kind === "token") {
      const denied = await requireTokenEntityAccess(auth.ctx, "notes", "read", "note", id);
      if (denied) return denied;
    }

    const result = await NoteVersionService.getVersion(userId, id, num);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Failed to fetch note version:", error);
    return NextResponse.json({ error: "Failed to fetch version" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; number: string }> }
) {
  try {
    const authResult = await requireApiAuth(request);
    if ("error" in authResult) return authResult.error;
    const { userId, token } = authResult;

    const { id, number } = await params;
    const num = parseInt(number, 10);
    if (!Number.isFinite(num)) {
      return NextResponse.json({ error: "Invalid version number" }, { status: 400 });
    }

    if (token) {
      const denied = await requireTokenEntityAccess({ userId, token }, "notes", "update", "note", id);
      if (denied) return denied;
    }

    const { kept } = await request.json();
    if (typeof kept !== "boolean") {
      return NextResponse.json({ error: "kept must be a boolean" }, { status: 400 });
    }

    const result = await NoteVersionService.setKept(userId, id, num, kept);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Failed to update note version:", error);
    return NextResponse.json({ error: "Failed to update version" }, { status: 500 });
  }
}
