import { db } from '@/lib/db';
import { DEFAULT_VISIBILITY, VISIBILITY_OWNER, VISIBILITY_USERS, VISIBILITY_SITE, VISIBILITY_WORLD, DEFAULT_PREFERENCES, type ProfileVisibility } from './constants';

/** Hard cap on the per-user ignore list length (stored in User.metadata.ignoredUserIds). */
export const MAX_IGNORED_USERS = 100;

export function parseIgnoredUserIds(raw: unknown): string[] {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .slice(0, MAX_IGNORED_USERS);
}

/** Ids of users whose entities this user has chosen to ignore (stored in own metadata). */
export async function getIgnoredUserIds(userId: string | null): Promise<string[]> {
  if (!userId) return [];
  const user = await db.user.findUnique({ where: { id: userId }, select: { metadata: true } });
  if (!user) return [];
  let metadata: Record<string, unknown>;
  try {
    metadata = JSON.parse(user.metadata || '{}');
  } catch {
    return [];
  }
  return parseIgnoredUserIds(metadata.ignoredUserIds);
}

export function resolveEffectiveVisibility(
  entityVisibility: string | null,
  parentChain: Array<{ visibility: string | null; ownerId: string }>,
): string {
  if (entityVisibility) return entityVisibility;

  for (const parent of parentChain) {
    if (parent.visibility) return parent.visibility;
  }

  return DEFAULT_VISIBILITY;
}

export function canReadEntity(
  userId: string | null,
  entityOwnerId: string,
  effectiveVisibility: string,
  visibleUserIds: string[],
  isAuthenticated: boolean,
): boolean {
  switch (effectiveVisibility) {
    case VISIBILITY_OWNER:
      return userId === entityOwnerId;
    case VISIBILITY_USERS:
      return userId === entityOwnerId || (userId !== null && visibleUserIds.includes(userId));
    case VISIBILITY_SITE:
      return isAuthenticated;
    case VISIBILITY_WORLD:
      return true;
    default:
      return userId === entityOwnerId;
  }
}

export function canWriteEntity(userId: string, entityOwnerId: string): boolean {
  return userId === entityOwnerId;
}

export function canCommentEntity(
  userId: string | null,
  entityOwnerId: string,
  effectiveVisibility: string,
  visibleUserIds: string[],
  isAuthenticated: boolean,
): boolean {
  return canReadEntity(userId, entityOwnerId, effectiveVisibility, visibleUserIds, isAuthenticated);
}

export function canDeleteComment(userId: string, commentOwnerId: string, taskOwnerId: string): boolean {
  return userId === commentOwnerId || userId === taskOwnerId;
}

interface VisibilityWhereResult {
  AND?: Array<Record<string, unknown>>;
  OR?: Array<Record<string, unknown>>;
}

/**
 * Visibility filter shared by all entity list queries. When the user has an
 * ignore list, entities owned by ignored users are excluded — own entities
 * are never affected (a user id never appears in its own ignore list).
 * Pass a prefetched `ignoredUserIds` to avoid a metadata lookup per call.
 */
export async function buildVisibilityWhereClause(
  userId: string | null,
  isAuthenticated: boolean,
  ignoredUserIds?: string[],
): Promise<VisibilityWhereResult> {
  if (!userId || !isAuthenticated) {
    return {
      OR: [
        { visibility: VISIBILITY_WORLD },
      ],
    };
  }

  const ignored = ignoredUserIds ?? (await getIgnoredUserIds(userId));
  const or: Array<Record<string, unknown>> = [
    { ownerId: userId },
    { visibility: VISIBILITY_WORLD },
    { visibility: VISIBILITY_SITE },
    {
      visibility: VISIBILITY_USERS,
      visibleUserIds: { contains: userId },
    },
  ];

  if (ignored.length === 0) {
    return { OR: or };
  }

  return {
    AND: [
      { OR: or },
      { ownerId: { notIn: ignored } },
    ],
  };
}

export function sanitizeRelation<T extends Record<string, unknown>>(
  relatedEntity: T | null,
  relatedEntityOwnerId: string,
  userId: string | null,
  isAuthenticated: boolean,
  parentChain: Array<{ visibility: string | null; ownerId: string }> = [],
): T | { id: string } | null {
  if (!relatedEntity) return null;

  const effVis = resolveEffectiveVisibility(
    (relatedEntity as Record<string, unknown>).visibility as string | null ?? null,
    parentChain,
  );
  const vuids: string[] = (() => {
    try {
      return JSON.parse((relatedEntity as Record<string, unknown>).visibleUserIds as string || '[]');
    } catch { return []; }
  })();

  if (canReadEntity(userId, relatedEntityOwnerId, effVis, vuids, isAuthenticated)) {
    return relatedEntity;
  }

  return { id: relatedEntity.id as string };
}

/**
 * Post-process a sanitizeRelation result that came back as the full object:
 * its `visibleUserIds` is still the raw JSON string from the DB select —
 * parse it to match the API shape of list endpoints.
 */
export function normalizeSanitizedRelation<T extends Record<string, unknown>>(
  related: T | { id: string } | null,
): T | { id: string } | null {
  if (related && 'visibleUserIds' in related && typeof related.visibleUserIds === 'string') {
    return { ...related, visibleUserIds: parseVisibleUserIds(related.visibleUserIds) } as T;
  }
  return related;
}

export function parseVisibleUserIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((id): id is string => typeof id === 'string');
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((id): id is string => typeof id === 'string');
    } catch { /* ignore */ }
  }
  return [];
}

function parseProfileVisibility(value: unknown): ProfileVisibility {
  if (!value || typeof value !== 'object') return DEFAULT_PREFERENCES.profileVisibility;
  const v = value as Record<string, unknown>;
  return {
    nickname: typeof v.nickname === 'boolean' ? v.nickname : DEFAULT_PREFERENCES.profileVisibility.nickname,
    email: typeof v.email === 'boolean' ? v.email : DEFAULT_PREFERENCES.profileVisibility.email,
  };
}

interface SanitizableUser {
  id: string;
  name: string | null;
  email?: string;
  image?: string | null;
  metadata?: string;
}

export function sanitizeUserProfile<T extends SanitizableUser>(
  user: T,
): { id: string; name: string | null; image: string | null } | null {
  let metadata: Record<string, unknown>;
  try {
    metadata = JSON.parse(user.metadata || '{}');
  } catch {
    metadata = {};
  }
  const visibility = parseProfileVisibility(metadata.profileVisibility);

  const showName = visibility.nickname && user.name;
  const showEmail = visibility.email && user.email;

  if (!showName && !showEmail) return null;

  return {
    id: user.id,
    name: showName ? user.name : showEmail ? user.email! : null,
    image: user.image ?? null,
  };
}
