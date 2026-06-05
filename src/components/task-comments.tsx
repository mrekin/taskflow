'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Send, Pencil, Trash2, Check, X, ListTodo, Reply, ChevronDown, ChevronUp, Paperclip, Loader2, AlertCircle } from 'lucide-react';

import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MentionTextarea } from '@/components/mention-autocomplete';
import { CreateTaskDialog } from '@/components/create-task-dialog';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAppStore } from '@/store/app-store';
import { AttachmentList } from '@/components/attachment-list';
import { computeFileHash, formatFileSize, validateAttachmentFiles, uploadFilesConcurrently } from '@/lib/attachment-utils';
import type { Comment, PendingAttachment, TaskPrice } from '@/lib/types';
import { CommentAttachmentsContext, useCommentAttachments } from '@/components/comment-attachments-context';

const MAX_VISIBLE_LINES = 4;
const MAX_DEPTH = 5;
const INDENT_PX = 24;

interface TaskCommentsProps {
  taskId: string;
  prices?: TaskPrice[];
  currency?: string;
}

function buildTree(flat: Comment[]): Comment[] {
  const map = new Map<string, Comment & { replies: Comment[] }>();
  for (const c of flat) {
    if (!map.has(c.id)) {
      map.set(c.id, { ...c, replies: [] });
    } else {
      map.get(c.id)!.replies = [];
    }
  }
  const roots: Comment[] = [];
  for (const c of flat) {
    const node = map.get(c.id)!;
    if (c.parentId && map.has(c.parentId)) {
      map.get(c.parentId)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function CommentItem({
  comment,
  allComments,
  onEdit,
  onDelete,
  onReply,
  editingCommentId,
  editingContent,
  onEditContentChange,
  onEditSave,
  onEditCancel,
  onEditKeyDown,
  replyingToId,
  replyContent,
  onReplyContentChange,
  onReplySubmit,
  onReplyCancel,
  onReplyKeyDown,
  onCreateTaskFromComment,
  depth,
  currentUserId,
  prices,
  currency,
}: {
  comment: Comment;
  allComments: Comment[];
  onEdit: (comment: Comment) => void;
  onDelete: (id: string) => void;
  onReply: (id: string) => void;
  editingCommentId: string | null;
  editingContent: string;
  onEditContentChange: (val: string) => void;
  onEditSave: (id: string) => void;
  onEditCancel: () => void;
  onEditKeyDown: (e: React.KeyboardEvent, id: string) => void;
  replyingToId: string | null;
  replyContent: string;
  onReplyContentChange: (val: string) => void;
  onReplySubmit: () => void;
  onReplyCancel: () => void;
  onReplyKeyDown: (e: React.KeyboardEvent) => void;
  onCreateTaskFromComment: (content: string) => void;
  depth: number;
  currentUserId: string;
  prices?: TaskPrice[];
  currency?: string;
}) {
  const {
    replyPendingFiles,
    onReplyAddFiles,
    onRemoveReplyPendingFile,
    replyFileInputRef,
    onCommentAttach,
    attachmentRefresh,
  } = useCommentAttachments();

  const [expanded, setExpanded] = useState(true);
  const [longExpanded, setLongExpanded] = useState(false);

  const isDeleted = comment.deleted;

  const lines = comment.content.split('\n');
  const isLong = !isDeleted && lines.length > MAX_VISIBLE_LINES;
  const visibleContent = isLong && !longExpanded
    ? lines.slice(0, MAX_VISIBLE_LINES).join('\n')
    : comment.content;

  const indent = Math.min(depth, MAX_DEPTH) * INDENT_PX;
  const isEditing = editingCommentId === comment.id;
  const isReplying = replyingToId === comment.id;

  const authorInitial = comment.owner?.name?.charAt(0).toUpperCase() || 'D';
  const authorName = comment.owner?.name || 'Demo User';

  const formatTimestamp = (dateStr: string) => {
    try {
      return formatDistanceToNow(parseISO(dateStr), { addSuffix: true });
    } catch {
      return dateStr;
    }
  };

  const hasReplies = comment.replies && comment.replies.length > 0;

  // Attachment list is shown below comment body for non-deleted comments
  const showAttachments = !isDeleted && !isEditing;

  return (
    <>
      <div style={{ paddingLeft: indent }}>
        <div className="group">
          <div className="flex gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors">
            {/* Avatar */}
            <div className={cn(
              "size-5 rounded-full flex items-center justify-center shrink-0 mt-0.5",
              isDeleted ? "bg-muted" : "bg-primary/10"
            )}>
              <span className={cn("text-[9px] font-medium", isDeleted ? "text-muted-foreground" : "text-primary")}>
                {isDeleted ? '?' : authorInitial}
              </span>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {/* Author + timestamp */}
              <div className="flex items-baseline gap-1.5">
                <span className={cn("text-xs font-medium leading-none", isDeleted && "text-muted-foreground")}>
                  {isDeleted ? '[deleted]' : authorName}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {formatTimestamp(comment.createdAt)}
                </span>
              </div>

              {/* Body or edit */}
              {isEditing ? (
                <div className="space-y-1.5 pt-1">
                  <MentionTextarea
                    value={editingContent}
                    onChange={onEditContentChange}
                    onKeyDown={(e) => onEditKeyDown(e, comment.id)}
                    prices={prices}
                    className="min-h-14 text-xs py-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    autoFocus
                  />
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => onEditSave(comment.id)}>
                      <Check className="size-3 mr-0.5" /> Save
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onEditCancel}>
                      <X className="size-3 mr-0.5" /> Cancel
                    </Button>
                  </div>
                </div>
              ) : isDeleted ? (
                <p className="text-xs text-muted-foreground italic">
                  Комментарий удалён
                </p>
              ) : (
                <>
                  <div className="text-xs text-foreground/80 break-words leading-relaxed">
                    <MarkdownRenderer content={visibleContent} compact prices={prices} currency={currency} />
                  </div>
                  {isLong && (
                    <button
                      type="button"
                      onClick={() => setLongExpanded(!longExpanded)}
                      className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors mt-0.5"
                    >
                      {longExpanded ? (
                        <> <ChevronUp className="size-3" /> Collapse </>
                      ) : (
                        <> <ChevronDown className="size-3" /> Show all ({lines.length} lines) </>
                      )}
                    </button>
                  )}
                  {showAttachments && (
                    <div className="mt-1">
                      <AttachmentList entityId={comment.id} entityType="comment" ownerId={comment.ownerId} compact refreshTrigger={attachmentRefresh} />
                    </div>
                  )}
                </>
              )}

              {/* Actions — only for non-deleted comments */}
              {!isEditing && !isDeleted && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="size-5" onClick={() => onReply(comment.id)} title="Reply">
                    <Reply className="size-2.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-5" onClick={() => onEdit(comment)} title="Edit comment">
                    <Pencil className="size-2.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    className="size-5 text-muted-foreground hover:text-destructive"
                    onClick={() => onDelete(comment.id)} title="Delete comment"
                  >
                    <Trash2 className="size-2.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-5" onClick={() => onCreateTaskFromComment(comment.content)} title="Create task from comment">
                    <ListTodo className="size-2.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-5" onClick={() => onCommentAttach(comment.id)} title="Attach file" style={{ display: currentUserId === comment.ownerId ? undefined : 'none' }}>
                    <Paperclip className="size-2.5" />
                  </Button>
                </div>
              )}

              {/* Reply — available even on deleted comments */}
              {!isEditing && isDeleted && hasReplies && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="size-5" onClick={() => onReply(comment.id)} title="Reply">
                    <Reply className="size-2.5" />
                  </Button>
                </div>
              )}

              {/* Reply input inline */}
              {isReplying && (
                <div className="space-y-1 mt-1.5">
                  <div className="flex gap-2 items-end">
                    <MentionTextarea
                      value={replyContent}
                      onChange={onReplyContentChange}
                      onKeyDown={onReplyKeyDown}
                      prices={prices}
                      placeholder="Reply..."
                      className="min-h-8 text-xs resize-none flex-1 py-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      rows={1}
                      autoFocus
                    />
                    <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={() => replyFileInputRef.current?.click()} title="Attach files">
                      <Paperclip className="size-3" />
                    </Button>
                    <Button size="icon" className="size-6 shrink-0" onClick={onReplySubmit} disabled={!replyContent.trim()} title="Send reply">
                      <Send className="size-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={onReplyCancel} title="Cancel">
                      <X className="size-3" />
                    </Button>
                  </div>
                  {replyPendingFiles.length > 0 && (
                    <div className="space-y-1">
                      {replyPendingFiles.map((entry, idx) => (
                        <div key={`${entry.file.name}-${idx}`} className={cn(
                          "flex items-center gap-2 rounded-md border px-2 py-1 text-xs",
                          entry.status === 'error' && "border-destructive/50 bg-destructive/5",
                        )}>
                          {entry.status === 'pending' && <span className="size-3 shrink-0 rounded-full border-2 border-muted-foreground/30" />}
                          <span className="flex-1 truncate min-w-0">{entry.file.name}</span>
                          <span className="text-muted-foreground">{formatFileSize(entry.file.size)}</span>
                          <Button variant="ghost" size="icon" className="size-4 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => onRemoveReplyPendingFile(idx)}>
                            <X className="size-2.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Replies */}
      {hasReplies && (
        <div>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors py-0.5 px-2"
            style={{ paddingLeft: indent + 28 }}
          >
            {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            {comment.replies!.length} {comment.replies!.length === 1 ? 'reply' : 'replies'}
          </button>
          <AnimatePresence initial={false}>
            {expanded && comment.replies!.map((reply) => (
              <motion.div
                key={reply.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
              >
                <CommentItem
                  comment={reply}
                  allComments={allComments}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onReply={onReply}
                  editingCommentId={editingCommentId}
                  editingContent={editingContent}
                  onEditContentChange={onEditContentChange}
                  onEditSave={onEditSave}
                  onEditCancel={onEditCancel}
                  onEditKeyDown={onEditKeyDown}
                  replyingToId={replyingToId}
                  replyContent={replyContent}
                  onReplyContentChange={onReplyContentChange}
                  onReplySubmit={onReplySubmit}
                  onReplyCancel={onReplyCancel}
                  onReplyKeyDown={onReplyKeyDown}
                  onCreateTaskFromComment={onCreateTaskFromComment}
                  depth={depth + 1}
                  currentUserId={currentUserId}
                  prices={prices}
                  currency={currency}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </>
  );
}

export function TaskComments({ taskId, prices, currency }: TaskCommentsProps) {
  const {
    comments,
    tasks,
    fetchComments,
    createComment,
    updateComment,
    deleteComment,
    currentUserId,
    uploadAttachment,
    attachmentConfig,
    fetchAttachmentConfig,
  } = useAppStore();

  const [newContent, setNewContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [replyPendingFiles, setReplyPendingFiles] = useState<PendingAttachment[]>([]);
  const replyFileInputRef = useRef<HTMLInputElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [attachmentRefresh, setAttachmentRefresh] = useState(0);
  const commentAttachInputRef = useRef<HTMLInputElement>(null);
  const [attachTargetId, setAttachTargetId] = useState<string | null>(null);

  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [prefilledTitle, setPrefilledTitle] = useState('');
  const [prefilledDescription, setPrefilledDescription] = useState('');
  const [prefilledParentId, setPrefilledParentId] = useState('');

  useEffect(() => {
    if (taskId) {
      fetchComments(taskId);
    }
  }, [taskId, fetchComments]);

  useEffect(() => {
    if (!attachmentConfig) fetchAttachmentConfig();
  }, [attachmentConfig, fetchAttachmentConfig]);

  const taskComments = comments.filter((c) => c.taskId === taskId);
  const tree = buildTree(taskComments);

  const pendingFilesRef = useRef(pendingFiles);
  pendingFilesRef.current = pendingFiles;

  const handleAddFiles = useCallback(async (files: FileList | File[]) => {
    if (!attachmentConfig) return;
    const fileArray = Array.from(files);
    const { validFiles, errors } = validateAttachmentFiles(
      fileArray,
      attachmentConfig,
      pendingFilesRef.current.length,
      attachmentConfig.maxPerComment,
    );
    for (const err of errors) {
      toast.error(err);
    }
    if (validFiles.length > 0) {
      const entries = await Promise.all(
        validFiles.map(async (file) => ({ file, hash: await computeFileHash(file), status: 'pending' as const }))
      );
      setPendingFiles(prev => [...prev, ...entries]);
    }
  }, [attachmentConfig]);

  const removePendingFile = useCallback((idx: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const handleSubmit = async () => {
    if (!newContent.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const comment = await createComment({ content: newContent.trim(), taskId });
      setNewContent('');

      if (comment && pendingFiles.length > 0) {
        await uploadFilesConcurrently(pendingFiles, async ({ file, hash }, i) => {
          setPendingFiles(prev => prev.map((f, j) => j === i ? { ...f, status: 'uploading' } : f));
          try {
            await uploadAttachment(file, comment.id, 'comment', hash);
            setPendingFiles(prev => prev.filter((_, j) => j !== i));
          } catch (e: any) {
            setPendingFiles(prev => prev.map((f, j) => j === i ? { ...f, status: 'error', error: e.message || 'Upload failed' } : f));
          }
        });
        setAttachmentRefresh(prev => prev + 1);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCommentAttach = useCallback((commentId: string) => {
    setAttachTargetId(commentId);
    commentAttachInputRef.current?.click();
  }, []);

  const handleCommentAttachFiles = useCallback(async (files: FileList) => {
    if (!attachmentConfig || !attachTargetId) return;
    const fileArray = Array.from(files);
    const { validFiles, errors } = validateAttachmentFiles(
      fileArray,
      attachmentConfig,
      0,
      attachmentConfig.maxPerComment,
    );
    for (const err of errors) {
      toast.error(err);
    }
    for (const file of validFiles) {
      try {
        const hash = await computeFileHash(file);
        await uploadAttachment(file, attachTargetId, 'comment', hash);
      } catch (e: any) {
        toast.error(e.message || 'Upload failed');
      }
    }
    if (validFiles.length > 0) setAttachmentRefresh(prev => prev + 1);
  }, [attachmentConfig, attachTargetId, uploadAttachment]);

  const handleEditStart = (comment: Comment) => {
    setEditingCommentId(comment.id);
    setEditingContent(comment.content);
  };

  const handleEditSave = async (commentId: string) => {
    if (!editingContent.trim()) {
      setEditingCommentId(null);
      return;
    }
    await updateComment(commentId, { content: editingContent.trim() });
    setEditingCommentId(null);
    setEditingContent('');
  };

  const handleEditCancel = () => {
    setEditingCommentId(null);
    setEditingContent('');
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    await deleteComment(deleteTarget);
    setDeleteTarget(null);
  };

  const handleReplyStart = (commentId: string) => {
    setReplyingToId(commentId);
    setReplyContent('');
    setReplyPendingFiles([]);
    setEditingCommentId(null);
  };

  const replyPendingFilesRef = useRef(replyPendingFiles);
  replyPendingFilesRef.current = replyPendingFiles;

  const handleReplyAddFiles = useCallback(async (files: FileList | File[]) => {
    if (!attachmentConfig) return;
    const fileArray = Array.from(files);
    const { validFiles, errors } = validateAttachmentFiles(
      fileArray,
      attachmentConfig,
      replyPendingFilesRef.current.length,
      attachmentConfig.maxPerComment,
    );
    for (const err of errors) {
      toast.error(err);
    }
    if (validFiles.length > 0) {
      const entries = await Promise.all(
        validFiles.map(async (file) => ({ file, hash: await computeFileHash(file), status: 'pending' as const }))
      );
      setReplyPendingFiles(prev => [...prev, ...entries]);
    }
  }, [attachmentConfig]);

  const removeReplyPendingFile = useCallback((idx: number) => {
    setReplyPendingFiles(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const handleReplySubmit = async () => {
    if (!replyContent.trim() || !replyingToId) return;
    const comment = await createComment({ content: replyContent.trim(), taskId, parentId: replyingToId });
    setReplyingToId(null);
    setReplyContent('');

    if (comment && replyPendingFiles.length > 0) {
      const files = replyPendingFiles;
      setReplyPendingFiles([]);
      await uploadFilesConcurrently(files, async ({ file, hash }) => {
        try {
          await uploadAttachment(file, comment.id, 'comment', hash);
        } catch (e: any) {
          toast.error(e.message || 'Upload failed');
        }
      });
      setAttachmentRefresh(prev => prev + 1);
    }
  };

  const handleReplyCancel = () => {
    setReplyingToId(null);
    setReplyContent('');
    setReplyPendingFiles([]);
  };

  const handleCreateTaskFromComment = (content: string) => {
    const lines = content.split('\n');
    const title = lines[0].trim();
    const description = lines.slice(1).join('\n').trim();
    const currentTask = tasks.find((t) => t.id === taskId);
    const parentForNewTask = currentTask?.parentId || taskId;
    setPrefilledTitle(title);
    setPrefilledDescription(description);
    setPrefilledParentId(parentForNewTask);
    setCreateTaskOpen(true);
  };

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent, commentId: string) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleEditSave(commentId);
      } else if (e.key === 'Escape') {
        handleEditCancel();
      }
    },
    [editingContent]
  );

  const handleReplyKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleReplySubmit();
      } else if (e.key === 'Escape') {
        handleReplyCancel();
      }
    },
    [replyContent, replyingToId]
  );

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center gap-1.5">
        <MessageSquare className="size-3.5 text-muted-foreground" />
        <span className="text-muted-foreground text-xs uppercase tracking-wider font-medium">
          Comments ({taskComments.length})
        </span>
      </div>

      {/* Comments tree */}
      {taskComments.length > 0 ? (
        <CommentAttachmentsContext.Provider value={{
          replyPendingFiles,
          onReplyAddFiles: handleReplyAddFiles,
          onRemoveReplyPendingFile: removeReplyPendingFile,
          replyFileInputRef,
          onCommentAttach: handleCommentAttach,
          attachmentRefresh,
        }}>
          <div className="space-y-0.5 max-h-72 overflow-y-auto custom-scrollbar">
            <AnimatePresence initial={false}>
              {tree.map((comment) => (
                <motion.div
                  key={comment.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                >
                  <CommentItem
                    comment={comment}
                    allComments={taskComments}
                    onEdit={handleEditStart}
                    onDelete={setDeleteTarget}
                    onReply={handleReplyStart}
                    editingCommentId={editingCommentId}
                    editingContent={editingContent}
                    onEditContentChange={setEditingContent}
                    onEditSave={handleEditSave}
                    onEditCancel={handleEditCancel}
                    onEditKeyDown={handleEditKeyDown}
                    replyingToId={replyingToId}
                    replyContent={replyContent}
                    onReplyContentChange={setReplyContent}
                    onReplySubmit={handleReplySubmit}
                    onReplyCancel={handleReplyCancel}
                    onReplyKeyDown={handleReplyKeyDown}
                    onCreateTaskFromComment={handleCreateTaskFromComment}
                    depth={0}
                    currentUserId={currentUserId || ''}
                    prices={prices}
                    currency={currency}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </CommentAttachmentsContext.Provider>
      ) : (
        <p className="text-xs text-muted-foreground py-2 text-center">
          No comments yet
        </p>
      )}

      {/* New comment input */}
      <div className="space-y-1.5">
        <div className="flex gap-2 items-end">
          <MentionTextarea
            value={newContent}
            onChange={(val) => setNewContent(val)}
            prices={prices}
            placeholder="Add a comment..."
            className="min-h-8 text-xs resize-none flex-1 py-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSubmitting}
            title="Attach files"
          >
            <Paperclip className="size-3" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleAddFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <input
            ref={replyFileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleReplyAddFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <input
            ref={commentAttachInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleCommentAttachFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <Button
            size="icon"
            className="size-7 shrink-0"
            onClick={handleSubmit}
            disabled={!newContent.trim() || isSubmitting}
            title="Send comment"
          >
            {isSubmitting ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
          </Button>
        </div>
        {pendingFiles.length > 0 && (
          <div className="space-y-1">
            {pendingFiles.map((entry, idx) => (
              <div
                key={`${entry.file.name}-${idx}`}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2 py-1 text-xs",
                  entry.status === 'error' && "border-destructive/50 bg-destructive/5",
                  entry.status === 'success' && "border-green-500/30 bg-green-500/5",
                )}
              >
                {entry.status === 'uploading' && <Loader2 className="size-3 animate-spin text-primary shrink-0" />}
                {entry.status === 'success' && <Check className="size-3 text-green-500 shrink-0" />}
                {entry.status === 'error' && <AlertCircle className="size-3 text-destructive shrink-0" />}
                {entry.status === 'pending' && <span className="size-3 shrink-0 rounded-full border-2 border-muted-foreground/30" />}
                <span className="flex-1 truncate min-w-0">{entry.file.name}</span>
                <span className="text-muted-foreground">{formatFileSize(entry.file.size)}</span>
                {entry.status === 'error' && entry.error && (
                  <span className="text-destructive truncate max-w-[100px]" title={entry.error}>{entry.error}</span>
                )}
                {(entry.status === 'pending' || entry.status === 'error') && (
                  <Button variant="ghost" size="icon" className="size-5 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removePendingFile(idx)}>
                    <X className="size-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete comment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this comment? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CreateTaskDialog
        open={createTaskOpen}
        onOpenChange={setCreateTaskOpen}
        defaultParentId={prefilledParentId}
        defaultTitle={prefilledTitle}
        defaultDescription={prefilledDescription}
      />
    </div>
  );
}
