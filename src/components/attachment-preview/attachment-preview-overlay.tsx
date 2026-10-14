'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, X } from 'lucide-react';

import { api } from '@/lib/api-utils';
import { getPreviewCategory } from '@/lib/attachment-preview';
import { formatFileSize } from '@/lib/attachment-utils';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/app-store';
import { ImageViewer } from './image-viewer';
import { PdfViewer } from './pdf-viewer';
import { TextViewer } from './text-viewer';

/**
 * Global attachment preview overlay (T-155). Rendered once at the app root and
 * driven by the store's `attachmentPreview` — opens above any open dialog
 * (z-[70] > Sheet/Dialog z-50, below toast z-[100] / mention autocomplete z-[9999]).
 */
export function AttachmentPreviewOverlay() {
  const attachmentPreview = useAppStore((s) => s.attachmentPreview);
  const closeAttachmentPreview = useAppStore((s) => s.closeAttachmentPreview);
  const rootRef = useRef<HTMLDivElement>(null);

  // Portals need a real document.body — wait for the client
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // ESC in the capture phase with stopPropagation: Radix dialogs (the Sheet/Dialog
  // underneath) also listen for Escape — without this both would close at once.
  // The listener sits on `window`, not `document`: Radix's useEscapeKeydown also
  // uses a capture-phase document listener registered earlier (its dialog opened
  // first), and same-node listeners run in registration order — only a window
  // capture handler + stopPropagation can reliably preempt it.
  useEffect(() => {
    if (!attachmentPreview) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      closeAttachmentPreview();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [attachmentPreview, closeAttachmentPreview]);

  // Keep pointer presses inside the preview away from document-level listeners:
  // Radix DismissableLayer (the Sheet/Dialog underneath) treats any pointerdown
  // outside its own tree as "interact outside" and would close the dialog behind
  // the open preview. Stopping propagation at the overlay root (bubble phase,
  // after children handled it) hides the press from Radix while leaving `click`
  // events intact for the buttons.
  useEffect(() => {
    const el = rootRef.current;
    if (!attachmentPreview || !el) return;
    const stopPointerDown = (e: PointerEvent) => e.stopPropagation();
    el.addEventListener('pointerdown', stopPointerDown);
    return () => el.removeEventListener('pointerdown', stopPointerDown);
  }, [attachmentPreview]);

  if (!mounted) return null;

  const category = attachmentPreview
    ? getPreviewCategory(attachmentPreview.displayName || attachmentPreview.mimeType || '')
    : null;

  const handleDownload = () => {
    if (!attachmentPreview) return;
    const url = api(`/api/attachments/file/${attachmentPreview.blobId}?disposition=attachment`);
    const a = document.createElement('a');
    a.href = url;
    a.download = attachmentPreview.displayName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return createPortal(
    <AnimatePresence>
      {attachmentPreview && category && (
        <div ref={rootRef} className="fixed inset-0 z-[70] flex items-center justify-center">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={closeAttachmentPreview}
          />

          {/* Panel */}
          <motion.div
            className="relative flex h-[90vh] w-[90vw] flex-col overflow-hidden rounded-lg border bg-background shadow-2xl"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.15 }}
          >
            <div className="flex items-center gap-2 border-b px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={attachmentPreview.displayName}>
                  {attachmentPreview.displayName}
                </p>
                {attachmentPreview.size !== undefined && (
                  <p className="text-xs text-muted-foreground">{formatFileSize(attachmentPreview.size)}</p>
                )}
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleDownload} title="Download">
                <Download className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeAttachmentPreview} title="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="min-h-0 flex-1">
              {category === 'image' && (
                <ImageViewer blobId={attachmentPreview.blobId} alt={attachmentPreview.displayName} />
              )}
              {category === 'pdf' && <PdfViewer blobId={attachmentPreview.blobId} />}
              {(category === 'json' || category === 'yaml') && (
                <TextViewer blobId={attachmentPreview.blobId} category={category} />
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
