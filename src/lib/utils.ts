import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Entity type prefix for mentions and links
 */
export type EntityType = 'task' | 'project' | 'note' | 'area' | 'folder' | 'release';

/**
 * Short ID prefix map - maps entity type to display prefix
 */
export const SHORT_ID_PREFIX: Record<EntityType, string> = {
  task: 'T',
  project: 'P',
  note: 'N',
  area: 'A',
  folder: 'F',
  release: 'R',
};

/**
 * Format a short ID for display (e.g., "T-7", "P-3")
 */
export function formatShortId(type: EntityType, shortIdNum: number): string {
  return `${SHORT_ID_PREFIX[type]}-${shortIdNum}`;
}

/**
 * Comment short ID types: TC-x (task comments, incl. replies) and NC-x
 * (inline note comments, incl. replies). Kept separate from EntityType —
 * comments are not entities in the mentions/link system (no #TC-5 refs).
 */
export type CommentIdType = 'task-comment' | 'note-comment';

export const COMMENT_SHORT_ID_PREFIX: Record<CommentIdType, string> = {
  'task-comment': 'TC',
  'note-comment': 'NC',
};

/**
 * Format a comment short ID for display (e.g., "TC-7", "NC-3").
 * Returns null for legacy comments created before numbering (shortIdNum = 0) —
 * badges are hidden for them instead of showing "TC-0".
 */
export function formatCommentShortId(type: CommentIdType, shortIdNum?: number): string | null {
  if (!shortIdNum || shortIdNum <= 0) return null;
  return `${COMMENT_SHORT_ID_PREFIX[type]}-${shortIdNum}`;
}

/**
 * Build a comment deep-link URL (relative, like getEntityLink): current
 * pathname (includes NEXT_BASE_PATH) + query params, e.g.
 * ?note=N-3&id=<noteCuid>&nc=<commentCuid> or
 * ?task=T-7&id=<taskCuid>&comment=<commentCuid>.
 */
export function getCommentLink(params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return `${window.location.pathname}?${qs}`;
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
 * Check if a string looks like a shortId (e.g., "T-7", "P-3", "N-12", "A-2", "R-1")
 */
export function isShortId(value: string): boolean {
  return /^[TPNAFR]-\d+$/i.test(value);
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
function legacyExecCopy(text: string): boolean {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    // Place off-screen and make it non-editable to avoid mobile keyboards.
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '0';
    textarea.style.opacity = '0';
    // Mount inside the active focus-trapped dialog when there is one. Otherwise
    // the dialog's focus trap steals focus back from the textarea before the
    // copy runs, so execCommand('copy') reports success yet copies nothing.
    const scope = document.activeElement?.closest<HTMLElement>('[role="dialog"], [role="alertdialog"]');
    (scope ?? document.body).appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const result = document.execCommand('copy');
    textarea.remove();
    return result;
  } catch {
    return false;
  }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  // Primary: async Clipboard API (secure contexts — https or localhost).
  // It is reliable inside modal dialogs, where it does not depend on DOM
  // focus/selection — unlike execCommand, which focus-trap dialogs break.
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy
    }
  }
  // Fallback: synchronous execCommand path for non-secure contexts / older browsers.
  return legacyExecCopy(text);
}
