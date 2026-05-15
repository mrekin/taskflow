import { NextResponse } from 'next/server';
import { getAttachmentConfig } from '@/lib/attachment-config';
import { getUserStorageUsed } from '@/lib/attachment-storage';
import { requireAuth } from '@/lib/auth-utils';

// GET /api/attachments/config — client-side config
export async function GET() {
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
