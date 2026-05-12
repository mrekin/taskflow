import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth-utils';
import { db } from '@/lib/db';
import { sanitizeUserProfile } from '@/lib/visibility';

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
    select: { id: true, name: true, email: true, image: true, metadata: true },
  });

  if (!user) {
    return NextResponse.json({ exists: false });
  }

  const sanitized = sanitizeUserProfile(user);

  if (!sanitized) {
    return NextResponse.json({ exists: true, name: null, email: null });
  }

  return NextResponse.json({
    exists: true,
    name: sanitized.name,
    email: sanitized.name === user.email ? user.email : null,
  });
}
