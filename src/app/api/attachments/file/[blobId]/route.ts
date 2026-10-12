import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  authenticateRequest,
  getTokenProjectScope,
  tokenAllowsProject,
  tokenCan,
  resolveEntityProjectId,
  tokenEntityFor,
  tokenScopeDeniedResponse,
} from '@/lib/api-token';
import { AttachmentService } from '@/services/attachment.service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ blobId: string }> }
) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.ok) return auth.response;
    const userId = auth.ctx.kind === 'anonymous' ? null : auth.ctx.userId;

    const { blobId } = await params;

    if (auth.ctx.kind === 'token') {
      const token = auth.ctx.token;
      // Blobs are content-addressed and shared between attachments (dedup), so access is
      // allowed when ANY referencing entity is readable and inside the token scope.
      const attachments = await db.attachment.findMany({
        where: { blobId },
        select: { entityId: true, entityType: true },
      });
      if (attachments.length > 0) {
        const scope = await getTokenProjectScope(auth.ctx);
        let allowed = false;
        for (const attachment of attachments) {
          const permEntity = tokenEntityFor(attachment.entityType);
          if (!permEntity || !tokenCan(token, permEntity, 'read')) continue;
          const project = await resolveEntityProjectId(
            attachment.entityType as 'task' | 'note' | 'comment',
            attachment.entityId,
          );
          if (tokenAllowsProject(scope, project)) {
            allowed = true;
            break;
          }
        }
        if (!allowed) return tokenScopeDeniedResponse(token);
      }
    }

    const result = await AttachmentService.serveFile(userId, blobId);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    const { searchParams } = new URL(request.url);
    const disposition = searchParams.get('disposition') || 'attachment';

    return new NextResponse(Buffer.from(result.data.data), {
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
