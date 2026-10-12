import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, tokenHasAnyRead, logToken } from "@/lib/api-token";
import { db } from "@/lib/db";
import {
  parseStatusesEnv,
  resolveStatuses,
  type StatusConfig,
} from "@/lib/constants";

function parseStatuses(value: unknown): StatusConfig[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return value as StatusConfig[];
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.ok) return auth.response;

    if (auth.ctx.kind === "anonymous") {
      // The set is a property of the user (what their settings screen shows)
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if (auth.ctx.kind === "token" && !tokenHasAnyRead(auth.ctx.token)) {
      // Statuses are user-level metadata: any read permission unlocks them, no project filter
      logToken(`"${auth.ctx.token.name}" (${auth.ctx.token.tokenPrefix}): missing any read permission for statuses`);
      return NextResponse.json({ error: "API token missing permission: read" }, { status: 403 });
    }

    const userId = auth.ctx.userId;
    const user = await db.user.findUnique({ where: { id: userId }, select: { metadata: true } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    let metadata: Record<string, unknown> = {};
    try {
      metadata = JSON.parse(user.metadata || "{}");
    } catch {
      metadata = {};
    }

    // Same resolution the settings screen shows: the user's own columns win,
    // then the installation's KANBAN_COLUMNS, then the defaults.
    const statuses = resolveStatuses(
      parseStatuses(metadata.customStatuses),
      parseStatusesEnv(process.env.KANBAN_COLUMNS),
    );

    return NextResponse.json({ statuses });
  } catch (error) {
    console.error("Failed to fetch statuses:", error);
    return NextResponse.json({ error: "Failed to fetch statuses" }, { status: 500 });
  }
}
