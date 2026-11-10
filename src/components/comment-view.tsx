'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, MessageSquare, Save, Loader2, FileText } from 'lucide-react';

import { useAppStore, useIsGuest } from '@/store/app-store';
import { DocumentViewShell } from '@/components/document-view-shell';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { MarkdownToolbar } from '@/components/markdown-toolbar';
import { MentionTextarea } from '@/components/mention-autocomplete';
import { AttachmentList } from '@/components/attachment-list';
import { Button } from '@/components/ui/button';
import { useConfirmClose } from '@/hooks/use-confirm-close';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

/**
 * Full-screen large comment view (T-188). Rendered once at the app root and
 * driven by the store's `commentView` — opens above the task detail Sheet
 * (z-[70] > Sheet/Dialog z-50, below toast z-[100]). ESC / Back return to the
 * sheet behind.
 */
export function CommentView() {
  const commentView = useAppStore((s) => s.commentView);
  const closeCommentView = useAppStore((s) => s.closeCommentView);
  const comments = useAppStore((s) => s.comments);
  const tasks = useAppStore((s) => s.tasks);
  const projects = useAppStore((s) => s.projects);
  const areas = useAppStore((s) => s.areas);
  const currentUserId = useAppStore((s) => s.currentUserId);
  const updateComment = useAppStore((s) => s.updateComment);
  const isGuest = useIsGuest();

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const comment = comments.find((c) => c.id === commentView?.commentId);
  const task = comment ? tasks.find((t) => t.id === comment.taskId) : undefined;
  const project = task?.projectId ? projects.find((p) => p.id === task.projectId) : undefined;
  const area = project?.areaId ? areas.find((a) => a.id === project.areaId) : undefined;

  // Edit rights mirror the server rule (comment.service.ts): the comment
  // author or the owner of the parent task.
  const canEdit =
    !!comment && !!currentUserId &&
    (comment.ownerId === currentUserId || (!!task && task.ownerId === currentUserId));
  const readOnly = !canEdit || isGuest;

  const [mode, setMode] = useState<'preview' | 'edit'>('preview');
  const [content, setContent] = useState('');
  const [lastSavedContent, setLastSavedContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Fresh state per opened comment
  const openId = commentView?.commentId ?? null;
  useEffect(() => {
    if (!openId) return;
    const c = useAppStore.getState().comments.find((x) => x.id === openId);
    setContent(c?.content ?? '');
    setLastSavedContent(c?.content ?? '');
    setMode('preview');
  }, [openId]);

  const isDirty = content !== lastSavedContent;

  // Timestamp of the last close attempt — used by the pointer guard below to
  // also cover the short window after the overlay unmounts.
  const closedAtRef = useRef(0);

  const doClose = useCallback(() => {
    closedAtRef.current = performance.now();
    closeCommentView();
  }, [closeCommentView]);

  const { showConfirm: showDiscardConfirm, requestClose, handleConfirmDiscard, handleCancelDiscard } = useConfirmClose({
    isDirty,
    onClose: doClose,
  });
  const handleBack = requestClose;
  const showConfirmRef = useRef(showDiscardConfirm);
  showConfirmRef.current = showDiscardConfirm;

  const performSave = useCallback(async () => {
    if (!comment || readOnly || isSaving) return;
    if (!content.trim()) {
      toast.error('Comment content is required');
      return;
    }
    setIsSaving(true);
    try {
      await updateComment(comment.id, { content: content.trim() });
      setLastSavedContent(content.trim());
    } finally {
      setIsSaving(false);
    }
  }, [comment, readOnly, isSaving, content, updateComment]);

  // Portals need a real document.body — wait for the client
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // ESC + Ctrl/Cmd+S in the capture phase with stopPropagation: the Radix
  // Sheet/Dialog underneath also listens for Escape — without this both would
  // close at once (same pattern as attachment-preview-overlay).
  useEffect(() => {
    if (!openId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        void performSave();
        return;
      }
      if (e.key === 'Escape') {
        // Let the Radix discard-confirm dialog handle its own Escape
        if (showConfirmRef.current) return;
        e.stopPropagation();
        handleBack();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [openId, performSave, handleBack]);

  // Keep pointer presses away from the Radix Sheet underneath, which would
  // otherwise close on "interact outside" (its listener sits on `document`,
  // so stopping the event on `body` — earlier in the bubble path — blocks
  // the dismissal while React handlers on the root container still fire).
  // Two windows are covered:
  //  1. while the overlay is in the DOM (matched by class);
  //  2. a short grace period after close: the second click of a double-click
  //     on Back can land after the overlay unmounted — on the board behind —
  //     which Radix would treat as "click outside the sheet" and close it.
  useEffect(() => {
    const GRACE_MS = 250;
    const stopPointerDown = (e: PointerEvent) => {
      const overlay = document.querySelector('.comment-view-overlay');
      const guarded =
        (overlay && overlay.contains(e.target as Node)) ||
        performance.now() - closedAtRef.current < GRACE_MS;
      if (guarded) e.stopPropagation();
    };
    document.body.addEventListener('pointerdown', stopPointerDown);
    return () => document.body.removeEventListener('pointerdown', stopPointerDown);
  }, []);

  if (!mounted) return null;

  // No enter/exit fade on purpose: a semi-transparent overlay lets the task
  // Sheet bleed through during the animation ("flicker") — so the cover is
  // fully opaque from the first frame and unmounts instantly on close.
  return createPortal(
    <>
      {openId && comment && (
        <div className="fixed inset-0 z-[70] bg-background comment-view-overlay pointer-events-auto">
          <DocumentViewShell
            mode={mode}
            onModeChange={setMode}
            readOnly={readOnly}
            onBack={handleBack}
            headerLeft={
              <>
                {comment.owner?.name && (
                  <span className="text-xs text-muted-foreground truncate">
                    {comment.owner.name}
                  </span>
                )}
                {!readOnly && isDirty && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2.5 text-xs gap-1.5"
                    onClick={() => void performSave()}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Save className="h-3 w-3" />
                    )}
                    Save
                  </Button>
                )}
              </>
            }
            breadcrumb={
              <>
                {area && (
                  <span className="inline-flex items-center gap-1">
                    <span className="text-[10px]">{area.icon || '📁'}</span>
                    {area.name}
                  </span>
                )}
                {project && (
                  <span className="inline-flex items-center gap-1">
                    <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                    <span className="inline-flex items-center gap-1">
                      <span
                        className="h-1.5 w-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: project.color }}
                      />
                      {project.name}
                    </span>
                  </span>
                )}
                {task && (
                  <span className="inline-flex items-center gap-1">
                    <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                    <span className="font-mono">{task.shortId || `T-${task.shortIdNum}`}</span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                  <MessageSquare className="h-3 w-3" />
                  Comment
                </span>
              </>
            }
            footer={
              <div className="border-t pt-4 mt-4 px-3 pb-16 md:pb-2">
                <AttachmentList
                  entityId={comment.id}
                  entityType="comment"
                  ownerId={comment.ownerId}
                  readOnly
                />
              </div>
            }
          >
            {mode === 'edit' && !readOnly ? (
              <>
                <div className="sticky top-0 z-10 flex items-center gap-1 px-3 py-1.5 border-b shrink-0 bg-background">
                  <MarkdownToolbar
                    textareaRef={textareaRef}
                    value={content}
                    onChange={setContent}
                    entityId={comment.id}
                    entityType="comment"
                  />
                  <div className="flex-1" />
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {content.length} chars
                  </span>
                </div>
                <div className="flex-1 min-h-0">
                  <MentionTextarea
                    ref={textareaRef}
                    value={content}
                    onChange={(val) => setContent(val)}
                    placeholder="Edit comment... (Markdown supported)"
                    className="h-full w-full resize-none border-none rounded-none px-4 pt-4 pb-8 font-mono text-sm leading-relaxed focus-visible:ring-0 placeholder:text-muted-foreground/50 overflow-y-auto custom-scrollbar"
                    autoFocus
                  />
                </div>
              </>
            ) : (
              <div className="h-full overflow-y-auto custom-scrollbar">
                <div className="w-full md:w-[90%] mx-auto px-4 md:px-6 py-6">
                  {!content.trim() ? (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground/50">
                      <FileText className="h-12 w-12 mb-3 opacity-30" />
                      <p className="text-sm">This comment is empty</p>
                    </div>
                  ) : (
                    <div className="prose-container">
                      <MarkdownRenderer content={content} compact={false} />
                    </div>
                  )}
                </div>
              </div>
            )}
          </DocumentViewShell>

          <AlertDialog open={showDiscardConfirm} onOpenChange={(open) => !open && handleCancelDiscard()}>
            <AlertDialogContent className="z-[80]">
              <AlertDialogHeader>
                <AlertDialogTitle>Discard changes?</AlertDialogTitle>
                <AlertDialogDescription>
                  You have unsaved changes. Are you sure you want to close this comment? All unsaved edits will be lost.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Continue editing</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleConfirmDiscard}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Discard
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </>,
    document.body,
  );
}
