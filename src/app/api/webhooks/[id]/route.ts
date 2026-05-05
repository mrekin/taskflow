import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth-utils';

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
        _count: { select: { deliveries: true, triggers: true } },
        triggers: true,
      },
    });

    if (!webhook) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }

    return NextResponse.json({
      ...webhook,
      headers: JSON.parse(webhook.headers),
      triggers: webhook.triggers.map((t) => ({
        ...t,
        events: JSON.parse(t.events || '[]'),
      })),
      _count: { deliveries: webhook._count.deliveries, triggers: webhook._count.triggers },
    });
  } catch (error) {
    console.error('Failed to fetch webhook:', error);
    return NextResponse.json({ error: 'Failed to fetch webhook' }, { status: 500 });
  }
}

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
    const { name, url, method, headers, bodyTemplate, active } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (url !== undefined) updateData.url = url.trim();
    if (method !== undefined) updateData.method = method.toUpperCase();
    if (headers !== undefined) updateData.headers = JSON.stringify(headers);
    if (bodyTemplate !== undefined) updateData.bodyTemplate = bodyTemplate || null;
    if (active !== undefined) updateData.active = active;

    const webhook = await db.webhook.update({
      where: { id },
      data: updateData,
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
    });
  } catch (error) {
    console.error('Failed to update webhook:', error);
    return NextResponse.json({ error: 'Failed to update webhook' }, { status: 500 });
  }
}

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
