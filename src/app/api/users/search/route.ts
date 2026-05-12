import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth-utils';
import { db } from '@/lib/db';
import { DEFAULT_PREFERENCES, type ProfileVisibility } from '@/lib/constants';
import { sanitizeUserProfile } from '@/lib/visibility';

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

  const users = await db.user.findMany({
    select: { id: true, name: true, email: true, metadata: true },
    take: 50,
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

      const showName = visibility.nickname && u.name;
      const showEmail = visibility.email;

      if (!showName && !showEmail) return null;

      if (q) {
        const nameMatch = showName && u.name && u.name.toLowerCase().includes(q);
        const emailMatch = showEmail && u.email && u.email.toLowerCase().includes(q);
        if (!nameMatch && !emailMatch) return null;
      }

      const sanitized = sanitizeUserProfile(u);
      if (!sanitized) return null;

      return {
        ...sanitized,
        email: showEmail ? u.email : null,
        label: sanitized.name || u.email,
      };
    })
    .filter(Boolean);

  return NextResponse.json(results);
}
