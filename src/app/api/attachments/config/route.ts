import { NextResponse } from 'next/server';
import { getAttachmentConfig } from '@/lib/attachment-config';
import { getUserStorageUsed } from '@/lib/attachment-storage';
import { requireAuth } from '@/lib/auth-utils';
import { ensureNoBearer } from '@/lib/api-token';

// GET /api/attachments/config — client-side config
export async function GET(request: Request) {
    const blocked = await ensureNoBearer(request);
    if (blocked) return blocked;
  const config = getAttachmentConfig();

  let userStorageUsed = 0;
  const authResult = await requireAuth();
  if (!('error' in authResult)) {
    userStorageUsed = await getUserStorageUsed(authResult.userId);
  }

  return NextResponse.json({
    maxSize: config.maxSize,
    maxPerEntity: config.maxPerEntity,
    maxPerComment: config.maxPerComment,
    allowedPatterns: config.allowedPatterns,
    userMaxSize: config.userMaxSize,
    userStorageUsed,
  });
}
