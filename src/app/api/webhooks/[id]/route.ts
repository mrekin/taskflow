import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth-utils';

// GET /api/webhooks/[id] - Get single webhook
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;
    const webhook = await db.webhook.findFirst({
      where: { id, ownerId: userId },
      include: {
        _count: { select: { deliveries: true } },
      },
    });

    if (!webhook) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }

    return NextResponse.json({
      ...webhook,
      events: JSON.parse(webhook.events),
      headers: JSON.parse(webhook.headers),
      _count: { deliveries: webhook._count.deliveries },
    });
  } catch (error) {
    console.error('Failed to fetch webhook:', error);
    return NextResponse.json({ error: 'Failed to fetch webhook' }, { status: 500 });
  }
}

// PUT /api/webhooks/[id] - Update webhook
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;
    const existing = await db.webhook.findFirst({ where: { id, ownerId: userId } });
    if (!existing) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }

    const body = await request.json();
    const { name, url, method, events, scopeType, scopeId, headers, bodyTemplate, active } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (url !== undefined) updateData.url = url.trim();
    if (method !== undefined) updateData.method = method.toUpperCase();
    if (events !== undefined) updateData.events = JSON.stringify(events);
    if (scopeType !== undefined) updateData.scopeType = scopeType || null;
    if (scopeId !== undefined) updateData.scopeId = scopeId || null;
    if (headers !== undefined) updateData.headers = JSON.stringify(headers);
    if (bodyTemplate !== undefined) updateData.bodyTemplate = bodyTemplate || null;
    if (active !== undefined) updateData.active = active;

    const webhook = await db.webhook.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      ...webhook,
      events: JSON.parse(webhook.events),
      headers: JSON.parse(webhook.headers),
    });
  } catch (error) {
    console.error('Failed to update webhook:', error);
    return NextResponse.json({ error: 'Failed to update webhook' }, { status: 500 });
  }
}

// DELETE /api/webhooks/[id] - Delete webhook
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;
    const existing = await db.webhook.findFirst({ where: { id, ownerId: userId } });
    if (!existing) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }

    await db.webhook.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete webhook:', error);
    return NextResponse.json({ error: 'Failed to delete webhook' }, { status: 500 });
  }
}
