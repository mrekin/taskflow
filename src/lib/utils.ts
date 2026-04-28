import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Get a short display ID from a CUID.
 * Shows first 8 characters for readability while remaining unique enough.
 */
export function shortId(id: string): string {
  return id.slice(0, 8);
}

/**
 * Entity type prefix for mentions and links
 */
export type EntityType = 'task' | 'project' | 'note' | 'area';

/**
 * Build a direct link URL for an entity.
 * Uses query parameters since we only have a single page route.
 */
export function getEntityLink(type: EntityType, id: string): string {
  const base = window.location.pathname;
  return `${base}?${type}=${id}`;
}

/**
 * Parse an entity reference from text like #T-abc12345 or #TASK-abc12345
 * Returns { type, id } or null if not a valid reference.
 */
export function parseEntityReference(text: string): { type: EntityType; id: string } | null {
  const match = text.match(/^#(?:([TPNA])|task|project|note|area)-([a-z0-9]+)$/i);
  if (!match) return null;

  const prefixMap: Record<string, EntityType> = {
    T: 'task',
    P: 'project',
    N: 'note',
    A: 'area',
  };

  const type = match[1]
    ? prefixMap[match[1].toUpperCase()]
    : text.toLowerCase().startsWith('#task') ? 'task'
    : text.toLowerCase().startsWith('#project') ? 'project'
    : text.toLowerCase().startsWith('#note') ? 'note'
    : 'area';

  if (!type) return null;
  return { type, id: match[2] };
}

/**
 * Format an entity reference for display in markdown.
 * Usage: #T-cuid or #TASK-cuid
 */
export function formatEntityRef(type: EntityType, id: string): string {
  const prefixMap: Record<EntityType, string> = {
    task: 'T',
    project: 'P',
    note: 'N',
    area: 'A',
  };
  return `#${prefixMap[type]}-${shortId(id)}`;
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
