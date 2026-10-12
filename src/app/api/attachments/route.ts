import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  authenticateRequest,
  requireApiAuth,
  getTokenProjectScope,
  tokenAllowsProject,
  resolveEntityProjectId,
  requireTokenPermission,
  tokenEntityFor,
  tokenScopeDeniedResponse,
  type ValidatedApiToken,
} from '@/lib/api-token';
import { AttachmentService } from '@/services/attachment.service';

/** Token gate shared by list/delete: parent entity's permission entity + project scope. */
async function guardParentAccess(
  auth: { userId: string; token: ValidatedApiToken },
  action: 'read' | 'delete',
  entityId: string,
  entityType: string,
): Promise<NextResponse | null> {
  const permEntity = tokenEntityFor(entityType);
  if (!permEntity) {
    return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
  }
  const denied = requireTokenPermission(auth.token, permEntity, action);
  if (denied) return denied;
  const scope = await getTokenProjectScope(auth);
  const project = await resolveEntityProjectId(
    entityType as 'task' | 'note' | 'comment',
    entityId,
  );
  if (!tokenAllowsProject(scope, project)) return tokenScopeDeniedResponse(auth.token);
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.ok) return auth.response;
    const userId = auth.ctx.kind === 'anonymous' ? null : auth.ctx.userId;

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');
    const entityType = searchParams.get('entityType');

    if (auth.ctx.kind === 'token' && entityId && entityType) {
      const denied = await guardParentAccess(auth.ctx, 'read', entityId, entityType);
      if (denied) return denied;
    }

    const result = await AttachmentService.listAttachments(userId, entityId ?? '', entityType ?? '');

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error('Failed to fetch attachments:', error);
    return NextResponse.json({ error: 'Failed to fetch attachments' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireApiAuth(request);
    if ('error' in authResult) return authResult.error;
    const { userId, token } = authResult;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (token && id) {
      const attachment = await db.attachment.findUnique({
        where: { id },
        select: { entityId: true, entityType: true },
      });
      if (attachment) {
        const denied = await guardParentAccess({ userId, token }, 'delete', attachment.entityId, attachment.entityType);
        if (denied) return denied;
      }
    }

    const result = await AttachmentService.deleteAttachment(userId, id ?? '');

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error('Failed to delete attachment:', error);
    return NextResponse.json({ error: 'Failed to delete attachment' }, { status: 500 });
  }
}
