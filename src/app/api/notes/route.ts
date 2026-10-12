import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  requireApiAuth,
  requireTokenCreateAccess,
  requireTokenPermission,
  getTokenProjectScope,
} from "@/lib/api-token";
import { NoteService } from "@/services/note.service";

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
    const filters = {
      projectId: searchParams.get("projectId") ?? undefined,
      folderId: searchParams.get("folderId") ?? undefined,
    };

    const result = await NoteService.listNotes(userId, filters,
      restrictProjectIds ? { restrictProjectIds } : undefined);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch notes:", error);
    return NextResponse.json({ error: "Failed to fetch notes" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireApiAuth(request);
    if ("error" in authResult) return authResult.error;
    const { userId, token } = authResult;

    const body = await request.json();

    if (token) {
      const denied = await requireTokenCreateAccess({ userId, token }, "notes", body.projectId ?? null);
      if (denied) return denied;
    }

    const result = await NoteService.createNote(userId, body);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    console.error("Failed to create note:", error);
    return NextResponse.json({ error: "Failed to create note" }, { status: 500 });
  }
}
