import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth-utils';
import { ensureNoBearer } from '@/lib/api-token';
import {
  getIgnoredUserIds,
  MAX_IGNORED_USERS,
  sanitizeUserProfile,
} from '@/lib/visibility';

interface IgnoredUserEntry {
  id: string;
  name: string | null;
  image: string | null;
}

/** Read the caller's ignore list from metadata and hydrate it with sanitized user profiles. */
async function listIgnoredUsers(userId: string): Promise<IgnoredUserEntry[]> {
  const ignoredUserIds = await getIgnoredUserIds(userId);
  if (ignoredUserIds.length === 0) return [];

  const users = await db.user.findMany({
    where: { id: { in: ignoredUserIds } },
    select: { id: true, name: true, email: true, image: true, metadata: true },
  });

  // Keep the stored list order, drop entries whose user no longer exists or
  // has a fully hidden profile (the id alone is still useful for unignoring).
  const byId = new Map(users.map((u) => [u.id, u]));
  const entries: IgnoredUserEntry[] = [];
  for (const id of ignoredUserIds) {
    const user = byId.get(id);
    if (!user) {
      entries.push({ id, name: null, image: null });
      continue;
    }
    const sanitized = sanitizeUserProfile(user);
    entries.push({ id, name: sanitized?.name ?? null, image: sanitized?.image ?? null });
  }
  return entries;
}

async function writeIgnoredUserIds(userId: string, ignoredUserIds: string[]): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { metadata: true } });
  let existing: Record<string, unknown>;
  try {
    existing = JSON.parse(user?.metadata || '{}');
  } catch {
    existing = {};
  }
  existing.ignoredUserIds = ignoredUserIds;
  await db.user.update({
    where: { id: userId },
    data: { metadata: JSON.stringify(existing) },
  });
}

export async function GET(request: Request) {
  const blocked = await ensureNoBearer(request);
  if (blocked) return blocked;

  const auth = await requireAuth();
  if ('error' in auth) return auth.error;

  return NextResponse.json(await listIgnoredUsers(auth.userId));
}

export async function POST(request: Request) {
  const blocked = await ensureNoBearer(request);
  if (blocked) return blocked;

  const auth = await requireAuth();
  if ('error' in auth) return auth.error;
  const { userId } = auth;

  let body: { userId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const targetId = typeof body.userId === 'string' ? body.userId.trim() : '';
  if (!targetId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }
  if (targetId === userId) {
    return NextResponse.json({ error: 'Cannot ignore yourself' }, { status: 400 });
  }

  const target = await db.user.findUnique({ where: { id: targetId }, select: { id: true } });
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const ignoredUserIds = await getIgnoredUserIds(userId);
  if (ignoredUserIds.includes(targetId)) {
    return NextResponse.json({ error: 'User is already ignored' }, { status: 409 });
  }
  if (ignoredUserIds.length >= MAX_IGNORED_USERS) {
    return NextResponse.json({ error: `Ignore list limit reached (${MAX_IGNORED_USERS})` }, { status: 400 });
  }

  await writeIgnoredUserIds(userId, [...ignoredUserIds, targetId]);

  return NextResponse.json(await listIgnoredUsers(userId), { status: 201 });
}

export async function DELETE(request: Request) {
  const blocked = await ensureNoBearer(request);
  if (blocked) return blocked;

  const auth = await requireAuth();
  if ('error' in auth) return auth.error;
  const { userId } = auth;

  const { searchParams } = new URL(request.url);
  const targetId = searchParams.get('userId')?.trim() || '';
  if (!targetId) {
    return NextResponse.json({ error: 'userId query parameter is required' }, { status: 400 });
  }

  const ignoredUserIds = await getIgnoredUserIds(userId);
  if (!ignoredUserIds.includes(targetId)) {
    return NextResponse.json({ error: 'User is not ignored' }, { status: 404 });
  }

  await writeIgnoredUserIds(
    userId,
    ignoredUserIds.filter((id) => id !== targetId),
  );

  return NextResponse.json(await listIgnoredUsers(userId));
}
