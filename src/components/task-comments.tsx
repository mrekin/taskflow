'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Send, Pencil, Trash2, Check, X, ListTodo, Reply, ChevronDown, ChevronUp } from 'lucide-react';

import { cn } from '@/lib/utils';
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
import type { Comment } from '@/lib/types';

const MAX_VISIBLE_LINES = 4;
const MAX_DEPTH = 5;
const INDENT_PX = 24;

interface TaskCommentsProps {
  taskId: string;
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
}) {
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
                    <MarkdownRenderer content={visibleContent} compact />
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
                <div className="flex gap-2 items-end mt-1.5">
                  <MentionTextarea
                    value={replyContent}
                    onChange={onReplyContentChange}
                    onKeyDown={onReplyKeyDown}
                    placeholder="Reply..."
                    className="min-h-8 text-xs resize-none flex-1 py-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    rows={1}
                    autoFocus
                  />
                  <Button size="icon" className="size-6 shrink-0" onClick={onReplySubmit} disabled={!replyContent.trim()} title="Send reply">
                    <Send className="size-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={onReplyCancel} title="Cancel">
                    <X className="size-3" />
                  </Button>
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
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </>
  );
}

export function TaskComments({ taskId }: TaskCommentsProps) {
  const {
    comments,
    tasks,
    fetchComments,
    createComment,
    updateComment,
    deleteComment,
  } = useAppStore();

  const [newContent, setNewContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [prefilledTitle, setPrefilledTitle] = useState('');
  const [prefilledDescription, setPrefilledDescription] = useState('');
  const [prefilledParentId, setPrefilledParentId] = useState('');

  useEffect(() => {
    if (taskId) {
      fetchComments(taskId);
    }
  }, [taskId, fetchComments]);

  const taskComments = comments.filter((c) => c.taskId === taskId);
  const tree = buildTree(taskComments);

  const handleSubmit = async () => {
    if (!newContent.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await createComment({ content: newContent.trim(), taskId });
      setNewContent('');
    } finally {
      setIsSubmitting(false);
    }
  };

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
    setEditingCommentId(null);
  };

  const handleReplySubmit = async () => {
    if (!replyContent.trim() || !replyingToId) return;
    await createComment({ content: replyContent.trim(), taskId, parentId: replyingToId });
    setReplyingToId(null);
    setReplyContent('');
  };

  const handleReplyCancel = () => {
    setReplyingToId(null);
    setReplyContent('');
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
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground py-2 text-center">
          No comments yet
        </p>
      )}

      {/* New comment input */}
      <div className="flex gap-2 items-end">
        <MentionTextarea
          value={newContent}
          onChange={(val) => setNewContent(val)}
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
          size="icon"
          className="size-7 shrink-0"
          onClick={handleSubmit}
          disabled={!newContent.trim() || isSubmitting}
          title="Send comment"
        >
          <Send className="size-3" />
        </Button>
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
