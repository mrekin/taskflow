import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth-utils';
import { db } from '@/lib/db';
import { DEFAULT_PREFERENCES, type UserPreferences, type StatusConfig } from '@/lib/constants';

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
    showSubtasks: metadata.showSubtasks !== undefined ? Boolean(metadata.showSubtasks) : DEFAULT_PREFERENCES.showSubtasks,
    defaultPage: (metadata.defaultPage as UserPreferences['defaultPage']) || DEFAULT_PREFERENCES.defaultPage,
    customStatuses: parseStatuses(metadata.customStatuses),
  };

  return NextResponse.json(preferences);
}

function parseStatuses(value: unknown): StatusConfig[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return value as StatusConfig[];
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
  const showSubtasks = typeof body.showSubtasks === 'boolean' ? body.showSubtasks : undefined;
  const defaultPage = validDefaultPages.includes(body.defaultPage) ? body.defaultPage : undefined;
  const customStatuses = body.customStatuses === null ? null : parseStatuses(body.customStatuses);

  const user = await db.user.findUnique({ where: { id: userId }, select: { metadata: true } });
  let existing: Record<string, unknown>;
  try {
    existing = JSON.parse(user?.metadata || '{}');
  } catch {
    existing = {};
  }

  if (noteAutoSave !== undefined) existing.noteAutoSave = noteAutoSave;
  if (notesTree !== undefined) existing.notesTree = notesTree;
  if (showSubtasks !== undefined) existing.showSubtasks = showSubtasks;
  if (defaultPage !== undefined) existing.defaultPage = defaultPage;
  if (customStatuses !== undefined) existing.customStatuses = customStatuses;

  await db.user.update({
    where: { id: userId },
    data: { metadata: JSON.stringify(existing) },
  });

  const preferences: UserPreferences = {
    noteAutoSave: existing.noteAutoSave !== undefined ? Boolean(existing.noteAutoSave) : DEFAULT_PREFERENCES.noteAutoSave,
    notesTree: existing.notesTree !== undefined ? Boolean(existing.notesTree) : DEFAULT_PREFERENCES.notesTree,
    showSubtasks: existing.showSubtasks !== undefined ? Boolean(existing.showSubtasks) : DEFAULT_PREFERENCES.showSubtasks,
    defaultPage: (existing.defaultPage as UserPreferences['defaultPage']) || DEFAULT_PREFERENCES.defaultPage,
    customStatuses: parseStatuses(existing.customStatuses),
  };

  return NextResponse.json(preferences);
}
