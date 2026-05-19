import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth-utils';
import { AttachmentService } from '@/services/attachment.service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ blobId: string }> }
) {
  try {
    const { blobId } = await params;
    const userId = await getCurrentUserId();

    const result = await AttachmentService.serveFile(userId, blobId);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    const { searchParams } = new URL(request.url);
    const disposition = searchParams.get('disposition') || 'attachment';

    return new NextResponse(result.data.data, {
      headers: {
        'Content-Type': result.data.mimeType,
        'Content-Length': String(result.data.data.length),
        'Content-Disposition': `${disposition}; filename="${encodeURIComponent(result.data.originalName)}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Failed to serve attachment file:', error);
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 });
  }
}
