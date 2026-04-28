// Shared API utility functions for parsing JSON fields from SQLite

/**
 * Parse metadata and tagIds JSON fields from database records.
 * SQLite stores JSON as strings, so we need to parse them for the API response.
 */
export function parseJsonFields(item: Record<string, unknown>) {
  return {
    ...item,
    metadata: JSON.parse((item.metadata as string) || "{}"),
    ...(item.tagIds !== undefined ? { tagIds: JSON.parse((item.tagIds as string) || "[]") } : {}),
  };
}

/** For backward compat - alias */
export const parseMetadata = parseJsonFields;
