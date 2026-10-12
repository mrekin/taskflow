import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  tokenCan,
  tokenHasAnyRead,
  getTokenProjectScope,
  logToken,
} from "@/lib/api-token";
import { isPublicReadonly } from "@/lib/config";
import { SyncService, type SyncViewScope } from "@/services/sync.service";

/** `since` older than this is rejected: the client is expected to full-refetch instead. */
const MAX_SINCE_AGE_MS = 24 * 60 * 60 * 1000;

function emptyPayload() {
  return {
    serverTime: new Date().toISOString(),
    truncated: false,
    changed: { areas: [], projects: [], tasks: [], notes: [], folders: [], tags: [], users: [] },
    allIds: { areas: [], projects: [], tasks: [], notes: [], folders: [], tags: [] },
  };
}

/**
 * GET /api/sync/changes?since=<ISO>&commentTaskId=<id>
 * Combined delta feed for the client auto-refresh: changed entities + full
 * visible id sets (deletion diff, optionally narrowed by the client's current
 * view via taskProjectId/taskSearch/...) in a single request per poll cycle.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.ok) return auth.response;

    if (auth.ctx.kind === "anonymous" && !isPublicReadonly()) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const userId = auth.ctx.kind === "anonymous" ? null : auth.ctx.userId;

    const { searchParams } = new URL(request.url);
    const sinceRaw = searchParams.get("since");
    const since = sinceRaw ? new Date(sinceRaw) : null;
    if (!sinceRaw || !since || Number.isNaN(since.getTime()) || Date.now() - since.getTime() > MAX_SINCE_AGE_MS) {
      return NextResponse.json({ error: "stale-since" }, { status: 400 });
    }

    const rawCommentTaskId = searchParams.get("commentTaskId") ?? undefined;
    const viewScope: SyncViewScope = {
      taskProjectId: searchParams.get("taskProjectId") ?? undefined,
      taskSearch: searchParams.get("taskSearch") ?? undefined,
      noteProjectId: searchParams.get("noteProjectId") ?? undefined,
      folderProjectId: searchParams.get("folderProjectId") ?? undefined,
      projectAreaId: searchParams.get("projectAreaId") ?? undefined,
    };

    if (auth.ctx.kind === "token") {
      const token = auth.ctx.token;
      if (!tokenHasAnyRead(token)) {
        logToken(`"${token.name}" (${token.tokenPrefix}): missing any read permission for sync`);
        return NextResponse.json({ error: "API token missing permission: read" }, { status: 403 });
      }
      const scope = await getTokenProjectScope(auth.ctx);
      if (scope.size === 0) {
        // Mirror GET /api/tasks: an empty scope sees nothing at all
        return NextResponse.json(emptyPayload());
      }
      // Sections follow the same permission gates as their own GET routes
      if (rawCommentTaskId && !tokenCan(token, "comments", "read")) {
        logToken(`"${token.name}" (${token.tokenPrefix}): commentTaskId ignored, missing comments:read`);
      }
      const payload = await SyncService.getChanges(userId, {
        since,
        restrictProjectIds: [...scope],
        commentTaskId: rawCommentTaskId && tokenCan(token, "comments", "read") ? rawCommentTaskId : undefined,
        viewScope,
      });
      if (!tokenCan(token, "tasks", "read")) {
        payload.changed.tasks = [];
        payload.allIds.tasks = [];
      }
      if (!tokenCan(token, "notes", "read")) {
        payload.changed.notes = [];
        payload.changed.folders = [];
        payload.allIds.notes = [];
        payload.allIds.folders = [];
      }
      return NextResponse.json(payload);
    }

    const payload = await SyncService.getChanges(userId, { since, commentTaskId: rawCommentTaskId, viewScope });
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Failed to fetch sync changes:", error);
    return NextResponse.json({ error: "Failed to fetch sync changes" }, { status: 500 });
  }
}
