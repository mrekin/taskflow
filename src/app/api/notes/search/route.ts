import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
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
      if (scope.size === 0) return NextResponse.json({ notes: [], folders: [] });
      restrictProjectIds = [...scope];
    } else if (auth.ctx.kind === "anonymous") {
      return NextResponse.json({ notes: [], folders: [] });
    }
    const userId = auth.ctx.userId;

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId") ?? undefined;
    const folderId = searchParams.get("folderId") ?? undefined;
    const search = searchParams.get("search") ?? undefined;

    if (!search) {
      return NextResponse.json({ notes: [], folders: [] });
    }

    const result = await NoteService.searchNotes(userId, { search, projectId, folderId },
      restrictProjectIds ? { restrictProjectIds } : undefined);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to search notes:", error);
    return NextResponse.json({ error: "Failed to search notes" }, { status: 500 });
  }
}
