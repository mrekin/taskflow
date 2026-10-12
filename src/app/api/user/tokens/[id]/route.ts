import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth-utils';
import { ensureNoBearer, logToken } from '@/lib/api-token';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const blocked = await ensureNoBearer(request);
  if (blocked) return blocked;

  const auth = await requireAuth();
  if ('error' in auth) return auth.error;
  const { userId } = auth;
  const { id } = await params;

  const token = await db.apiToken.findFirst({ where: { id, userId } });
  if (!token) {
    return NextResponse.json({ error: 'Token not found' }, { status: 404 });
  }

  await db.apiToken.delete({ where: { id } });
  logToken(`deleted token "${token.name}" (${token.tokenPrefix}) by user ${userId}`);
  return NextResponse.json({ ok: true });
}
