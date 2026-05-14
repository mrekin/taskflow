import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUserId, requireAuth } from '@/lib/auth-utils';
import { canReadEntity, canWriteEntity, resolveEffectiveVisibility } from '@/lib/visibility';
import { getAttachmentConfig } from '@/lib/attachment-config';
import { getEntity, parseVisibility, formatAttachment } from '@/lib/attachment-api-utils';

// GET /api/attachments?entityId=...&entityType=task
export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return NextResponse.json([]);

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');
    const entityType = searchParams.get('entityType');

    if (!entityId || !entityType || !['task', 'note'].includes(entityType)) {
      return NextResponse.json({ error: 'entityId and entityType (task|note) are required' }, { status: 400 });
    }

    // Check read access to the entity
    const entity = await getEntity(entityId, entityType, { includeVisibility: true });
    if (!entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    const vis = parseVisibility(entity);
    const effectiveVis = resolveEffectiveVisibility(vis.visibility, []);
    if (!canReadEntity(userId, entity.ownerId, effectiveVis, vis.visibleUserIds, true)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const attachments = await db.attachment.findMany({
      where: { entityId, entityType },
      include: { blob: true },
      orderBy: { createdAt: 'desc' },
    });

    const result = attachments.map(a => formatAttachment(a, a.blob));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to fetch attachments:', error);
    return NextResponse.json({ error: 'Failed to fetch attachments' }, { status: 500 });
  }
}

// DELETE /api/attachments?id=...
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Attachment id is required' }, { status: 400 });
    }

    const attachment = await db.attachment.findUnique({
      where: { id },
      include: { blob: true },
    });

    if (!attachment) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }

    if (!canWriteEntity(userId, attachment.ownerId)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const blobId = attachment.blobId;

    await db.attachment.delete({ where: { id } });

    // Check if any other attachments reference this blob
    const remainingCount = await db.attachment.count({ where: { blobId } });
    if (remainingCount === 0) {
      const { getStorageAdapter } = await import('@/lib/storage');
      const storage = getStorageAdapter();
      await storage.delete(attachment.blob.storageKey);
      await db.fileBlob.delete({ where: { id: blobId } }).catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete attachment:', error);
    return NextResponse.json({ error: 'Failed to delete attachment' }, { status: 500 });
  }
}

