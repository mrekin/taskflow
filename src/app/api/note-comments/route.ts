import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  requireApiAuth,
  requireTokenPermission,
  getTokenProjectScope,
  tokenAllowsProject,
  resolveEntityProjectId,
} from "@/lib/api-token";
import { NoteCommentService } from "@/services/note-comment.service";

/**
 * Inline note comments (T-190). GET ?noteId= lists comments of a note;
 * POST creates one anchored to a text range of the note content.
 * Reuses the "comments" token permission category.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.ok) return auth.response;
    const userId = auth.ctx.kind === "anonymous" ? null : auth.ctx.userId;

    const { searchParams } = new URL(request.url);
    const noteId = searchParams.get("noteId");

    if (!noteId) {
      return NextResponse.json({ error: "noteId query parameter is required" }, { status: 400 });
    }

    if (auth.ctx.kind === "token") {
      const denied = requireTokenPermission(auth.ctx.token, "comments", "read");
      if (denied) return denied;
      // Out-of-scope note reads as "no comments" (lenient shape, like task comments)
      const scope = await getTokenProjectScope(auth.ctx);
      const noteProjectId = await resolveEntityProjectId("note", noteId);
      if (!tokenAllowsProject(scope, noteProjectId)) return NextResponse.json([]);
    } else if (auth.ctx.kind === "anonymous" && !(await canAnonymousRead(noteId))) {
      return NextResponse.json([]);
    }

    const result = await NoteCommentService.listNoteComments(userId, noteId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Failed to fetch note comments:", error);
    return NextResponse.json({ error: "Failed to fetch note comments" }, { status: 500 });
  }
}

async function canAnonymousRead(noteId: string): Promise<boolean> {
  const { NoteService } = await import("@/services/note.service");
  const access = await NoteService.getReadableNote(null, noteId);
  return access.ok;
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
      // Match the service's "unknown note" contract: out-of-scope reads as not found
      const scope = await getTokenProjectScope({ userId, token });
      const noteProjectId = body.noteId ? await resolveEntityProjectId("note", body.noteId) : null;
      if (!tokenAllowsProject(scope, noteProjectId)) {
        return NextResponse.json({ error: "Note not found" }, { status: 404 });
      }
    }

    const result = await NoteCommentService.createNoteComment(userId, body);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    console.error("Failed to create note comment:", error);
    return NextResponse.json({ error: "Failed to create note comment" }, { status: 500 });
  }
}
