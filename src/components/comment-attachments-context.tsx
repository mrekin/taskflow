'use client';

import { createContext, useContext } from 'react';
import type { PendingAttachment } from '@/lib/types';

export interface CommentAttachmentsContextValue {
  replyPendingFiles: PendingAttachment[];
  onReplyAddFiles: (files: FileList | File[]) => void;
  onRemoveReplyPendingFile: (idx: number) => void;
  replyFileInputRef: React.RefObject<HTMLInputElement | null>;
  onCommentAttach: (commentId: string) => void;
  attachmentRefresh: number;
}

export const CommentAttachmentsContext = createContext<CommentAttachmentsContextValue | null>(null);

export function useCommentAttachments() {
  const ctx = useContext(CommentAttachmentsContext);
  if (!ctx) throw new Error('useCommentAttachments must be used within CommentAttachmentsContext');
  return ctx;
}
