'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
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
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  History,
  Star,
  Copy,
  Trash2,
  RotateCcw,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { useAppStore } from '@/store/app-store';
import { api } from '@/lib/api-utils';
import { cn, getEntityLink, copyToClipboard } from '@/lib/utils';
import type { Note, NoteVersionMeta } from '@/lib/types';

interface NoteVersionHistoryProps {
  note: Note;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NoteVersionHistory({ note, open, onOpenChange }: NoteVersionHistoryProps) {
  const {
    updateNote,
    restoreNoteVersion,
    deleteNoteVersions,
    setVersionKept,
    currentUserId,
  } = useAppStore();

  const isOwner = currentUserId === note.ownerId;

  const [versions, setVersions] = useState<NoteVersionMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<number[] | null>(null);
  const [busyNumber, setBusyNumber] = useState<number | null>(null);

  const fetchVersions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(api(`/api/notes/${note.id}/versions`));
      if (!res.ok) throw new Error('Failed to load versions');
      const data: NoteVersionMeta[] = await res.json();
      setVersions(data);
    } catch (error) {
      console.error('Failed to load versions:', error);
      toast.error('Failed to load versions');
    } finally {
      setLoading(false);
    }
  }, [note.id]);

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      void fetchVersions();
    }
  }, [open, fetchVersions]);

  const handleToggleVersioning = async (enabled: boolean) => {
    await updateNote(note.id, { versioningEnabled: enabled });
    if (enabled) toast.success('Version history enabled — autosave is now off for this note');
    else toast.success('Version history disabled — autosave resumed');
  };

  const toggleSelected = (number: number, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(number);
      else next.delete(number);
      return next;
    });
  };

  const allSelected = versions.length > 0 && versions.every((v) => selected.has(v.number));
  const someSelected = versions.some((v) => selected.has(v.number)) && !allSelected;

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(versions.map((v) => v.number)) : new Set());
  };

  const noteUrl = (number?: number) =>
    window.location.origin + getEntityLink('note', note.shortId || `N-${note.shortIdNum}`, note.id, number);

  const openVersionLink = (number: number) => {
    window.open(noteUrl(number), '_blank');
  };

  const handleCopyLink = async (number: number) => {
    if (await copyToClipboard(noteUrl(number))) toast.success('Version link copied');
    else toast.error('Failed to copy link');
  };

  const openCurrentLink = () => {
    window.open(noteUrl(), '_blank');
  };

  const handleCopyCurrentLink = async () => {
    if (await copyToClipboard(noteUrl())) toast.success('Note link copied');
    else toast.error('Failed to copy link');
  };

  const handleRestore = async (number: number) => {
    setBusyNumber(number);
    try {
      await restoreNoteVersion(note.id, number);
      toast.success(`Restored from v${number}`);
      await fetchVersions();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to restore';
      toast.error(msg);
    } finally {
      setBusyNumber(null);
    }
  };

  const handleToggleKept = async (v: NoteVersionMeta) => {
    const next = !v.kept;
    // optimistic
    setVersions((prev) => prev.map((x) => (x.number === v.number ? { ...x, kept: next } : x)));
    await setVersionKept(note.id, v.number, next);
    await fetchVersions();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const deleted = await deleteNoteVersions(note.id, deleteTarget);
      toast.success(`Deleted ${deleted} version${deleted === 1 ? '' : 's'}`);
      setSelected(new Set());
      await fetchVersions();
    } catch (error) {
      console.error('Failed to delete versions:', error);
      toast.error('Failed to delete versions');
    } finally {
      setDeleteTarget(null);
    }
  };

  // The live (current) note state, shown at the top of the list. It is not a
  // saved snapshot, so it has no version number and cannot be restored/pinned/
  // deleted — only opened or linked (to the live note, with no ?v=).
  const currentRow = (
    <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-2.5 py-2 text-sm">
      <div className="flex w-5 shrink-0 justify-center">
        <span className="h-2 w-2 rounded-full bg-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold">Current</span>
          <span className="truncate text-xs text-muted-foreground">Live note</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span title={format(new Date(note.updatedAt), 'PPpp')}>
            {formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true })}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button variant="ghost" size="icon" className="size-7" title="Open current note" onClick={openCurrentLink}>
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          title="Copy current note link"
          onClick={() => void handleCopyCurrentLink()}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );

  const versioningOn = note.versioningEnabled;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Version history
          </DialogTitle>
          <DialogDescription>
            {versioningOn
              ? 'Autosave is off. Each manual save creates a version.'
              : 'Autosave is active — no new versions are created.'}
          </DialogDescription>
        </DialogHeader>

        {isOwner && (
          <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium">Track versions</p>
              <p className="text-xs text-muted-foreground">
                When on, save manually to create a version (autosave is disabled for this note).
              </p>
            </div>
            <Switch checked={versioningOn} onCheckedChange={handleToggleVersioning} />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar -mx-1 px-1">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading versions…
            </div>
          ) : versions.length === 0 ? (
            <>
              {currentRow}
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/70">
                <History className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-xs">
                  {versioningOn ? 'No saved versions yet — save manually to create one.' : 'No saved versions.'}
                </p>
              </div>
            </>
          ) : (
            <>
              {currentRow}
              {isOwner && (
                <div className="sticky top-0 z-10 flex items-center gap-2 bg-background/95 backdrop-blur border-b py-2 mb-1">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                    onCheckedChange={(c) => toggleAll(!!c)}
                  />
                  <span className="text-xs text-muted-foreground">
                    {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
                  </span>
                  <div className="flex-1" />
                  {selected.size > 0 && (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setDeleteTarget(Array.from(selected))}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Delete selected
                    </Button>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                {versions.map((v) => {
                  const isSelected = selected.has(v.number);
                  const opLabel = v.operation === 'restore' ? (v.comment ?? 'Restored') : 'Manual save';
                  return (
                    <div
                      key={v.id}
                      className={cn(
                        'flex items-center gap-2 rounded-md border px-2.5 py-2 text-sm transition-colors',
                        isSelected && 'border-primary/40 bg-primary/5',
                      )}
                    >
                      {isOwner && (
                        <div className="w-5 shrink-0">
                          <Checkbox checked={isSelected} onCheckedChange={(c) => toggleSelected(v.number, !!c)} />
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold">v{v.number}</span>
                          <span className="truncate text-xs text-muted-foreground">{opLabel}</span>
                          {v.kept && <Star className="h-3 w-3 fill-amber-400 text-amber-400 shrink-0" />}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                          <span title={format(new Date(v.createdAt), 'PPpp')}>
                            {formatDistanceToNow(new Date(v.createdAt), { addSuffix: true })}
                          </span>
                          {v.author?.name && (
                            <>
                              <span>·</span>
                              <span className="truncate">{v.author.name}</span>
                            </>
                          )}
                        </div>
                        {v.operation === 'manual' && v.comment && (
                          <p className="mt-1 text-xs text-muted-foreground truncate">{v.comment}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button variant="ghost" size="icon" className="size-7" title="Open version" onClick={() => openVersionLink(v.number)}>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-7" title="Copy version link" onClick={() => void handleCopyLink(v.number)}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        {isOwner && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              title={v.kept ? 'Unpin (allow auto-prune)' : 'Pin (protect from auto-prune)'}
                              onClick={() => void handleToggleKept(v)}
                            >
                              <Star className={cn('h-3.5 w-3.5', v.kept && 'fill-amber-400 text-amber-400')} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              title="Restore this version"
                              disabled={busyNumber === v.number}
                              onClick={() => void handleRestore(v.number)}
                            >
                              {busyNumber === v.number ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 hover:text-destructive"
                              title="Delete version"
                              onClick={() => setDeleteTarget([v.number])}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </DialogContent>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget && deleteTarget.length > 1 ? `${deleteTarget.length} versions` : 'version'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Links to a deleted version fall back to the latest version.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
