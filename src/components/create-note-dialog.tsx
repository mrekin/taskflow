'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/app-store';
import type { Note } from '@/lib/types';
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CreateNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultProjectId?: string;
  defaultFolderId?: string | null;
}

export function CreateNoteDialog({ open, onOpenChange, defaultProjectId, defaultFolderId }: CreateNoteDialogProps) {
  const { projects, folders, createNote, selectNote, setCurrentView, selectedProjectId } = useAppStore();

  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState<string>('none');
  const [folderId, setFolderId] = useState<string>('none');
  const [content, setContent] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Sync state when dialog opens (component stays mounted between opens)
  useEffect(() => {
    if (open) {
      const resolvedProject = defaultProjectId ?? selectedProjectId ?? 'none';
      setProjectId(resolvedProject);
      setFolderId(defaultFolderId ?? 'none');
      setTitle('');
      setContent('');
    }
  }, [open, defaultProjectId, defaultFolderId, selectedProjectId]);

  // Hide project selector only when explicitly provided by parent
  const hideProjectSelect = !!defaultProjectId;

  const resetForm = () => {
    setTitle('');
    setProjectId(defaultProjectId ?? selectedProjectId ?? 'none');
    setFolderId(defaultFolderId ?? 'none');
    setContent('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsCreating(true);
    try {
      const data: Partial<Note> = {
        title: title.trim(),
        content: content,
        projectId: projectId === 'none' ? null : projectId,
        folderId: folderId === 'none' ? null : folderId,
      };

      await createNote(data);

      const store = useAppStore.getState();
      const newNote = store.notes.find(
        (n) => n.title === title.trim() && n.content === content
      );

      if (newNote) {
        selectNote(newNote.id);
      }

      resetForm();
      onOpenChange(false);
      setCurrentView('note-editor');
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to create note';
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Note</DialogTitle>
            <DialogDescription>
              Create a new note to capture your thoughts and ideas.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="note-title">Title *</Label>
              <Input
                id="note-title"
                placeholder="Note title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </div>

            {!hideProjectSelect && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="note-project">Project</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger id="note-project">
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No project</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {(folders.length > 0 || folderId !== 'none') && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="note-folder">Folder</Label>
                <Select value={folderId} onValueChange={setFolderId}>
                  <SelectTrigger id="note-folder">
                    <SelectValue placeholder="Select a folder" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No folder</SelectItem>
                    {folders.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="note-content">Content</Label>
              <Textarea
                id="note-content"
                placeholder="Start writing... (Markdown supported)"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={5}
                className="font-mono text-sm resize-none"
              />
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim() || isCreating}>
              {isCreating ? 'Creating...' : 'Create Note'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
