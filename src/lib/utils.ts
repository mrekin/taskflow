import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Entity type prefix for mentions and links
 */
export type EntityType = 'task' | 'project' | 'note' | 'area' | 'folder';

/**
 * Short ID prefix map - maps entity type to display prefix
 */
export const SHORT_ID_PREFIX: Record<EntityType, string> = {
  task: 'T',
  project: 'P',
  note: 'N',
  area: 'A',
  folder: 'F',
};

/**
 * Format a short ID for display (e.g., "T-7", "P-3")
 */
export function formatShortId(type: EntityType, shortIdNum: number): string {
  return `${SHORT_ID_PREFIX[type]}-${shortIdNum}`;
}

/**
 * Get a short display ID from a CUID (legacy).
 * Shows first 8 characters for readability while remaining unique enough.
 */
export function shortId(id: string): string {
  return id.slice(0, 8);
}

/**
 * Build a direct link URL for an entity.
 * Uses shortId format (e.g., ?task=T-7, ?project=P-3) for human-readable URLs.
 * Optional `version` appends &v=N (used for note version deep-links).
 */
export function getEntityLink(type: EntityType, shortId: string, entityId?: string, version?: number): string {
  const base = window.location.pathname;
  const param = `${type}=${shortId}`;
  let url = entityId ? `${base}?${param}&id=${entityId}` : `${base}?${param}`;
  if (version !== undefined) url += `&v=${version}`;
  return url;
}

/**
 * Check if a string looks like a shortId (e.g., "T-7", "P-3", "N-12", "A-2")
 */
export function isShortId(value: string): boolean {
  return /^[TPNAF]-\d+$/i.test(value);
}

/**
 * Find an entity in a list by shortId (e.g., "T-7", "P-3")
 */
export function findByShortId<T extends { shortId?: string }>(list: T[], shortId: string): T | undefined {
  return list.find((item) => item.shortId === shortId);
}

/**
 * Parse an entity reference from text like #T-7, #P-3, #N-12, #A-2
 * Returns { type, shortIdNum } or null if not a valid reference.
 */
export function parseEntityReference(text: string): { type: EntityType; shortIdNum: number } | null {
  const match = text.match(/^#([TPNA])-(\d+)$/i);
  if (!match) return null;

  const prefixMap: Record<string, EntityType> = {
    T: 'task',
    P: 'project',
    N: 'note',
    A: 'area',
    F: 'folder',
  };
  const type = prefixMap[match[1].toUpperCase()];
  if (!type) return null;
  return { type, shortIdNum: parseInt(match[2], 10) };
}

/**
 * Format an entity reference for display in markdown.
 * Usage: #T-7, #P-3, #N-12, #A-2
 */
export function formatEntityRef(type: EntityType, shortIdNum: number): string {
  return `#${SHORT_ID_PREFIX[type]}-${shortIdNum}`;
}

/**
 * Copy text to clipboard with fallback
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const result = document.execCommand('copy');
    document.body.removeChild(textarea);
    return result;
  }
}
