import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { AttachmentService } from '@/services/attachment.service';
import { ensureNoBearer } from '@/lib/api-token';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/attachments/upload — upload file (multipart/form-data)
export async function POST(request: NextRequest) {
  try {
    const blocked = await ensureNoBearer(request);
    if (blocked) return blocked;
    const authResult = await requireAuth();
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const formData = await request.formData();
    const result = await AttachmentService.uploadAttachment(userId, formData);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    console.error('Failed to upload attachment:', error);
    return NextResponse.json({ error: 'Failed to upload attachment' }, { status: 500 });
  }
}
