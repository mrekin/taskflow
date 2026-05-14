import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { getAttachmentConfig } from '@/lib/attachment-config';
import { getServerStorageUsed, getUserStorageUsed } from '@/lib/attachment-storage';

// GET /api/attachments/storage — storage usage info
export async function GET() {
  const authResult = await requireAuth();
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult;

  const config = getAttachmentConfig();

  const [serverUsed, userUsed] = await Promise.all([
    getServerStorageUsed(),
    getUserStorageUsed(userId),
  ]);

  return NextResponse.json({
    serverUsed,
    serverLimit: config.totalSize,
    userUsed,
    userLimit: config.userMaxSize,
  });
}
