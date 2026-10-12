import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId, requireAuth } from '@/lib/auth-utils';
import { WebhookService } from '@/services/webhook.service';
import { ensureNoBearer } from '@/lib/api-token';

export async function GET(request: Request) {
  try {
    const blocked = await ensureNoBearer(request);
    if (blocked) return blocked;
    const userId = await getCurrentUserId();
    const result = await WebhookService.listWebhooks(userId);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error('Failed to fetch webhooks:', error);
    return NextResponse.json({ error: 'Failed to fetch webhooks' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const blocked = await ensureNoBearer(request);
    if (blocked) return blocked;
    const authResult = await requireAuth();
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const body = await request.json();
    const result = await WebhookService.createWebhook(userId, body);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    console.error('Failed to create webhook:', error);
    return NextResponse.json({ error: 'Failed to create webhook' }, { status: 500 });
  }
}
