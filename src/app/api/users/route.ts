import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth-utils';
import { db } from '@/lib/db';
import { DEFAULT_PREFERENCES, type ProfileVisibility } from '@/lib/constants';

function parseProfileVisibility(value: unknown): ProfileVisibility {
  if (!value || typeof value !== 'object') return DEFAULT_PREFERENCES.profileVisibility;
  const v = value as Record<string, unknown>;
  return {
    nickname: typeof v.nickname === 'boolean' ? v.nickname : DEFAULT_PREFERENCES.profileVisibility.nickname,
    email: typeof v.email === 'boolean' ? v.email : DEFAULT_PREFERENCES.profileVisibility.email,
  };
}

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const users = await db.user.findMany({
      select: { id: true, name: true, email: true, image: true, metadata: true },
      orderBy: { name: 'asc' },
    });

    const filtered = users
      .map((u) => {
        let metadata: Record<string, unknown>;
        try {
          metadata = JSON.parse(u.metadata || '{}');
        } catch {
          metadata = {};
        }
        const visibility = parseProfileVisibility(metadata.profileVisibility);

        const showName = visibility.nickname && u.name;
        const showEmail = visibility.email;

        if (!showName && !showEmail) return null;

        return {
          id: u.id,
          name: showName ? u.name : null,
          image: u.image,
        };
      })
      .filter(Boolean);

    return NextResponse.json(filtered);
  } catch (error) {
    console.error('Failed to fetch users:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}
