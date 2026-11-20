'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/app-store';
import type { Note, PendingAttachment } from '@/lib/types';
import {
  AlertCircle,
  Check,
  Loader2,
  Paperclip,
  Upload,
  X,
} from 'lucide-react';
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
import { VisibilityLock } from '@/components/visibility-lock';
import { ReleasePicker } from '@/components/release-picker';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useConfirmClose } from '@/hooks/use-confirm-close';
import { cn } from '@/lib/utils';
import { computeFileHash, formatFileSize, isFilenameAllowed, uploadFilesConcurrently } from '@/lib/attachment-utils';

interface CreateNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultProjectId?: string;
  defaultFolderId?: string | null;
}

export function CreateNoteDialog({ open, onOpenChange, defaultProjectId, defaultFolderId }: CreateNoteDialogProps) {
  const { projects, folders, createNote, selectNote, setCurrentView, selectedProjectId, users, currentUserId, uploadAttachment, attachmentConfig, fetchAttachmentConfig } = useAppStore();

  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState<string>('none');
  const [releaseId, setReleaseId] = useState<string | null>(null);
  const [folderId, setFolderId] = useState<string>('none');
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<string | null>(null);
  const [visibleUserIds, setVisibleUserIds] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDirty = !!(title.trim() || content.trim() || pendingFiles.length > 0);

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const { handleOpenChange: confirmOpenChange, showConfirm, handleConfirmDiscard, handleCancelDiscard } = useConfirmClose({
    isDirty,
    onClose: handleClose,
  });

  // Sync state when dialog opens (component stays mounted between opens)
  useEffect(() => {
    if (open) {
      const resolvedProject = defaultProjectId ?? selectedProjectId ?? 'none';
      setProjectId(resolvedProject);
      setReleaseId(null);
      setFolderId(defaultFolderId ?? 'none');
      setTitle('');
      setContent('');
      setVisibility(null);
      setVisibleUserIds([]);
      setPendingFiles([]);
      setAttachmentError(null);
    }
  }, [open, defaultProjectId, defaultFolderId, selectedProjectId]);

  // Hide project selector only when explicitly provided by parent
  const hideProjectSelect = !!defaultProjectId;

  const resetForm = () => {
    setTitle('');
    setProjectId(defaultProjectId ?? selectedProjectId ?? 'none');
    setReleaseId(null);
    setFolderId(defaultFolderId ?? 'none');
    setContent('');
    setVisibility(null);
    setVisibleUserIds([]);
    setPendingFiles([]);
    setAttachmentError(null);
  };

  useEffect(() => {
    if (open && !attachmentConfig) fetchAttachmentConfig();
  }, [open, attachmentConfig, fetchAttachmentConfig]);

  const handleAddFiles = useCallback(async (files: FileList | File[]) => {
    if (!attachmentConfig) return;
    const fileArray = Array.from(files);
    setAttachmentError(null);

    const pendingSize = pendingFiles.reduce((sum, f) => sum + f.file.size, 0);
    const usedTotal = attachmentConfig.userStorageUsed + pendingSize;

    const valid: File[] = [];
    for (const file of fileArray) {
      if (file.size > attachmentConfig.maxSize) {
        setAttachmentError(`${file.name}: size exceeds ${formatFileSize(attachmentConfig.maxSize)}`);
        continue;
      }
      if (!isFilenameAllowed(file.name, attachmentConfig.allowedPatterns)) {
        setAttachmentError(`${file.name}: file type not allowed`);
        continue;
      }
      if (attachmentConfig.userMaxSize > 0 && usedTotal + file.size > attachmentConfig.userMaxSize) {
        setAttachmentError(`Storage limit exceeded (${formatFileSize(attachmentConfig.userMaxSize)})`);
        continue;
      }
      valid.push(file);
    }

    if (valid.length > 0) {
      const entries = await Promise.all(
        valid.map(async (file) => ({ file, hash: await computeFileHash(file), status: 'pending' as const }))
      );
      setPendingFiles(prev => [...prev, ...entries]);
    }
  }, [attachmentConfig, pendingFiles]);

  const removePendingFile = useCallback((index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const onFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleAddFiles(e.dataTransfer.files);
  }, [handleAddFiles]);

  const onFileDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onFileDragLeave = useCallback(() => setIsDragging(false), []);

  // Paste from clipboard: only intercept when the clipboard actually holds
  // files (screenshot, copied file); regular text paste is left untouched.
  const onDialogPaste = useCallback((e: React.ClipboardEvent) => {
    const files = e.clipboardData?.files;
    if (!files || files.length === 0) return;
    e.preventDefault();
    handleAddFiles(files);
  }, [handleAddFiles]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsCreating(true);
    try {
      const data: Partial<Note> = {
        title: title.trim(),
        content: content,
        projectId: projectId === 'none' ? null : projectId,
        releaseId,
        folderId: folderId === 'none' ? null : folderId,
        visibility,
        visibleUserIds,
      };

      await createNote(data);

      const store = useAppStore.getState();
      const newNote = store.notes.find(
        (n) => n.title === title.trim() && n.content === content
      );

      if (newNote) {
        selectNote(newNote.id);
      }

      if (newNote && pendingFiles.length > 0) {
        await uploadFilesConcurrently(pendingFiles, async ({ file, hash }, i) => {
          setPendingFiles(prev => prev.map((f, j) => j === i ? { ...f, status: 'uploading' } : f));
          try {
            await uploadAttachment(file, newNote.id, 'note', hash);
            setPendingFiles(prev => prev.map((f, j) => j === i ? { ...f, status: 'success' } : f));
          } catch (e: any) {
            setPendingFiles(prev => prev.map((f, j) => j === i ? { ...f, status: 'error', error: e.message || 'Upload failed' } : f));
          }
        });
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

  return (
    <>
    <Dialog open={open} onOpenChange={confirmOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col" onPaste={onDialogPaste}>
        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          <DialogHeader>
            <DialogTitle>Create Note</DialogTitle>
            <DialogDescription>
              Create a new note to capture your thoughts and ideas.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex flex-col gap-4 overflow-y-auto flex-1 min-h-0 pr-1">
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
              <Label htmlFor="note-content">Content</Label>
              <Textarea
                id="note-content"
                placeholder="Start writing... (Markdown supported)"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={5}
                className="font-mono text-sm resize-none max-h-[200px] overflow-y-auto"
              />
            </div>

            {!hideProjectSelect && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="note-project">Project</Label>
                <Select
                  value={projectId}
                  onValueChange={(v) => {
                    setProjectId(v);
                    setReleaseId(null);
                  }}
                >
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

            <div className="flex flex-col gap-2">
              <Label>Release</Label>
              <ReleasePicker
                projectId={projectId === 'none' ? null : projectId}
                value={releaseId}
                onChange={setReleaseId}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
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
                <Label>Visibility</Label>
                <div className="flex items-center h-9">
                  <VisibilityLock
                    value={visibility}
                    visibleUserIds={visibleUserIds}
                    onChange={(v, ids) => { setVisibility(v); setVisibleUserIds(ids); }}
                    ownerId={currentUserId ?? ''}
                    currentUserId={currentUserId}
                    size="sm"
                    users={users}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <Paperclip className="size-3.5" />
                  Attachments
                  {pendingFiles.length > 0 && (
                    <span className="ml-1 rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px]">
                      {pendingFiles.length}
                    </span>
                  )}
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-1" />
                  Add files
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
              </div>

              {attachmentError && (
                <p className="text-xs text-destructive">{attachmentError}</p>
              )}

              <div
                className={cn(
                  'rounded-md border-2 border-dashed p-4 text-center text-sm text-muted-foreground transition-colors',
                  isDragging ? 'border-primary/50 bg-primary/5' : 'border-border',
                )}
                onDrop={onFileDrop}
                onDragOver={onFileDragOver}
                onDragLeave={onFileDragLeave}
              >
                {isDragging ? (
                  'Drop files here'
                ) : pendingFiles.length === 0 ? (
                  'Drag and drop files here, paste from clipboard, or click "Add files"'
                ) : null}
              </div>

              {pendingFiles.length > 0 && (
                <div className="space-y-1">
                  {pendingFiles.map((entry, idx) => (
                    <div
                      key={`${entry.file.name}-${idx}`}
                      className={cn(
                        "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                        entry.status === 'error' && "border-destructive/50 bg-destructive/5",
                      )}
                    >
                      {entry.status === 'uploading' && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />}
                      {entry.status === 'success' && <Check className="h-3.5 w-3.5 shrink-0 text-green-500" />}
                      {entry.status === 'error' && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />}
                      {entry.status === 'pending' && (
                        <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-muted-foreground/30" />
                      )}
                      <span className="flex-1 truncate min-w-0" title={entry.file.name}>
                        {entry.file.name}
                      </span>
                      {entry.status === 'error' && entry.error && (
                        <span className="text-xs text-destructive truncate max-w-[120px]" title={entry.error}>
                          {entry.error}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatFileSize(entry.file.size)}
                      </span>
                      {(entry.status === 'pending' || entry.status === 'error') && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removePendingFile(idx)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="mt-4 pt-3 border-t sticky bottom-0 bg-background shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => confirmOpenChange(false)}
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

    <AlertDialog open={showConfirm} onOpenChange={(open) => !open && handleCancelDiscard()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard changes?</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes. Are you sure you want to close? All entered data will be lost.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancelDiscard}>Continue editing</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirmDiscard}>Discard</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
