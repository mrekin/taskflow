import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  authenticateRequest,
  getTokenProjectScope,
  logToken,
} from "@/lib/api-token";

/**
 * Introspection for API tokens: returns what the presented token is allowed to
 * do (permissions matrix, effective project scope, expiry). Lets API consumers
 * (e.g. MCP agents) learn their permissions before attempting writes.
 * Session/anonymous requests are rejected — token management stays session-only.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.ok) return auth.response;
    if (auth.ctx.kind !== "token") {
      return NextResponse.json(
        { error: "This endpoint requires an API token" },
        { status: 401 },
      );
    }
    const { token, userId } = auth.ctx;

    const scope = await getTokenProjectScope(auth.ctx);
    const projects = scope.size > 0
      ? await db.project.findMany({
          where: { id: { in: [...scope] } },
          select: { id: true, name: true, color: true },
          orderBy: { sortOrder: "asc" },
        })
      : [];

    const [record, user] = await Promise.all([
      db.apiToken.findUnique({ where: { id: token.id }, select: { lastUsedAt: true } }),
      db.user.findUnique({ where: { id: userId }, select: { id: true, name: true } }),
    ]);

    logToken(`"${token.name}" (${token.tokenPrefix}): introspected token info`);

    return NextResponse.json({
      name: token.name,
      tokenPrefix: token.tokenPrefix,
      scopeType: token.scopeType,
      permissions: token.permissions,
      expiresAt: token.expiresAt,
      revokedAt: token.revokedAt,
      lastUsedAt: record?.lastUsedAt ?? null,
      scope: {
        // 'all' scopeType resolves to every project the user can currently see;
        // an empty list means no accessible projects (Inbox is never token-accessible)
        projects,
      },
      user: user ? { id: user.id, name: user.name } : { id: userId, name: null },
    });
  } catch (error) {
    console.error("Failed to fetch token info:", error);
    return NextResponse.json({ error: "Failed to fetch token info" }, { status: 500 });
  }
}
