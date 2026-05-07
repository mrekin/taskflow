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
    return NextResponse.json({ exists: false });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id')?.trim();
  if (!id) {
    return NextResponse.json({ exists: false });
  }

  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, metadata: true },
  });

  if (!user) {
    return NextResponse.json({ exists: false });
  }

  let metadata: Record<string, unknown>;
  try {
    metadata = JSON.parse(user.metadata || '{}');
  } catch {
    metadata = {};
  }
  const visibility = parseProfileVisibility(metadata.profileVisibility);

  return NextResponse.json({
    exists: true,
    name: visibility.nickname ? user.name : null,
    email: visibility.email ? user.email : null,
  });
}
