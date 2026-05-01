import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth-utils';
import { db } from '@/lib/db';
import { DEFAULT_PREFERENCES, type UserPreferences } from '@/lib/constants';

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const user = await db.user.findUnique({ where: { id: userId }, select: { metadata: true } });
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  let metadata: Record<string, unknown>;
  try {
    metadata = JSON.parse(user.metadata || '{}');
  } catch {
    metadata = {};
  }

  const preferences: UserPreferences = {
    noteAutoSave: metadata.noteAutoSave !== undefined ? Boolean(metadata.noteAutoSave) : DEFAULT_PREFERENCES.noteAutoSave,
    notesTree: metadata.notesTree !== undefined ? Boolean(metadata.notesTree) : DEFAULT_PREFERENCES.notesTree,
    defaultPage: (metadata.defaultPage as UserPreferences['defaultPage']) || DEFAULT_PREFERENCES.defaultPage,
  };

  return NextResponse.json(preferences);
}

export async function PUT(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const body = await request.json();

  const validDefaultPages = ['quick-create', 'tasks', 'kanban', 'notes'];

  const noteAutoSave = typeof body.noteAutoSave === 'boolean' ? body.noteAutoSave : undefined;
  const notesTree = typeof body.notesTree === 'boolean' ? body.notesTree : undefined;
  const defaultPage = validDefaultPages.includes(body.defaultPage) ? body.defaultPage : undefined;

  const user = await db.user.findUnique({ where: { id: userId }, select: { metadata: true } });
  let existing: Record<string, unknown>;
  try {
    existing = JSON.parse(user?.metadata || '{}');
  } catch {
    existing = {};
  }

  if (noteAutoSave !== undefined) existing.noteAutoSave = noteAutoSave;
  if (notesTree !== undefined) existing.notesTree = notesTree;
  if (defaultPage !== undefined) existing.defaultPage = defaultPage;

  await db.user.update({
    where: { id: userId },
    data: { metadata: JSON.stringify(existing) },
  });

  const preferences: UserPreferences = {
    noteAutoSave: existing.noteAutoSave !== undefined ? Boolean(existing.noteAutoSave) : DEFAULT_PREFERENCES.noteAutoSave,
    notesTree: existing.notesTree !== undefined ? Boolean(existing.notesTree) : DEFAULT_PREFERENCES.notesTree,
    defaultPage: (existing.defaultPage as UserPreferences['defaultPage']) || DEFAULT_PREFERENCES.defaultPage,
  };

  return NextResponse.json(preferences);
}
