import { db } from '@/lib/db';

type EntityBasic = { id: string; ownerId: string };
type EntityWithVisibility = EntityBasic & { visibility: string | null; visibleUserIds: string };

export async function getEntity(
  entityId: string,
  entityType: string,
  options?: { includeVisibility?: true }
): Promise<EntityWithVisibility | null>;
export async function getEntity(
  entityId: string,
  entityType: string,
  options?: { includeVisibility?: false }
): Promise<EntityBasic | null>;
export async function getEntity(
  entityId: string,
  entityType: string,
  options?: { includeVisibility?: boolean }
): Promise<EntityBasic | EntityWithVisibility | null> {
  const select = options?.includeVisibility
    ? { id: true, ownerId: true, visibility: true, visibleUserIds: true }
    : { id: true, ownerId: true };

  if (entityType === 'task') {
    return db.task.findUnique({ where: { id: entityId }, select });
  }
  if (entityType === 'note') {
    return db.note.findUnique({ where: { id: entityId }, select });
  }
  return null;
}

export function parseVisibility(entity: { visibility: string | null; visibleUserIds: string }) {
  let visibleUserIds: string[] = [];
  try {
    visibleUserIds = JSON.parse(entity.visibleUserIds || '[]');
  } catch {}
  return { visibility: entity.visibility, visibleUserIds };
}

export function formatAttachment(
  a: {
    id: string;
    entityId: string;
    entityType: string;
    blobId: string;
    displayName: string | null;
    ownerId: string;
    createdAt: Date;
  },
  blob: {
    id: string;
    hash: string;
    size: number;
    mimeType: string;
    originalName: string;
  }
) {
  return {
    id: a.id,
    entityId: a.entityId,
    entityType: a.entityType,
    blobId: a.blobId,
    displayName: a.displayName,
    ownerId: a.ownerId,
    createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
    blob: {
      id: blob.id,
      hash: blob.hash,
      size: blob.size,
      mimeType: blob.mimeType,
      originalName: blob.originalName,
    },
  };
}
