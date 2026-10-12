import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth-utils';
import { db } from '@/lib/db';
import { sanitizeUserProfile } from '@/lib/visibility';
import { ensureNoBearer } from '@/lib/api-token';

export async function GET(request: Request) {
  try {
    const blocked = await ensureNoBearer(request);
    if (blocked) return blocked;
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const users = await db.user.findMany({
      select: { id: true, name: true, email: true, image: true, metadata: true },
      orderBy: { name: 'asc' },
    });

    const filtered = users
      .map((u) => sanitizeUserProfile(u))
      .filter(Boolean);

    return NextResponse.json(filtered);
  } catch (error) {
    console.error('Failed to fetch users:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}
