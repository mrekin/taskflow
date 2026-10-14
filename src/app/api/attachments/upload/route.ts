import { NextRequest, NextResponse } from 'next/server';
import {
  requireApiAuth,
  getTokenProjectScope,
  tokenAllowsProject,
  resolveEntityProjectId,
  requireTokenPermission,
  tokenEntityFor,
  tokenScopeDeniedResponse,
} from '@/lib/api-token';
import { AttachmentService } from '@/services/attachment.service';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/attachments/upload — upload file (multipart/form-data)
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireApiAuth(request);
    if ('error' in authResult) return authResult.error;
    const { userId, token } = authResult;

    const formData = await request.formData();

    if (token) {
      const entityId = formData.get('entityId');
      const entityType = formData.get('entityType');
      if (typeof entityId === 'string' && typeof entityType === 'string') {
        const permEntity = tokenEntityFor(entityType);
        if (!permEntity) {
          return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
        }
        const denied = requireTokenPermission(token, permEntity, 'update');
        if (denied) return denied;
        const scope = await getTokenProjectScope({ userId, token });
        const project = await resolveEntityProjectId(
          entityType as 'task' | 'note' | 'comment',
          entityId,
        );
        if (!tokenAllowsProject(scope, project)) return tokenScopeDeniedResponse(token);
      }
    }

    const result = await AttachmentService.uploadAttachment(userId, formData);

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    console.error('Failed to upload attachment:', error);
    return NextResponse.json({ error: 'Failed to upload attachment' }, { status: 500 });
  }
}
