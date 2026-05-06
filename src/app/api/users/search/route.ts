import { NextRequest, NextResponse } from 'next/server';
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

export async function GET(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json([]);
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim().toLowerCase() || '';

  if (!q || q.length < 1) {
    return NextResponse.json([]);
  }

  const users = await db.user.findMany({
    where: {
      NOT: { id: userId },
      OR: [
        { name: { contains: q } },
        { email: { contains: q } },
      ],
    },
    select: { id: true, name: true, email: true, metadata: true },
    take: 10,
  });

  const results = users
    .map((u) => {
      let metadata: Record<string, unknown>;
      try {
        metadata = JSON.parse(u.metadata || '{}');
      } catch {
        metadata = {};
      }
      const visibility = parseProfileVisibility(metadata.profileVisibility);

      const showNickname = visibility.nickname && u.name;
      const showEmail = visibility.email;

      if (!showNickname && !showEmail) return null;

      return {
        id: u.id,
        name: showNickname ? u.name : null,
        email: showEmail ? u.email : null,
        label: showNickname ? u.name : u.email,
      };
    })
    .filter(Boolean);

  return NextResponse.json(results);
}
