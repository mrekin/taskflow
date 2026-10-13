import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { buildVisibilityWhereClause } from '@/lib/visibility';
import { getCurrentUserId } from '@/lib/auth-utils';
import type {
  ApiTokenScopeType,
  TokenAction,
  TokenEntity,
  TokenEntityPermissions,
  TokenPermissions,
} from '@/lib/types';

const API_TOKEN_PREFIX = 'tfa_';
const API_TOKEN_RANDOM_BYTES = 20; // -> 40 hex chars
const TOKEN_PREFIX_DISPLAY_LENGTH = 12;
const LAST_USED_THROTTLE_MS = 60_000;

const ENTITIES: TokenEntity[] = ['tasks', 'notes', 'comments'];
const ACTIONS: TokenAction[] = ['read', 'create', 'update', 'delete'];

export interface ValidatedApiToken {
  id: string;
  userId: string;
  name: string;
  tokenPrefix: string;
  scopeType: ApiTokenScopeType;
  projectIds: string[];
  permissions: TokenPermissions;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export type ApiAuthContext =
  | { kind: 'anonymous' }
  | { kind: 'session'; userId: string }
  | { kind: 'token'; userId: string; token: ValidatedApiToken };

export type ApiAuthResult =
  | { ok: true; ctx: ApiAuthContext }
  | { ok: false; response: NextResponse };

// --- logging ---

export function logToken(message: string): void {
  console.log(`[api-token] ${message}`);
}

function unauthorized(error: string): NextResponse {
  return NextResponse.json({ error }, { status: 401 });
}

// --- generation / hashing ---

export function generateApiToken(): { raw: string; hash: string; prefix: string } {
  const raw = `${API_TOKEN_PREFIX}${crypto.randomBytes(API_TOKEN_RANDOM_BYTES).toString('hex')}`;
  return { raw, hash: hashApiToken(raw), prefix: raw.slice(0, TOKEN_PREFIX_DISPLAY_LENGTH) };
}

export function hashApiToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// --- request parsing ---

export type BearerTokenParse =
  | { state: 'absent' }
  | { state: 'malformed'; reason: string }
  | { state: 'present'; raw: string };

export function getBearerToken(request: Request): BearerTokenParse {
  const header = request.headers.get('authorization');
  const trimmed = header?.trim();
  if (!trimmed) return { state: 'absent' };

  const match = /^Bearer\s+(.+)$/i.exec(trimmed);
  if (!match) {
    return { state: 'malformed', reason: 'Unsupported Authorization scheme' };
  }
  const raw = match[1].trim();
  if (!raw) {
    return { state: 'malformed', reason: 'Invalid Authorization header format. Expected: Bearer <token>' };
  }
  return { state: 'present', raw };
}

// --- validation ---

type TokenValidation = { ok: true; token: ValidatedApiToken } | { ok: false; reason: string };

async function validateApiToken(raw: string): Promise<TokenValidation> {
  const record = await db.apiToken.findUnique({
    where: { tokenHash: hashApiToken(raw) },
  });
  if (!record) return { ok: false, reason: 'Invalid API token' };
  if (record.revokedAt) return { ok: false, reason: 'API token has been revoked' };
  if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: 'API token has expired' };
  }

  return {
    ok: true,
    token: {
      id: record.id,
      userId: record.userId,
      name: record.name,
      tokenPrefix: record.tokenPrefix,
      scopeType: (record.scopeType === 'projects' ? 'projects' : 'all'),
      projectIds: parseJsonStringArray(record.projectIds),
      permissions: parseTokenPermissions(parseJsonSafe(record.permissions)),
      expiresAt: record.expiresAt,
      revokedAt: record.revokedAt,
    },
  };
}

function parseJsonStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/** Parses a JSON string column defensively; returns the raw value for non-strings. */
function parseJsonSafe(raw: string): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

function emptyPermissions(): TokenPermissions {
  return {
    tasks: { read: false, create: false, update: false, delete: false },
    notes: { read: false, create: false, update: false, delete: false },
    comments: { read: false, create: false, update: false, delete: false },
  };
}

/** Lenient parser for request-path use: missing/unknown keys become `false`. */
export function parseTokenPermissions(raw: unknown): TokenPermissions {
  const result = emptyPermissions();
  if (!raw || typeof raw !== 'object') return result;
  const source = raw as Record<string, unknown>;
  for (const entity of ENTITIES) {
    const entityPerms = source[entity];
    if (!entityPerms || typeof entityPerms !== 'object') continue;
    const perms = entityPerms as Record<string, unknown>;
    for (const action of ACTIONS) {
      if (typeof perms[action] === 'boolean') {
        result[entity][action] = perms[action] as boolean;
      }
    }
  }
  return result;
}

/** Strict validation for token creation: only known keys, booleans only. Returns null when invalid. */
export function validateTokenPermissionsInput(raw: unknown): TokenPermissions | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const result = emptyPermissions();
  for (const entity of ENTITIES) {
    const entityPerms = source[entity];
    if (!entityPerms || typeof entityPerms !== 'object') return null;
    const perms = entityPerms as Record<string, unknown>;
    for (const action of ACTIONS) {
      if (typeof perms[action] !== 'boolean') return null;
      result[entity][action] = perms[action] as boolean;
    }
  }
  if (Object.keys(source).some((key) => !ENTITIES.includes(key as TokenEntity))) return null;
  return result;
}

// --- lastUsedAt (throttled) ---

const globalForTokenThrottle = globalThis as typeof globalThis & {
  __apiTokenLastUsedWrites?: Map<string, number>;
};

function throttleMap(): Map<string, number> {
  if (!globalForTokenThrottle.__apiTokenLastUsedWrites) {
    globalForTokenThrottle.__apiTokenLastUsedWrites = new Map();
  }
  return globalForTokenThrottle.__apiTokenLastUsedWrites;
}

function touchLastUsed(tokenId: string): void {
  const map = throttleMap();
  const now = Date.now();
  const last = map.get(tokenId) ?? 0;
  if (now - last < LAST_USED_THROTTLE_MS) return;
  map.set(tokenId, now);
  db.apiToken
    .update({ where: { id: tokenId }, data: { lastUsedAt: new Date() } })
    .catch(() => {
      // non-critical: usage tracking must never fail a request
      map.delete(tokenId);
    });
}

// --- core gates ---

/**
 * Single entry point for entity routes.
 * No Authorization header -> session/anonymous context (existing behavior, unchanged).
 * Header present -> strict token mode: any problem is a 401, success yields token context.
 */
export async function authenticateRequest(request: Request): Promise<ApiAuthResult> {
  const bearer = getBearerToken(request);

  if (bearer.state === 'absent') {
    const userId = await getCurrentUserId();
    return {
      ok: true,
      ctx: userId ? { kind: 'session', userId } : { kind: 'anonymous' },
    };
  }

  if (bearer.state === 'malformed') {
    logToken(`rejected: ${bearer.reason}`);
    return { ok: false, response: unauthorized(bearer.reason) };
  }

  const result = await validateApiToken(bearer.raw);
  if (!result.ok) {
    logToken(`rejected: ${result.reason} (${bearer.raw.slice(0, TOKEN_PREFIX_DISPLAY_LENGTH)}...)`);
    return { ok: false, response: unauthorized(result.reason) };
  }

  const token = result.token;
  touchLastUsed(token.id);
  const path = new URL(request.url).pathname;
  logToken(`"${token.name}" (${token.tokenPrefix}) ${request.method} ${path}`);
  return { ok: true, ctx: { kind: 'token', userId: token.userId, token } };
}

export type RequireApiAuthResult =
  | { userId: string; token?: ValidatedApiToken }
  | { error: NextResponse };

/** For mutating endpoints: anonymous -> 401, invalid bearer -> 401, session -> { userId }, token -> { userId, token }. */
export async function requireApiAuth(request: Request): Promise<RequireApiAuthResult> {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return { error: auth.response };
  if (auth.ctx.kind === 'anonymous') {
    return { error: unauthorized('Authentication required') };
  }
  if (auth.ctx.kind === 'session') {
    return { userId: auth.ctx.userId };
  }
  return { userId: auth.ctx.userId, token: auth.ctx.token };
}

/**
 * Guard for endpoints that must never be reachable via API tokens
 * (export/import, webhooks, user management, ...).
 * Returns a NextResponse to bail out with, or null to proceed as usual.
 */
export async function ensureNoBearer(request: Request): Promise<NextResponse | null> {
  const bearer = getBearerToken(request);
  if (bearer.state === 'absent') return null;

  if (bearer.state === 'malformed') {
    logToken(`rejected: ${bearer.reason}`);
    return unauthorized(bearer.reason);
  }

  const result = await validateApiToken(bearer.raw);
  if (!result.ok) {
    logToken(`rejected: ${result.reason} (${bearer.raw.slice(0, TOKEN_PREFIX_DISPLAY_LENGTH)}...)`);
    return unauthorized(result.reason);
  }

  const path = new URL(request.url).pathname;
  logToken(`"${result.token.name}" (${result.token.tokenPrefix}) blocked at ${request.method} ${path}: endpoint not allowed for tokens`);
  return NextResponse.json(
    { error: 'API tokens are not allowed on this endpoint' },
    { status: 403 },
  );
}

// --- permissions ---

export function tokenCan(token: ValidatedApiToken, entity: TokenEntity, action: TokenAction): boolean {
  return token.permissions[entity]?.[action] === true;
}

/** True when the token may read at least one entity type (gates tags/projects/areas GET). */
export function tokenHasAnyRead(token: ValidatedApiToken): boolean {
  return ENTITIES.some((entity) => token.permissions[entity]?.read === true);
}

/** Returns a 403 response when the permission is missing, null when allowed. */
export function requireTokenPermission(
  token: ValidatedApiToken,
  entity: TokenEntity,
  action: TokenAction,
): NextResponse | null {
  if (tokenCan(token, entity, action)) return null;
  logToken(`"${token.name}" (${token.tokenPrefix}): missing permission ${entity}:${action}`);
  return NextResponse.json(
    { error: `API token missing permission: ${entity}:${action}` },
    { status: 403 },
  );
}

// --- project scope ---

/**
 * Request-time scope: stored ids (or "all") intersected with the projects the
 * user can currently see. Never wider than the user's own access.
 */
export async function getTokenProjectScope(ctx: { userId: string; token: ValidatedApiToken }): Promise<Set<string>> {
  const visible = await db.project.findMany({
    where: await buildVisibilityWhereClause(ctx.userId, true),
    select: { id: true },
  });
  const visibleIds = new Set(visible.map((p) => p.id));
  if (ctx.token.scopeType === 'all') return visibleIds;
  return new Set(ctx.token.projectIds.filter((id) => visibleIds.has(id)));
}

/** Inbox entities (projectId = null) are never accessible via tokens. */
export function tokenAllowsProject(scope: Set<string>, projectId: string | null | undefined): boolean {
  return !!projectId && scope.has(projectId);
}

export function buildTokenProjectFilter(scope: Set<string>): { projectId: { in: string[] } } {
  return { projectId: { in: [...scope] } };
}

/** Denial response for single-entity scope violations. */
export function tokenScopeDeniedResponse(token: ValidatedApiToken): NextResponse {
  logToken(`"${token.name}" (${token.tokenPrefix}): entity outside token project scope`);
  return NextResponse.json(
    { error: "Entity is outside the token's project scope" },
    { status: 403 },
  );
}

// --- entity -> project resolution ---

export type TokenScopeEntityType = 'task' | 'note' | 'comment' | 'folder';

/** Resolves the owning project of an entity. Comment inherits its parent task's project. Inbox -> null. */
export async function resolveEntityProjectId(
  entityType: TokenScopeEntityType,
  entityId: string,
): Promise<string | null> {
  if (entityType === 'task') {
    const task = await db.task.findUnique({ where: { id: entityId }, select: { projectId: true } });
    return task?.projectId ?? null;
  }
  if (entityType === 'note') {
    const note = await db.note.findUnique({ where: { id: entityId }, select: { projectId: true } });
    return note?.projectId ?? null;
  }
  if (entityType === 'folder') {
    const folder = await db.noteFolder.findUnique({ where: { id: entityId }, select: { projectId: true } });
    return folder?.projectId ?? null;
  }
  const comment = await db.comment.findUnique({
    where: { id: entityId },
    select: { task: { select: { projectId: true } } },
  });
  return comment?.task?.projectId ?? null;
}

// --- combined checks for typical route shapes ---

/** Maps an attachment-style entityType ('task'|'note'|'comment') to its token permission entity. */
export function tokenEntityFor(entityType: string): TokenEntity | null {
  if (entityType === 'task') return 'tasks';
  if (entityType === 'note') return 'notes';
  if (entityType === 'comment') return 'comments';
  return null;
}

/**
 * Create path: permission check + scope check against a project resolved by the caller
 * (e.g. body.projectId, or the parent task's project for subtasks).
 */
export async function requireTokenCreateAccess(
  auth: { userId: string; token: ValidatedApiToken },
  entity: TokenEntity,
  projectId: string | null | undefined,
): Promise<NextResponse | null> {
  const denied = requireTokenPermission(auth.token, entity, 'create');
  if (denied) return denied;
  const scope = await getTokenProjectScope(auth);
  if (!tokenAllowsProject(scope, projectId)) return tokenScopeDeniedResponse(auth.token);
  return null;
}

/**
 * Existing-entity path: permission check + scope check on the entity's own project.
 * `projectOverride` lets callers additionally validate a move target (PUT body.projectId).
 */
export async function requireTokenEntityAccess(
  auth: { userId: string; token: ValidatedApiToken },
  entity: TokenEntity,
  action: TokenAction,
  entityType: TokenScopeEntityType,
  entityId: string,
  projectOverride?: string | null,
): Promise<NextResponse | null> {
  const denied = requireTokenPermission(auth.token, entity, action);
  if (denied) return denied;
  const scope = await getTokenProjectScope(auth);
  const projectId = await resolveEntityProjectId(entityType, entityId);
  if (!tokenAllowsProject(scope, projectId)) return tokenScopeDeniedResponse(auth.token);
  if (projectOverride !== undefined && projectOverride !== projectId) {
    if (!tokenAllowsProject(scope, projectOverride)) return tokenScopeDeniedResponse(auth.token);
  }
  return null;
}
