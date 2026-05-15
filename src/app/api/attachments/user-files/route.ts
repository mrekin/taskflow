import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { db } from '@/lib/db';
import { formatShortId } from '@/lib/utils';

interface EntityRef {
  id: string;
  shortId: string;
  type: 'task' | 'note';
}

interface FileEntry {
  id: string;
  originalName: string;
  size: number;
  mimeType: string;
  createdAt: string;
  attachments: {
    id: string;
    displayName: string;
    entity: EntityRef;
  }[];
}

// GET /api/attachments/user-files — list current user's files with entity references
export async function GET() {
  const authResult = await requireAuth();
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult;

  const blobs = await db.fileBlob.findMany({
    where: { ownerId: userId },
    include: {
      attachments: {
        select: {
          id: true,
          entityId: true,
          entityType: true,
          displayName: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const entityCache = new Map<string, EntityRef>();

  async function resolveEntity(entityId: string, entityType: string): Promise<EntityRef | null> {
    const key = `${entityType}:${entityId}`;
    if (entityCache.has(key)) return entityCache.get(key)!;

    if (entityType === 'task') {
      const task = await db.task.findUnique({
        where: { id: entityId },
        select: { id: true, shortIdNum: true },
      });
      if (task) {
        const ref: EntityRef = { id: task.id, shortId: formatShortId('task', task.shortIdNum), type: 'task' };
        entityCache.set(key, ref);
        return ref;
      }
    }

    if (entityType === 'note') {
      const note = await db.note.findUnique({
        where: { id: entityId },
        select: { id: true, shortIdNum: true },
      });
      if (note) {
        const ref: EntityRef = { id: note.id, shortId: formatShortId('note', note.shortIdNum), type: 'note' };
        entityCache.set(key, ref);
        return ref;
      }
    }

    if (entityType === 'comment') {
      const comment = await db.comment.findUnique({
        where: { id: entityId },
        select: { taskId: true },
      });
      if (comment) {
        const task = await db.task.findUnique({
          where: { id: comment.taskId },
          select: { id: true, shortIdNum: true },
        });
        if (task) {
          const ref: EntityRef = { id: task.id, shortId: formatShortId('task', task.shortIdNum), type: 'task' };
          entityCache.set(key, ref);
          return ref;
        }
      }
    }

    return null;
  }

  const files: FileEntry[] = [];

  for (const blob of blobs) {
    const attachmentRefs: FileEntry['attachments'] = [];

    for (const att of blob.attachments) {
      const entity = await resolveEntity(att.entityId, att.entityType);
      if (entity) {
        attachmentRefs.push({
          id: att.id,
          displayName: att.displayName,
          entity,
        });
      }
    }

    files.push({
      id: blob.id,
      originalName: blob.originalName,
      size: blob.size,
      mimeType: blob.mimeType,
      createdAt: blob.createdAt instanceof Date ? blob.createdAt.toISOString() : blob.createdAt,
      attachments: attachmentRefs,
    });
  }

  return NextResponse.json({ files });
}
