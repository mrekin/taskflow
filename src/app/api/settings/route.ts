import { NextResponse } from 'next/server';
import { DEFAULT_STATUSES, parseStatusesEnv } from '@/lib/constants';

export async function GET() {
  const serverStatuses = parseStatusesEnv(process.env.KANBAN_COLUMNS) || DEFAULT_STATUSES;
  return NextResponse.json({ statuses: serverStatuses });
}
