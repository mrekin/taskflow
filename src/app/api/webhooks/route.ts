import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUserId, requireAuth } from '@/lib/auth-utils';

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const webhooks = await db.webhook.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { deliveries: true, triggers: true } },
        triggers: true,
      },
    });

    const result = webhooks.map((wh) => ({
      ...wh,
      headers: JSON.parse(wh.headers || '{}'),
      triggers: wh.triggers.map((t) => ({
        ...t,
        events: JSON.parse(t.events || '[]'),
      })),
      _count: { deliveries: wh._count.deliveries, triggers: wh._count.triggers },
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to fetch webhooks:', error);
    return NextResponse.json({ error: 'Failed to fetch webhooks' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const body = await request.json();
    const { name, url, method, headers, bodyTemplate, active } = body;

    if (!url || !name) {
      return NextResponse.json({ error: 'Name and URL are required' }, { status: 400 });
    }

    const webhook = await db.webhook.create({
      data: {
        name: name.trim(),
        url: url.trim(),
        method: method?.toUpperCase() || 'POST',
        headers: JSON.stringify(headers || {}),
        bodyTemplate: bodyTemplate || null,
        active: active !== false,
        ownerId: userId,
      },
      include: {
        triggers: true,
      },
    });

    return NextResponse.json({
      ...webhook,
      headers: JSON.parse(webhook.headers),
      triggers: webhook.triggers.map((t) => ({
        ...t,
        events: JSON.parse(t.events || '[]'),
      })),
    }, { status: 201 });
  } catch (error) {
    console.error('Failed to create webhook:', error);
    return NextResponse.json({ error: 'Failed to create webhook' }, { status: 500 });
  }
}
