import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth-utils';
import { canWriteEntity } from '@/lib/visibility';
import { getStorageAdapter } from '@/lib/storage';
import { getAttachmentConfig } from '@/lib/attachment-config';
import { isFilenameAllowed } from '@/lib/attachment-utils';
import { getEntity, formatAttachment } from '@/lib/attachment-api-utils';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/attachments/upload — upload file
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const entityId = formData.get('entityId') as string | null;
    const entityType = formData.get('entityType') as string | null;

    if (!file || !entityId || !entityType) {
      return NextResponse.json({ error: 'file, entityId, entityType are required' }, { status: 400 });
    }

    if (!['task', 'note'].includes(entityType)) {
      return NextResponse.json({ error: 'entityType must be task or note' }, { status: 400 });
    }

    // Check entity exists and user can write
    const entity = await getEntity(entityId, entityType);
    if (!entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    if (!canWriteEntity(userId, entity.ownerId)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const config = getAttachmentConfig();

    // Validate size
    if (file.size > config.maxSize) {
      return NextResponse.json({ error: `File size exceeds maximum (${config.maxSize} bytes)` }, { status: 400 });
    }

    // Validate filename pattern
    if (!isFilenameAllowed(file.name, config.allowedPatterns)) {
      return NextResponse.json({ error: `File type not allowed: ${file.name}` }, { status: 400 });
    }

    // Check attachment limit
    const currentCount = await db.attachment.count({
      where: { entityId, entityType },
    });
    if (currentCount >= config.maxPerEntity) {
      return NextResponse.json({ error: `Maximum ${config.maxPerEntity} attachments per entity` }, { status: 400 });
    }

    // Read file buffer and compute hash
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const actualHash = crypto.createHash('sha256').update(buffer).digest('hex');

    // Generate storage key: {hash[0:2]}/{hash[2:4]}/{hash}.{ext}
    const ext = file.name.includes('.')
      ? file.name.slice(file.name.lastIndexOf('.') + 1)
      : 'bin';
    const storageKey = `${actualHash.slice(0, 2)}/${actualHash.slice(2, 4)}/${actualHash}.${ext}`;

    // Store file (idempotent — same hash produces same key, overwrites are safe)
    const storage = getStorageAdapter();
    await storage.put(storageKey, buffer, file.type || 'application/octet-stream');

    // Upsert blob — single atomic operation, eliminates race condition on duplicate hash
    const blob = await db.fileBlob.upsert({
      where: { hash: actualHash },
      update: {},
      create: {
        hash: actualHash,
        size: buffer.length,
        mimeType: file.type || 'application/octet-stream',
        originalName: file.name,
        storageKey,
        ownerId: userId,
      },
    });
    const blobId = blob.id;

    // Create attachment (check unique constraint)
    try {
      const attachment = await db.attachment.create({
        data: {
          entityId,
          entityType,
          blobId,
          displayName: file.name,
          ownerId: userId,
        },
        include: { blob: true },
      });

      return NextResponse.json(formatAttachment(attachment, attachment.blob), { status: 201 });
    } catch (e: any) {
      // Unique constraint violation — already attached
      if (e?.code === 'P2002') {
        return NextResponse.json({ error: 'File already attached to this entity' }, { status: 409 });
      }
      throw e;
    }
  } catch (error) {
    console.error('Failed to upload attachment:', error);
    return NextResponse.json({ error: 'Failed to upload attachment' }, { status: 500 });
  }
}

