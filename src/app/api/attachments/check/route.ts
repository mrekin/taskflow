import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth-utils';
import { canWriteEntity } from '@/lib/visibility';
import { getAttachmentConfig } from '@/lib/attachment-config';
import { isFilenameAllowed } from '@/lib/attachment-utils';

// POST /api/attachments/check — Step 1: hash check + deduplication
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const body = await request.json();
    const { hash, fileName, size, entityId, entityType } = body;

    if (!hash || !fileName || !entityId || !entityType || size === undefined) {
      return NextResponse.json({ error: 'hash, fileName, size, entityId, entityType are required' }, { status: 400 });
    }

    if (!['task', 'note'].includes(entityType)) {
      return NextResponse.json({ error: 'entityType must be task or note' }, { status: 400 });
    }

    const config = getAttachmentConfig();

    // Validate size
    if (size > config.maxSize) {
      return NextResponse.json({ error: `File size exceeds maximum (${config.maxSize} bytes)` }, { status: 400 });
    }

    // Validate filename pattern
    if (!isFilenameAllowed(fileName, config.allowedPatterns)) {
      return NextResponse.json({ error: `File type not allowed: ${fileName}` }, { status: 400 });
    }

    // Check entity exists and user can write
    const entity = await getEntity(entityId, entityType);
    if (!entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    if (!canWriteEntity(userId, entity.ownerId)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Check attachment limit
    const currentCount = await db.attachment.count({
      where: { entityId, entityType },
    });
    if (currentCount >= config.maxPerEntity) {
      return NextResponse.json({ error: `Maximum ${config.maxPerEntity} attachments per entity` }, { status: 400 });
    }

    // Check for duplicate blob
    const existingBlob = await db.fileBlob.findUnique({ where: { hash } });

    if (existingBlob) {
      // Check if already attached to this entity
      const existingAttachment = await db.attachment.findUnique({
        where: { entityId_entityType_blobId: { entityId, entityType, blobId: existingBlob.id } },
      });

      if (existingAttachment) {
        return NextResponse.json({
          status: 'already_attached',
          attachment: formatAttachment(existingAttachment, existingBlob),
        });
      }

      // Deduplicate: reuse blob, create new attachment
      const attachment = await db.attachment.create({
        data: {
          entityId,
          entityType,
          blobId: existingBlob.id,
          displayName: fileName,
          ownerId: userId,
        },
        include: { blob: true },
      });

      return NextResponse.json({
        status: 'deduplicated',
        attachment: formatAttachment(attachment, attachment.blob),
      });
    }

    // No existing blob — generate upload token
    const uploadToken = Buffer.from(JSON.stringify({
      hash,
      fileName,
      size,
      entityId,
      entityType,
      userId,
      exp: Date.now() + 5 * 60 * 1000, // 5 min TTL
    })).toString('base64url');

    return NextResponse.json({ status: 'upload_needed', uploadToken });
  } catch (error) {
    console.error('Failed to check attachment:', error);
    return NextResponse.json({ error: 'Failed to check attachment' }, { status: 500 });
  }
}

async function getEntity(entityId: string, entityType: string) {
  if (entityType === 'task') {
    return db.task.findUnique({ where: { id: entityId }, select: { id: true, ownerId: true } });
  }
  if (entityType === 'note') {
    return db.note.findUnique({ where: { id: entityId }, select: { id: true, ownerId: true } });
  }
  return null;
}

function formatAttachment(a: { id: string; entityId: string; entityType: string; blobId: string; displayName: string | null; ownerId: string; createdAt: Date }, blob: { id: string; hash: string; size: number; mimeType: string; originalName: string }) {
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
