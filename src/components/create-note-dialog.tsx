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
import { FileText } from 'lucide-react';

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

  const resetForm = () => {
    setTitle('');
    setProjectId(selectedProjectId ?? 'none');
    setContent('');
    setIsCreating(false);
  };

  const handleCreate = async () => {
    if (!title.trim()) return;

    setIsCreating(true);
    try {
      const data: Partial<Note> = {
        title: title.trim(),
        content: content,
        projectId: projectId === 'none' ? null : projectId,
      };

      await createNote(data);

      // Get the newly created note from the store (it was just added)
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
    } catch (error) {
      console.error('Failed to create note:', error);
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault();
      handleCreate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[480px]" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            New Note
          </DialogTitle>
          <DialogDescription>
            Create a new note to capture your thoughts and ideas.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="note-title">Title *</Label>
            <Input
              id="note-title"
              placeholder="Note title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="note-project">Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger id="note-project">
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No project</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: project.color }}
                      />
                      {project.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
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

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              resetForm();
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!title.trim() || isCreating}
          >
            {isCreating ? 'Creating...' : 'Create Note'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
