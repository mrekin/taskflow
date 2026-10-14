import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth-utils';
import { buildVisibilityWhereClause } from '@/lib/visibility';
import {
  ensureNoBearer,
  formatApiTokenRecord,
  logToken,
  validateTokenPermissionsInput,
} from '@/lib/api-token';
import type { ApiTokenScopeType } from '@/lib/types';

const SCOPE_TYPES: ApiTokenScopeType[] = ['all', 'projects'];

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const blocked = await ensureNoBearer(request);
  if (blocked) return blocked;

  const auth = await requireAuth();
  if ('error' in auth) return auth.error;
  const { userId } = auth;
  const { id } = await params;

  const token = await db.apiToken.findFirst({ where: { id, userId } });
  if (!token) {
    return NextResponse.json({ error: 'Token not found' }, { status: 404 });
  }

  await db.apiToken.delete({ where: { id } });
  logToken(`deleted token "${token.name}" (${token.tokenPrefix}) by user ${userId}`);
  return NextResponse.json({ ok: true });
}

// PATCH /api/user/tokens/[id] — change permissions / scope / expiry without re-issuing the token.
// Session-only. The token value and its name are never changed here.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const blocked = await ensureNoBearer(request);
  if (blocked) return blocked;

  const auth = await requireAuth();
  if ('error' in auth) return auth.error;
  const { userId } = auth;
  const { id } = await params;

  const token = await db.apiToken.findFirst({ where: { id, userId } });
  if (!token) {
    return NextResponse.json({ error: 'Token not found' }, { status: 404 });
  }

  let body: {
    name?: unknown;
    permissions?: unknown;
    scopeType?: unknown;
    projectIds?: unknown;
    expiresAt?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const hasPermissions = body.permissions !== undefined;
  const hasScopeType = body.scopeType !== undefined;
  const hasProjectIds = body.projectIds !== undefined;
  const hasExpiresAt = body.expiresAt !== undefined;
  // `name` is deliberately ignored: a token is never renamed after creation.
  if (!hasPermissions && !hasScopeType && !hasProjectIds && !hasExpiresAt) {
    return NextResponse.json(
      { error: 'Nothing to update: provide permissions, scopeType, projectIds or expiresAt' },
      { status: 400 },
    );
  }

  // Permissions: strict shape validation (same as POST)
  let permissions: string | undefined;
  if (hasPermissions) {
    const parsed = validateTokenPermissionsInput(body.permissions);
    if (!parsed) {
      return NextResponse.json(
        { error: 'permissions must contain boolean read/create/update/delete for tasks, notes and comments' },
        { status: 400 },
      );
    }
    permissions = JSON.stringify(parsed);
  }

  // Scope: same rules as POST; validated only when scopeType/projectIds are provided.
  // When only projectIds arrive for an 'all'-scoped token, projectIds stay '[]' (same as POST).
  let scopeType: string | undefined;
  let projectIds: string | undefined;
  if (hasScopeType || hasProjectIds) {
    const nextScopeType = (hasScopeType ? body.scopeType : token.scopeType) as ApiTokenScopeType;
    if (!SCOPE_TYPES.includes(nextScopeType)) {
      return NextResponse.json({ error: 'scopeType must be "all" or "projects"' }, { status: 400 });
    }

    let ids: string[] = [];
    if (nextScopeType === 'projects') {
      const rawIds = hasProjectIds ? body.projectIds : JSON.parse(token.projectIds || '[]');
      if (!Array.isArray(rawIds) || rawIds.length === 0) {
        return NextResponse.json(
          { error: 'projectIds must be a non-empty array when scopeType is "projects"' },
          { status: 400 },
        );
      }
      ids = [...new Set(rawIds.filter((v): v is string => typeof v === 'string'))];
      // Any project visible to the user may be scoped (shared projects included);
      // the effective scope is still intersected with visibility on every request.
      const found = await db.project.findMany({
        where: { id: { in: ids }, ...(await buildVisibilityWhereClause(userId, true)) },
        select: { id: true },
      });
      if (found.length !== ids.length) {
        return NextResponse.json({ error: 'One or more projects not found or not accessible' }, { status: 400 });
      }
    }
    scopeType = nextScopeType;
    projectIds = JSON.stringify(ids);
  }

  // Expiry: undefined = keep as is, null = remove, otherwise a valid future date
  let expiresAt: Date | null | undefined;
  if (hasExpiresAt) {
    if (body.expiresAt === null) {
      expiresAt = null;
    } else {
      const parsed = new Date(String(body.expiresAt));
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: 'expiresAt must be a valid date' }, { status: 400 });
      }
      if (parsed.getTime() <= Date.now()) {
        return NextResponse.json({ error: 'expiresAt must be in the future' }, { status: 400 });
      }
      expiresAt = parsed;
    }
  }

  const data: { permissions?: string; scopeType?: string; projectIds?: string; expiresAt?: Date | null } = {};
  if (permissions !== undefined) data.permissions = permissions;
  if (scopeType !== undefined) data.scopeType = scopeType;
  if (projectIds !== undefined) data.projectIds = projectIds;
  if (expiresAt !== undefined) data.expiresAt = expiresAt;

  try {
    const updated = await db.apiToken.update({ where: { id }, data });
    logToken(
      `updated token "${updated.name}" (${updated.tokenPrefix}) by user ${userId}: ${Object.keys(data).join(', ')}`,
    );
    return NextResponse.json(formatApiTokenRecord(updated));
  } catch (error: unknown) {
    console.error('Failed to update API token:', error);
    return NextResponse.json({ error: 'Failed to update API token' }, { status: 500 });
  }
}
