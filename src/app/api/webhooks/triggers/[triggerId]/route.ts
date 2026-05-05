import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth-utils';

const VALID_EVENTS = [
  'task.status_changed',
  'task.priority_changed',
  'task.due_date_reached',
  'task.created',
  'project.status_changed',
  'project.created',
];

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ triggerId: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { triggerId } = await params;
    const trigger = await db.webhookTrigger.findUnique({
      where: { id: triggerId },
      include: { webhook: { select: { ownerId: true } } },
    });

    if (!trigger || trigger.webhook.ownerId !== userId) {
      return NextResponse.json({ error: 'Trigger not found' }, { status: 404 });
    }

    const body = await request.json();
    const { events, scopeType, scopeId, active } = body;

    const updateData: Record<string, unknown> = {};
    if (events !== undefined) {
      if (!Array.isArray(events) || events.length === 0) {
        return NextResponse.json({ error: 'At least one event is required' }, { status: 400 });
      }
      const invalidEvents = events.filter((e: string) => !VALID_EVENTS.includes(e));
      if (invalidEvents.length > 0) {
        return NextResponse.json(
          { error: `Invalid events: ${invalidEvents.join(', ')}` },
          { status: 400 }
        );
      }
      updateData.events = JSON.stringify(events);
    }
    if (scopeType !== undefined) updateData.scopeType = scopeType || null;
    if (scopeId !== undefined) updateData.scopeId = scopeId || null;
    if (active !== undefined) updateData.active = active;

    const updated = await db.webhookTrigger.update({
      where: { id: triggerId },
      data: updateData,
    });

    return NextResponse.json({
      ...updated,
      events: JSON.parse(updated.events),
    });
  } catch (error) {
    console.error('Failed to update trigger:', error);
    return NextResponse.json({ error: 'Failed to update trigger' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ triggerId: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { triggerId } = await params;
    const trigger = await db.webhookTrigger.findUnique({
      where: { id: triggerId },
      include: { webhook: { select: { ownerId: true } } },
    });

    if (!trigger || trigger.webhook.ownerId !== userId) {
      return NextResponse.json({ error: 'Trigger not found' }, { status: 404 });
    }

    await db.webhookTrigger.delete({ where: { id: triggerId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete trigger:', error);
    return NextResponse.json({ error: 'Failed to delete trigger' }, { status: 500 });
  }
}
