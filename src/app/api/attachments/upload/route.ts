import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth-utils';
import { getStorageAdapter } from '@/lib/storage';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/attachments/upload — Step 2: upload file
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const uploadToken = formData.get('uploadToken') as string | null;

    if (!file || !uploadToken) {
      return NextResponse.json({ error: 'file and uploadToken are required' }, { status: 400 });
    }

    // Decode and validate token
    let tokenData: { hash: string; fileName: string; size: number; entityId: string; entityType: string; userId: string; exp: number };
    try {
      tokenData = JSON.parse(Buffer.from(uploadToken, 'base64url').toString());
    } catch {
      return NextResponse.json({ error: 'Invalid upload token' }, { status: 400 });
    }

    if (tokenData.userId !== userId) {
      return NextResponse.json({ error: 'Token user mismatch' }, { status: 403 });
    }

    if (Date.now() > tokenData.exp) {
      return NextResponse.json({ error: 'Upload token expired' }, { status: 400 });
    }

    if (!['task', 'note'].includes(tokenData.entityType)) {
      return NextResponse.json({ error: 'Invalid entity type' }, { status: 400 });
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Verify hash matches token
    const actualHash = crypto.createHash('sha256').update(buffer).digest('hex');
    if (actualHash !== tokenData.hash) {
      return NextResponse.json({ error: 'File hash mismatch' }, { status: 400 });
    }

    // Check for duplicate blob (race condition protection)
    const existingBlob = await db.fileBlob.findUnique({ where: { hash: actualHash } });

    let blobId: string;
    let storageKey: string;

    if (existingBlob) {
      blobId = existingBlob.id;
      storageKey = existingBlob.storageKey;
    } else {
      // Generate storage key: {hash[0:2]}/{hash[2:4]}/{hash}.{ext}
      const ext = tokenData.fileName.includes('.')
        ? tokenData.fileName.slice(tokenData.fileName.lastIndexOf('.') + 1)
        : 'bin';
      storageKey = `${actualHash.slice(0, 2)}/${actualHash.slice(2, 4)}/${actualHash}.${ext}`;

      // Store file
      const storage = getStorageAdapter();
      await storage.put(storageKey, buffer, file.type || 'application/octet-stream');

      // Create blob record
      const blob = await db.fileBlob.create({
        data: {
          hash: actualHash,
          size: buffer.length,
          mimeType: file.type || 'application/octet-stream',
          originalName: tokenData.fileName,
          storageKey,
          ownerId: userId,
        },
      });
      blobId = blob.id;
    }

    // Create attachment (check unique constraint)
    try {
      const attachment = await db.attachment.create({
        data: {
          entityId: tokenData.entityId,
          entityType: tokenData.entityType,
          blobId,
          displayName: tokenData.fileName,
          ownerId: userId,
        },
        include: { blob: true },
      });

      return NextResponse.json({
        id: attachment.id,
        entityId: attachment.entityId,
        entityType: attachment.entityType,
        blobId: attachment.blobId,
        displayName: attachment.displayName,
        ownerId: attachment.ownerId,
        createdAt: attachment.createdAt.toISOString(),
        blob: {
          id: attachment.blob.id,
          hash: attachment.blob.hash,
          size: attachment.blob.size,
          mimeType: attachment.blob.mimeType,
          originalName: attachment.blob.originalName,
        },
      }, { status: 201 });
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
