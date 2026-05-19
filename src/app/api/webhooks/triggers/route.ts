import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { WebhookService } from '@/services/webhook.service';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const body = await request.json();
    const result = await WebhookService.createTrigger(userId, body);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    console.error('Failed to create trigger:', error);
    return NextResponse.json({ error: 'Failed to create trigger' }, { status: 500 });
  }
}
