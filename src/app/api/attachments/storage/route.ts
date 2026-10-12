import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { getAttachmentConfig } from '@/lib/attachment-config';
import { getServerStorageUsed, getUserStorageUsed } from '@/lib/attachment-storage';
import { ensureNoBearer } from '@/lib/api-token';

// GET /api/attachments/storage — storage usage info
export async function GET(request: Request) {
    const blocked = await ensureNoBearer(request);
    if (blocked) return blocked;
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
