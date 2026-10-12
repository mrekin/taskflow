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

// --- list query parameter parsing (shared by tasks/notes/folders routes) ---

export const PAGINATION_MAX_LIMIT = 500;

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export function isPaginated(p: PaginationParams): boolean {
  return p.limit !== undefined || p.offset !== undefined;
}

/** Parses `limit`/`offset` search params. Returns { error } with a 400-worthy message on garbage. */
export function parsePaginationParams(searchParams: URLSearchParams): PaginationParams & { error?: string } {
  const limitRaw = searchParams.get("limit");
  const offsetRaw = searchParams.get("offset");
  const result: PaginationParams = {};
  if (limitRaw !== null) {
    const limit = Number(limitRaw);
    if (!Number.isInteger(limit) || limit < 1 || limit > PAGINATION_MAX_LIMIT) {
      return { error: `Invalid limit: "${limitRaw}" (integer 1..${PAGINATION_MAX_LIMIT})` };
    }
    result.limit = limit;
  }
  if (offsetRaw !== null) {
    const offset = Number(offsetRaw);
    if (!Number.isInteger(offset) || offset < 0) {
      return { error: `Invalid offset: "${offsetRaw}" (integer >= 0)` };
    }
    result.offset = offset;
  }
  return result;
}

/**
 * Parses a comma-separated `tagIds` param into an array (OR semantics: any of the tags).
 * tagIds is stored as a JSON string column, so services match with `contains '"<id>"'`.
 */
export function parseTagIdsParam(raw: string | null): string[] | undefined {
  if (!raw) return undefined;
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}

/**
 * Parses a date filter param: `YYYY-MM-DD` (UTC day bounds, `endOfDay` for inclusive "to")
 * or a full ISO datetime. Returns { error } on unparseable input.
 */
export function parseDateParam(
  raw: string | null,
  name: string,
  endOfDay = false,
): { value?: Date; error?: string } {
  if (!raw) return {};
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const d = dateOnly
    ? new Date(`${raw}${endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z"}`)
    : new Date(raw);
  if (isNaN(d.getTime())) return { error: `Invalid ${name}: "${raw}"` };
  return { value: d };
}

/** Prisma condition matching a JSON-stringified id array column (see parseTagIdsParam). */
export function jsonIdArrayContainsAny(ids: string[]): Record<string, unknown> {
  return { OR: ids.map((id) => ({ tagIds: { contains: `"${id}"` } })) };
}

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
