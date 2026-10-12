import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  tokenCan,
  tokenHasAnyRead,
  getTokenProjectScope,
  logToken,
} from "@/lib/api-token";
import { TaskService } from "@/services/task.service";
import { NoteService } from "@/services/note.service";
import { ProjectService } from "@/services/project.service";

const DEFAULT_SECTION_LIMIT = 20;
const MAX_SECTION_LIMIT = 100;
const MAX_QUERY_LENGTH = 200;

/**
 * Global search across tasks, notes, folders and projects in one call.
 * Sections the caller has no permission for are omitted (token case);
 * otherwise empty sections come back as []. Tasks reuse the /api/tasks
 * `search` matching, notes/folders the /api/notes/search matching.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    if (!q) {
      return NextResponse.json({ error: "q query parameter is required" }, { status: 400 });
    }
    const search = q.slice(0, MAX_QUERY_LENGTH);

    const limitParam = searchParams.get("limit");
    let limit = DEFAULT_SECTION_LIMIT;
    if (limitParam !== null) {
      const parsed = Number(limitParam);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_SECTION_LIMIT) {
        return NextResponse.json(
          { error: `Invalid limit: "${limitParam}" (integer 1..${MAX_SECTION_LIMIT})` },
          { status: 400 },
        );
      }
      limit = parsed;
    }

    if (auth.ctx.kind === "anonymous") {
      return NextResponse.json({ q: search, tasks: [], notes: [], folders: [], projects: [] });
    }
    const userId = auth.ctx.userId;

    let taskAllowed = true;
    let noteAllowed = true;
    let anyRead = true;
    let restrictProjectIds: string[] | undefined;
    if (auth.ctx.kind === "token") {
      const { token } = auth.ctx;
      taskAllowed = tokenCan(token, "tasks", "read");
      noteAllowed = tokenCan(token, "notes", "read");
      anyRead = tokenHasAnyRead(token);
      if (!taskAllowed && !noteAllowed) {
        logToken(`"${token.name}" (${token.tokenPrefix}): missing tasks/notes read permission for search`);
        return NextResponse.json({ error: "API token missing permission: read" }, { status: 403 });
      }
      const scope = await getTokenProjectScope(auth.ctx);
      if (scope.size === 0) {
        return NextResponse.json({ q: search, tasks: [], notes: [], folders: [], projects: [] });
      }
      restrictProjectIds = [...scope];
    }

    const taskOpts = restrictProjectIds ? { restrictProjectIds } : undefined;
    const result: Record<string, unknown> = { q: search };

    if (taskAllowed) {
      const tasks = await TaskService.listTasks(userId, { search }, taskOpts);
      result.tasks = tasks.items.slice(0, limit);
    }
    if (noteAllowed) {
      const matches = await NoteService.searchNotes(userId, { search }, taskOpts);
      result.notes = matches.notes.slice(0, limit);
      result.folders = matches.folders.slice(0, limit);
    }
    if (anyRead) {
      const projects = await ProjectService.listProjects(userId);
      const searchLower = search.toLowerCase();
      // listProjects spreads parsed fields, so `id`/`name` exist at runtime but are not in the inferred type
      const plain = projects as unknown as Array<{ id: string; name?: string }>;
      result.projects = plain
        .filter((p) => (p.name ?? "").toLowerCase().includes(searchLower))
        .filter((p) => !restrictProjectIds || restrictProjectIds.includes(p.id))
        .slice(0, limit);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to search:", error);
    return NextResponse.json({ error: "Failed to search" }, { status: 500 });
  }
}
