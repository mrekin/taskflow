import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth-utils';
import { dispatchWebhook } from '@/lib/webhook-engine';
import type { WebhookContext, WebhookEvent } from '@/lib/webhook-engine';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;
    const webhook = await db.webhook.findFirst({ where: { id, ownerId: userId } });
    if (!webhook) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }

    const events: string[] = JSON.parse(webhook.events || '[]');
    const testEvent = (events[0] || 'task.status_changed') as WebhookEvent;

    const entityType = testEvent.startsWith('task.') ? 'task' as const : 'project' as const;

    const ctx: WebhookContext = {
      event: testEvent,
      entityType,
      entityId: 'test-entity-id',
      entityTitle: `Test ${entityType}`,
      entityShortId: entityType === 'task' ? 'T-0' : 'P-0',
      changes: { status: { from: 'todo', to: 'in_progress' } },
      ownerId: userId,
    };

    const result = await dispatchWebhook(
      {
        id: webhook.id,
        url: webhook.url,
        method: webhook.method,
        events: webhook.events,
        scopeType: webhook.scopeType,
        scopeId: webhook.scopeId,
        headers: webhook.headers,
        bodyTemplate: webhook.bodyTemplate,
        active: webhook.active,
        ownerId: webhook.ownerId,
      },
      ctx
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to test webhook:', error);
    return NextResponse.json({ error: 'Failed to test webhook' }, { status: 500 });
  }
}
