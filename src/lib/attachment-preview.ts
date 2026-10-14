import { getFileExtension } from '@/lib/attachment-utils';

// Attachment preview categories (T-155). Files are matched by extension only:
// a file with a "wrong" extension simply gets no preview, same as before.

export type AttachmentPreviewCategory = 'image' | 'pdf' | 'json' | 'yaml';

/** Extensions per preview category; anything not listed here is not previewable. */
const PREVIEW_EXTENSIONS: Record<AttachmentPreviewCategory, readonly string[]> = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'],
  pdf: ['pdf'],
  json: ['json'],
  yaml: ['yaml', 'yml'], // yaml and yml share one category (per T-155)
};

/** Resolves a file's preview category by extension, or null when there is no preview. */
export function getPreviewCategory(filename: string): AttachmentPreviewCategory | null {
  const ext = getFileExtension(filename);
  for (const category of Object.keys(PREVIEW_EXTENSIONS) as AttachmentPreviewCategory[]) {
    if (PREVIEW_EXTENSIONS[category].includes(ext)) return category;
  }
  return null;
}

export function isPreviewable(filename: string): boolean {
  return getPreviewCategory(filename) !== null;
}

/** Target of an open preview — kept in the store (top-level, rendered once by AttachmentPreviewOverlay). */
export interface AttachmentPreviewTarget {
  blobId: string;
  displayName: string;
  mimeType?: string;
  size?: number;
}
