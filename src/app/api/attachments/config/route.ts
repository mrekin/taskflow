import { NextResponse } from 'next/server';
import { getAttachmentConfig } from '@/lib/attachment-config';

// GET /api/attachments/config — client-side config
export async function GET() {
  const config = getAttachmentConfig();
  return NextResponse.json({
    maxSize: config.maxSize,
    maxPerEntity: config.maxPerEntity,
    allowedPatterns: config.allowedPatterns,
  });
}
