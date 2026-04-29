'use client';

import { useState } from 'react';
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
}

export function CreateNoteDialog({ open, onOpenChange }: CreateNoteDialogProps) {
  const { projects, createNote, selectNote, setCurrentView, selectedProjectId } = useAppStore();
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState<string>(selectedProjectId ?? 'none');
  const [content, setContent] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsCreating(true);
    try {
      const data: Partial<Note> = {
        title: title.trim(),
        content: content,
        projectId: projectId === 'none' ? null : projectId,
      };

      await createNote(data);

      const store = useAppStore.getState();
      const newNote = store.notes.find(
        (n) => n.title === title.trim() && n.content === content
      );

      if (newNote) {
        selectNote(newNote.id);
      }

      setTitle('');
      setProjectId(selectedProjectId ?? 'none');
      setContent('');
      onOpenChange(false);
      setCurrentView('note-editor');
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setTitle('');
      setProjectId(selectedProjectId ?? 'none');
      setContent('');
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
