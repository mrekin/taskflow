'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Send, Pencil, Trash2, Check, X, ListTodo } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MentionTextarea } from '@/components/mention-autocomplete';
import { CreateTaskDialog } from '@/components/create-task-dialog';
import { useAppStore } from '@/store/app-store';
import type { Comment } from '@/lib/types';

interface TaskCommentsProps {
  taskId: string;
}

export function TaskComments({ taskId }: TaskCommentsProps) {
  const {
    comments,
    fetchComments,
    createComment,
    updateComment,
    deleteComment,
  } = useAppStore();

  const [newContent, setNewContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');

  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [prefilledTitle, setPrefilledTitle] = useState('');
  const [prefilledDescription, setPrefilledDescription] = useState('');

  // Fetch comments on mount or when taskId changes
  useEffect(() => {
    if (taskId) {
      fetchComments(taskId);
    }
  }, [taskId, fetchComments]);

  // Filter comments for this task
  const taskComments = comments.filter((c) => c.taskId === taskId);

  // Submit new comment
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

  // Edit comment
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

  const handleDelete = async (commentId: string) => {
    await deleteComment(commentId);
  };

  const handleCreateTaskFromComment = (content: string) => {
    const lines = content.split('\n');
    const title = lines[0].trim();
    const description = lines.slice(1).join('\n').trim();
    setPrefilledTitle(title);
    setPrefilledDescription(description);
    setCreateTaskOpen(true);
  };

  // Keyboard shortcut for inline editing
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

  // Get author initial from name
  const getAuthorInitial = (comment: Comment) => {
    const name = comment.owner?.name;
    if (name) return name.charAt(0).toUpperCase();
    return 'D';
  };

  // Get author display name
  const getAuthorName = (comment: Comment) => {
    return comment.owner?.name || 'Demo User';
  };

  // Format timestamp - compact relative format
  const formatTimestamp = (dateStr: string) => {
    try {
      return formatDistanceToNow(parseISO(dateStr), { addSuffix: true });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center gap-1.5">
        <MessageSquare className="size-3.5 text-muted-foreground" />
        <span className="text-muted-foreground text-xs uppercase tracking-wider font-medium">
          Comments ({taskComments.length})
        </span>
      </div>

      {/* Comments list */}
      {taskComments.length > 0 ? (
        <div className="space-y-0.5 max-h-72 overflow-y-auto custom-scrollbar">
          <AnimatePresence initial={false}>
            {taskComments.map((comment) => (
              <motion.div
                key={comment.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="group"
              >
                <div className="flex gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors">
                  {/* Avatar - compact */}
                  <div
                    className="size-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5"
                  >
                    <span className="text-[9px] font-medium text-primary">
                      {getAuthorInitial(comment)}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Author + timestamp row - inline */}
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs font-medium leading-none">
                        {getAuthorName(comment)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatTimestamp(comment.createdAt)}
                      </span>
                    </div>

                    {/* Comment body or edit mode */}
                    {editingCommentId === comment.id ? (
                      <div className="space-y-1.5 pt-1">
                        <MentionTextarea
                          value={editingContent}
                          onChange={(val) => setEditingContent(val)}
                          onKeyDown={(e) => handleEditKeyDown(e, comment.id)}
                          className="min-h-14 text-xs py-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          autoFocus
                        />
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => handleEditSave(comment.id)}
                          >
                            <Check className="size-3 mr-0.5" />
                            Save
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={handleEditCancel}
                          >
                            <X className="size-3 mr-0.5" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-foreground/80 whitespace-pre-wrap break-words leading-relaxed">
                        {comment.content}
                      </p>
                    )}

                    {/* Action buttons - show on hover */}
                    {editingCommentId !== comment.id && (
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-5"
                          onClick={() => handleEditStart(comment)}
                          title="Edit comment"
                        >
                          <Pencil className="size-2.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-5 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(comment.id)}
                          title="Delete comment"
                        >
                          <Trash2 className="size-2.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-5"
                          onClick={() => handleCreateTaskFromComment(comment.content)}
                          title="Create task from comment"
                        >
                          <ListTodo className="size-2.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground py-2 text-center">
          No comments yet
        </p>
      )}

      {/* New comment input - compact */}
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
      {/* Create task from comment dialog */}
      <CreateTaskDialog
        open={createTaskOpen}
        onOpenChange={setCreateTaskOpen}
        defaultParentId={taskId}
        defaultTitle={prefilledTitle}
        defaultDescription={prefilledDescription}
      />
    </div>
  );
}
