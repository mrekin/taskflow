'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';

import { useAppStore } from '@/store/app-store';
import type { Comment, Task } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Derives a document name from the comment content: the first three
 * whitespace-separated words, stripped of markdown symbols and truncated.
 */
function deriveDocName(content: string): string {
  const cleaned = content
    .replace(/[#>*_`~[\]()!]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'Comment';
  const words = cleaned.split(' ').slice(0, 3).join(' ');
  if (!words) return 'Comment';
  return words.length > 60 ? `${words.slice(0, 57).trimEnd()}…` : words;
}

interface CreateNoteFromCommentDialogProps {
  /** The comment to convert. `null` = dialog closed. */
  comment: Comment | null;
  /** The parent task (used for project/release/folder placement). */
  task: Task | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Create note from comment" dialog (T-188): asks for a document name,
 * places the note at Notes/{Project name}/{task shortId}/{name}, auto-bound
 * to the task's project/release, and appends a #N-x link to the comment.
 */
export function CreateNoteFromCommentDialog({ comment, task, onOpenChange }: CreateNoteFromCommentDialogProps) {
  const open = !!comment;
  const projects = useAppStore((s) => s.projects);
  const createNote = useAppStore((s) => s.createNote);
  const createFolder = useAppStore((s) => s.createFolder);
  const fetchFolders = useAppStore((s) => s.fetchFolders);
  const fetchNotes = useAppStore((s) => s.fetchNotes);
  const updateComment = useAppStore((s) => s.updateComment);
  const selectNote = useAppStore((s) => s.selectNote);
  const setCurrentView = useAppStore((s) => s.setCurrentView);

  const [name, setName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Default doc name from the comment content, reset per opened comment
  const commentId = comment?.id ?? null;
  useEffect(() => {
    if (comment) setName(deriveDocName(comment.content));
  }, [commentId]);

  const project = task?.projectId ? projects.find((p) => p.id === task.projectId) : undefined;
  const taskShortId = task ? (task.shortId || `T-${task.shortIdNum}`) : '';
  const targetPath = ['Notes', ...(project ? [project.name] : []), taskShortId, name.trim() || '…']
    .filter(Boolean)
    .join(' / ');

  const findFolder = (folders: { id: string; name: string; projectId: string | null; parentId: string | null }[], name: string, projectId: string | null, parentId: string | null) =>
    folders.find((f) => f.name === name && (f.projectId ?? null) === projectId && (f.parentId ?? null) === parentId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment || !task || !name.trim() || isCreating) return;

    setIsCreating(true);
    // Remember the notes/folders scope the app had before the scoped fetches
    // below (fetchNotes/fetchFolders overwrite the store scope), to restore
    // it afterwards so the sidebar keeps showing what the user had selected.
    const prevNotesScope = useAppStore.getState().notesScope;
    const prevFoldersScope = useAppStore.getState().foldersScope;
    try {
      // Load folders/notes scoped to the target project so we can find
      // existing folders and check for duplicate titles client-side.
      await fetchFolders(task.projectId ?? undefined);
      await fetchNotes(task.projectId ?? undefined);

      // Resolve/create the folder chain: {Project name} (root, with projectId)
      // > {task shortId} (child). Without a project: only the {task shortId}
      // folder at root level.
      let parentId: string | null = null;
      if (project) {
        let projFolder = findFolder(useAppStore.getState().folders, project.name, project.id, null);
        if (!projFolder) {
          await createFolder({ name: project.name, projectId: project.id, parentId: null });
          projFolder = findFolder(useAppStore.getState().folders, project.name, project.id, null);
        }
        if (!projFolder) throw new Error('Failed to create target folder');
        parentId = projFolder.id;
      }

      let taskFolder = findFolder(useAppStore.getState().folders, taskShortId, task.projectId ?? null, parentId);
      if (!taskFolder) {
        await createFolder({ name: taskShortId, projectId: task.projectId ?? null, parentId });
        taskFolder = findFolder(useAppStore.getState().folders, taskShortId, task.projectId ?? null, parentId);
      }
      if (!taskFolder) throw new Error('Failed to create target folder');
      const folderId = taskFolder.id;

      // Pre-check duplicate titles in the target folder (server returns 409)
      const docName = name.trim();
      const siblings = useAppStore.getState().notes.filter((n) => n.folderId === folderId);
      let title = docName;
      let seq = 2;
      while (siblings.some((s) => s.title === title)) {
        title = `${docName} (${seq})`;
        seq += 1;
      }

      const noteData = {
        title,
        content: comment.content,
        projectId: task.projectId ?? null,
        folderId,
        releaseId: task.releaseId ?? null,
      };

      try {
        await createNote(noteData);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (!msg.includes('already exists')) throw err;
        // 409 fallback: retry with a numbered suffix
        const retryTitle = `${docName} (${siblings.length + 1})`;
        await createNote({ ...noteData, title: retryTitle });
        title = retryTitle;
      }

      const newNote = useAppStore.getState().notes.find(
        (n) => n.folderId === folderId && n.title === title && n.content === comment.content
      );
      if (!newNote) throw new Error('Failed to create note');

      // Move semantics: the comment text becomes the note content, the
      // comment itself keeps only a smart-link to the created note
      // (#N-x renders as a clickable badge)
      await updateComment(comment.id, { content: `#N-${newNote.shortIdNum}` });

      selectNote(newNote.id);
      setCurrentView('note-editor');
      toast.success(`Note "${title}" created`);
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create note';
      toast.error(message);
    } finally {
      // Restore the previous notes/folders scope (also refetches, so the
      // newly created note lands in the store with the right scope applied)
      await fetchFolders(prevFoldersScope?.projectId);
      await fetchNotes(prevNotesScope?.projectId);
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create note from comment</DialogTitle>
            <DialogDescription>
              The comment text will be moved into the note, and the comment will keep only a link to the created note.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="comment-note-name">Document name *</Label>
              <Input
                id="comment-note-name"
                placeholder="Document name..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Target path</Label>
              <p className="text-xs text-muted-foreground font-mono break-all rounded-md border bg-muted/30 px-2 py-1.5">
                {targetPath}
              </p>
            </div>
          </div>

          <DialogFooter className="mt-4 pt-3 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || isCreating}>
              {isCreating ? 'Creating...' : 'Create Note'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
