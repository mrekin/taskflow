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

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const body = await request.json();
    const { webhookId, events, scopeType, scopeId } = body;

    if (!webhookId) {
      return NextResponse.json({ error: 'webhookId is required' }, { status: 400 });
    }

    if (!events || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ error: 'At least one event is required' }, { status: 400 });
    }

    const invalidEvents = events.filter((e: string) => !VALID_EVENTS.includes(e));
    if (invalidEvents.length > 0) {
      return NextResponse.json(
        { error: `Invalid events: ${invalidEvents.join(', ')}` },
        { status: 400 }
      );
    }

    const webhook = await db.webhook.findFirst({
      where: { id: webhookId, ownerId: userId },
    });
    if (!webhook) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }

    const trigger = await db.webhookTrigger.create({
      data: {
        webhookId,
        events: JSON.stringify(events),
        scopeType: scopeType || null,
        scopeId: scopeId || null,
        active: true,
      },
    });

    return NextResponse.json({
      ...trigger,
      events: JSON.parse(trigger.events),
    }, { status: 201 });
  } catch (error) {
    console.error('Failed to create trigger:', error);
    return NextResponse.json({ error: 'Failed to create trigger' }, { status: 500 });
  }
}
