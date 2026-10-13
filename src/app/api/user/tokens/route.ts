import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth-utils';
import { buildVisibilityWhereClause } from '@/lib/visibility';
import { ensureNoBearer, generateApiToken, logToken, validateTokenPermissionsInput } from '@/lib/api-token';
import type { ApiTokenScopeType } from '@/lib/types';

const MAX_TOKENS_PER_USER = 20;
const MAX_NAME_LENGTH = 64;
const SCOPE_TYPES: ApiTokenScopeType[] = ['all', 'projects'];

function formatToken(record: {
  id: string;
  name: string;
  tokenPrefix: string;
  scopeType: string;
  projectIds: string;
  permissions: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: record.id,
    name: record.name,
    tokenPrefix: record.tokenPrefix,
    scopeType: record.scopeType,
    projectIds: JSON.parse(record.projectIds || '[]'),
    permissions: JSON.parse(record.permissions || '{}'),
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt,
    lastUsedAt: record.lastUsedAt,
    createdAt: record.createdAt,
  };
}

export async function GET(request: Request) {
  const blocked = await ensureNoBearer(request);
  if (blocked) return blocked;

  const auth = await requireAuth();
  if ('error' in auth) return auth.error;

  const tokens = await db.apiToken.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(tokens.map(formatToken));
}

export async function POST(request: Request) {
  const blocked = await ensureNoBearer(request);
  if (blocked) return blocked;

  const auth = await requireAuth();
  if ('error' in auth) return auth.error;
  const { userId } = auth;

  let body: {
    name?: unknown;
    scopeType?: unknown;
    projectIds?: unknown;
    permissions?: unknown;
    expiresAt?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Name: required, trimmed 1..64 chars
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > MAX_NAME_LENGTH) {
    return NextResponse.json({ error: `Name is required (max ${MAX_NAME_LENGTH} characters)` }, { status: 400 });
  }

  // Scope
  const scopeType = body.scopeType as ApiTokenScopeType;
  if (!SCOPE_TYPES.includes(scopeType)) {
    return NextResponse.json({ error: 'scopeType must be "all" or "projects"' }, { status: 400 });
  }

  let projectIds: string[] = [];
  if (scopeType === 'projects') {
    if (!Array.isArray(body.projectIds) || body.projectIds.length === 0) {
      return NextResponse.json({ error: 'projectIds must be a non-empty array when scopeType is "projects"' }, { status: 400 });
    }
    projectIds = [...new Set(body.projectIds.filter((id): id is string => typeof id === 'string'))];
    // Any project visible to the user may be scoped (shared projects included);
    // the effective scope is still intersected with visibility on every request.
    const found = await db.project.findMany({
      where: { id: { in: projectIds }, ...(await buildVisibilityWhereClause(userId, true)) },
      select: { id: true },
    });
    if (found.length !== projectIds.length) {
      return NextResponse.json({ error: 'One or more projects not found or not accessible' }, { status: 400 });
    }
  }

  // Permissions: strict shape validation
  const permissions = validateTokenPermissionsInput(body.permissions);
  if (!permissions) {
    return NextResponse.json(
      { error: 'permissions must contain boolean read/create/update/delete for tasks, notes and comments' },
      { status: 400 },
    );
  }

  // Expiry: null or a future date
  let expiresAt: Date | null = null;
  if (body.expiresAt !== null && body.expiresAt !== undefined) {
    const parsed = new Date(String(body.expiresAt));
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: 'expiresAt must be a valid date' }, { status: 400 });
    }
    if (parsed.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'expiresAt must be in the future' }, { status: 400 });
    }
    expiresAt = parsed;
  }

  // Per-user cap
  const count = await db.apiToken.count({ where: { userId } });
  if (count >= MAX_TOKENS_PER_USER) {
    return NextResponse.json({ error: `Token limit reached (${MAX_TOKENS_PER_USER})` }, { status: 400 });
  }

  const { raw, hash, prefix } = generateApiToken();

  try {
    const record = await db.apiToken.create({
      data: {
        userId,
        name,
        tokenHash: hash,
        tokenPrefix: prefix,
        scopeType,
        projectIds: JSON.stringify(projectIds),
        permissions: JSON.stringify(permissions),
        expiresAt,
      },
    });
    logToken(`created token "${name}" (${prefix}) for user ${userId}, scope=${scopeType}`);
    return NextResponse.json({ token: raw, record: formatToken(record) }, { status: 201 });
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ error: 'A token with this name already exists' }, { status: 409 });
    }
    console.error('Failed to create API token:', error);
    return NextResponse.json({ error: 'Failed to create API token' }, { status: 500 });
  }
}
