'use client';

import { api } from '@/lib/api-utils';

interface PdfViewerProps {
  blobId: string;
}

/**
 * PDF preview via the browser's native viewer (decision on T-155: no pdfjs —
 * zoom/scroll/print come from the browser; no custom rotate/zoom controls).
 */
export function PdfViewer({ blobId }: PdfViewerProps) {
  return (
    <iframe
      src={api(`/api/attachments/file/${blobId}?disposition=inline`)}
      title="PDF preview"
      className="h-full w-full border-0"
    />
  );
}
