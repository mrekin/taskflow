import { DEFAULT_VISIBILITY, VISIBILITY_OWNER, VISIBILITY_USERS, VISIBILITY_SITE, VISIBILITY_WORLD, DEFAULT_PREFERENCES, type ProfileVisibility } from './constants';

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
  OR: Array<Record<string, unknown>>;
}

export function buildVisibilityWhereClause(userId: string | null, isAuthenticated: boolean): VisibilityWhereResult {
  if (!userId || !isAuthenticated) {
    return {
      OR: [
        { visibility: VISIBILITY_WORLD },
      ],
    };
  }

  return {
    OR: [
      { ownerId: userId },
      { visibility: VISIBILITY_WORLD },
      { visibility: VISIBILITY_SITE },
      {
        visibility: VISIBILITY_USERS,
        visibleUserIds: { contains: userId },
      },
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
