import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { AttachmentService } from '@/services/attachment.service';
import { ensureNoBearer } from '@/lib/api-token';

export async function POST(request: NextRequest) {
  try {
    const blocked = await ensureNoBearer(request);
    if (blocked) return blocked;
    const authResult = await requireAuth();
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const body = await request.json();
    const result = await AttachmentService.checkAttachment(userId, body);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error('Failed to check attachment:', error);
    return NextResponse.json({ error: 'Failed to check attachment' }, { status: 500 });
  }
}
