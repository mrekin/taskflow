import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUserId } from '@/lib/auth-utils';
import { canReadEntity, resolveEffectiveVisibility } from '@/lib/visibility';
import { getStorageAdapter } from '@/lib/storage';

// GET /api/attachments/file/[blobId] — serve file
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ blobId: string }> }
) {
  try {
    const { blobId } = await params;
    const userId = await getCurrentUserId();

    const blob = await db.fileBlob.findUnique({
      where: { id: blobId },
      include: { attachments: { take: 1, include: { blob: true } } },
    });

    if (!blob || blob.attachments.length === 0) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Check access via first attachment's entity
    const att = blob.attachments[0];
    const entity = await getEntity(att.entityId, att.entityType);
    if (!entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    const vis = parseVisibility(entity);
    const effectiveVis = resolveEffectiveVisibility(vis.visibility, []);
    if (!canReadEntity(userId, entity.ownerId, effectiveVis, vis.visibleUserIds, !!userId)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Serve file
    const storage = getStorageAdapter();
    const data = await storage.get(blob.storageKey);
    if (!data) {
      return NextResponse.json({ error: 'File data not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const disposition = searchParams.get('disposition') || 'attachment';

    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': blob.mimeType,
        'Content-Length': String(data.length),
        'Content-Disposition': `${disposition}; filename="${encodeURIComponent(blob.originalName)}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Failed to serve attachment file:', error);
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 });
  }
}

async function getEntity(entityId: string, entityType: string) {
  if (entityType === 'task') {
    return db.task.findUnique({ where: { id: entityId }, select: { id: true, ownerId: true, visibility: true, visibleUserIds: true } });
  }
  if (entityType === 'note') {
    return db.note.findUnique({ where: { id: entityId }, select: { id: true, ownerId: true, visibility: true, visibleUserIds: true } });
  }
  return null;
}

function parseVisibility(entity: { visibility: string | null; visibleUserIds: string }) {
  let visibleUserIds: string[] = [];
  try { visibleUserIds = JSON.parse(entity.visibleUserIds || '[]'); } catch {}
  return { visibility: entity.visibility, visibleUserIds };
}
