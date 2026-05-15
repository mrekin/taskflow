import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth-utils';
import { canWriteEntity } from '@/lib/visibility';
import { getAttachmentConfig } from '@/lib/attachment-config';
import { isFilenameAllowed } from '@/lib/attachment-utils';
import { getEntity, formatAttachment } from '@/lib/attachment-api-utils';

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

    if (!['task', 'note', 'comment'].includes(entityType)) {
      return NextResponse.json({ error: 'entityType must be task, note, or comment' }, { status: 400 });
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
    const maxAllowed = entityType === 'comment' ? config.maxPerComment : config.maxPerEntity;
    const currentCount = await db.attachment.count({
      where: { entityId, entityType },
    });
    if (currentCount >= maxAllowed) {
      return NextResponse.json({ error: `Maximum ${maxAllowed} attachments per ${entityType}` }, { status: 400 });
    }

    // Check for duplicate blob
    const existingBlob = await db.fileBlob.findUnique({ where: { hash } });

    if (existingBlob) {
      // Check if file with same name already attached to this entity
      const existingAttachment = await db.attachment.findUnique({
        where: { entityId_entityType_displayName: { entityId, entityType, displayName: fileName } },
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
        },
        include: { blob: true },
      });

      return NextResponse.json({
        status: 'deduplicated',
        attachment: formatAttachment(attachment, attachment.blob),
      });
    }

    // No existing blob — upload needed
    return NextResponse.json({ status: 'upload_needed' });
  } catch (error) {
    console.error('Failed to check attachment:', error);
    return NextResponse.json({ error: 'Failed to check attachment' }, { status: 500 });
  }
}

