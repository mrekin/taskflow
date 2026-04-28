import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUserId, requireAuth } from '@/lib/auth-utils';

// GET /api/webhooks - List all webhooks for the current user
export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const webhooks = await db.webhook.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { deliveries: true } },
      },
    });

    const result = webhooks.map((wh) => ({
      ...wh,
      events: JSON.parse(wh.events || '[]'),
      headers: JSON.parse(wh.headers || '{}'),
      _count: { deliveries: wh._count.deliveries },
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to fetch webhooks:', error);
    return NextResponse.json({ error: 'Failed to fetch webhooks' }, { status: 500 });
  }
}

// POST /api/webhooks - Create a new webhook
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const body = await request.json();
    const { name, url, method, events, scopeType, scopeId, headers, bodyTemplate, active } = body;

    if (!url || !name) {
      return NextResponse.json({ error: 'Name and URL are required' }, { status: 400 });
    }

    if (!events || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ error: 'At least one event is required' }, { status: 400 });
    }

    const validEvents = [
      'task.status_changed',
      'task.due_date_reached',
      'task.created',
      'project.status_changed',
      'project.created',
    ];
    const invalidEvents = events.filter((e: string) => !validEvents.includes(e));
    if (invalidEvents.length > 0) {
      return NextResponse.json(
        { error: `Invalid events: ${invalidEvents.join(', ')}` },
        { status: 400 }
      );
    }

    const webhook = await db.webhook.create({
      data: {
        name: name.trim(),
        url: url.trim(),
        method: method?.toUpperCase() || 'POST',
        events: JSON.stringify(events),
        scopeType: scopeType || null,
        scopeId: scopeId || null,
        headers: JSON.stringify(headers || {}),
        bodyTemplate: bodyTemplate || null,
        active: active !== false,
        ownerId: userId,
      },
    });

    return NextResponse.json({
      ...webhook,
      events: JSON.parse(webhook.events),
      headers: JSON.parse(webhook.headers),
    }, { status: 201 });
  } catch (error) {
    console.error('Failed to create webhook:', error);
    return NextResponse.json({ error: 'Failed to create webhook' }, { status: 500 });
  }
}
