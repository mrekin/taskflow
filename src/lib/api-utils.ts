const basePath = process.env.NEXT_BASE_PATH || '';
export const api = (path: string) => `${basePath}${path}`;

// Shared API utility functions for parsing JSON fields from SQLite

import type { EntityType } from './utils';
import { SHORT_ID_PREFIX } from './utils';

/**
 * Parse metadata and tagIds JSON fields from database records.
 * SQLite stores JSON as strings, so we need to parse them for the API response.
 * Also computes shortId from shortIdNum and entityType.
 */
export function parseJsonFields(item: Record<string, unknown>, entityType?: EntityType) {
  const result: Record<string, unknown> = {
    ...item,
    metadata: JSON.parse((item.metadata as string) || "{}"),
    ...(item.tagIds !== undefined ? { tagIds: JSON.parse((item.tagIds as string) || "[]") } : {}),
    ...(item.visibleUserIds !== undefined ? { visibleUserIds: JSON.parse((item.visibleUserIds as string) || "[]") } : {}),
  };

  // Compute shortId if entityType is provided
  if (entityType) {
    const num = typeof item.shortIdNum === 'number' ? item.shortIdNum : 0;
    result.shortId = `${SHORT_ID_PREFIX[entityType]}-${num}`;
    result.shortIdNum = num;
  }

  return result;
}

/** For backward compat - alias */
export const parseMetadata = parseJsonFields;

/**
 * Get the next shortIdNum for a given entity type and owner.
 * Finds the max shortIdNum and increments by 1.
 */
export async function getNextShortIdNum(
  model: { findFirst: (args: any) => Promise<{ shortIdNum: number } | null> },
  ownerId: string
): Promise<number> {
  const maxRecord = await model.findFirst({
    where: { ownerId },
    orderBy: { shortIdNum: 'desc' },
    select: { shortIdNum: true },
  });
  return (maxRecord?.shortIdNum ?? 0) + 1;
}
