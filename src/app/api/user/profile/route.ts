import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth-utils';
import { db } from '@/lib/db';

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json(user);
}

export async function PUT(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const body = await request.json();
  const { name } = body;

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return NextResponse.json({ error: 'Name must be at least 2 characters' }, { status: 400 });
  }

  const trimmedName = name.trim();

  const existing = await db.user.findFirst({
    where: {
      name: trimmedName,
      NOT: { id: userId },
    },
  });

  if (existing) {
    return NextResponse.json({ error: 'This name is already taken' }, { status: 409 });
  }

  const updated = await db.user.update({
    where: { id: userId },
    data: { name: trimmedName },
    select: { id: true, name: true, email: true },
  });

  return NextResponse.json(updated);
}
