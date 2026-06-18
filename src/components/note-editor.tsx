'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAppStore } from '@/store/app-store';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { TagPicker } from '@/components/tag-picker';
import { TagBadges } from '@/components/tag-badges';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MentionTextarea } from '@/components/mention-autocomplete';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DeleteDialog } from '@/components/delete-dialog';
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
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { MarkdownToolbar } from '@/components/markdown-toolbar';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/toggle-group';
import {
  ArrowLeft,
  Trash2,
  Save,
  Loader2,
  CheckCircle2,
  FileText,
  Columns2,
  Eye,
  Pencil,
  Clock,
  FolderOpen,
  AtSign,
  ChevronRight,
  Paperclip,
  History,
  RotateCcw,
  ExternalLink,
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { shortId, getEntityLink, copyToClipboard } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import type { Note, NoteVersion as NoteVersionData } from '@/lib/types';
import { EntityIdBadge } from '@/components/entity-id-badge';
import { OwnerIndicator } from '@/components/owner-indicator';
import { VisibilityLock } from '@/components/visibility-lock';
import { AttachmentList } from '@/components/attachment-list';
import { NoteVersionHistory } from '@/components/note-version-history';
import { useInlineFileUpload } from '@/hooks/use-inline-file-upload';
import { api } from '@/lib/api-utils';
import { toast } from 'sonner';

type SaveStatus = 'saved' | 'saving' | 'unsaved';
type EditorMode = 'edit' | 'preview' | 'split';

interface NoteEditorProps {
  noteId: string;
  initialMode?: EditorMode;
}

export function NoteEditor({ noteId, initialMode = 'preview' }: NoteEditorProps) {
  const {
    notes,
    projects,
    folders,
    areas,
    tasks,
    tags,
    updateNote,
    deleteNote,
    selectNote,
    selectProject,
    selectArea,
    setCurrentView,
    users,
    currentUserId,
  } = useAppStore();
  const saveNoteVersion = useAppStore((s) => s.saveNoteVersion);
  const restoreNoteVersion = useAppStore((s) => s.restoreNoteVersion);

  const autoSaveEnabled = useAppStore((s) => s.userPreferences.noteAutoSave);

  const note = notes.find((n) => n.id === noteId);
  const isReadOnly = !!note && !!currentUserId && note.ownerId !== currentUserId;
  const versioningOn = !!note?.versioningEnabled;

  // Initialize state from note - noteId is stable (set via key prop on parent)
  const [title, setTitle] = useState(() => note?.title ?? '');
  const [content, setContent] = useState(() => note?.content ?? '');
  const [projectId, setProjectId] = useState<string>(() => note?.projectId ?? 'none');
  const [tagIds, setTagIds] = useState<string[]>(() => note?.tagIds ?? []);
  const [visibility, setVisibility] = useState<string | null>(() => note?.visibility ?? null);
  const [visibleUserIds, setVisibleUserIds] = useState<string[]>(() => note?.visibleUserIds ?? []);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [editorMode, setEditorMode] = useState<EditorMode>(initialMode);

  // Track "last saved" state using regular state (avoids ref-in-render issues)
  const [lastSavedTitle, setLastSavedTitle] = useState(() => note?.title ?? '');
  const [lastSavedContent, setLastSavedContent] = useState(() => note?.content ?? '');
  const [lastSavedProjectId, setLastSavedProjectId] = useState(() => note?.projectId ?? 'none');
  const [lastSavedTagIds, setLastSavedTagIds] = useState<string[]>(() => note?.tagIds ?? []);
  const [lastSavedVisibility, setLastSavedVisibility] = useState<string | null>(() => note?.visibility ?? null);
  const [lastSavedVisibleUserIds, setLastSavedVisibleUserIds] = useState<string[]>(() => note?.visibleUserIds ?? []);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [versionComment, setVersionComment] = useState('');
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<NoteVersionData | null>(null);
  const [versionLoading, setVersionLoading] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const inlineUpload = useInlineFileUpload({
    entityId: note?.id,
    entityType: note ? 'note' : undefined,
    textareaRef,
    value: content,
    onChange: setContent,
  });

  // Derived = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derived: are there unsaved changes?
  const hasUnsavedChanges = useMemo(() => {
    return (
      title !== lastSavedTitle ||
      content !== lastSavedContent ||
      projectId !== lastSavedProjectId ||
      JSON.stringify(tagIds) !== JSON.stringify(lastSavedTagIds) ||
      visibility !== lastSavedVisibility ||
      JSON.stringify(visibleUserIds) !== JSON.stringify(lastSavedVisibleUserIds)
    );
  }, [title, content, projectId, tagIds, visibility, visibleUserIds, lastSavedTitle, lastSavedContent, lastSavedProjectId, lastSavedTagIds, lastSavedVisibility, lastSavedVisibleUserIds]);

  // Save function (shared between auto-save and manual save)
  const performSave = useCallback(async () => {
    if (!note) return;
    setSaveStatus('saving');
    try {
      const data: Partial<Note> = {
        title: title.trim(),
        content,
        projectId: projectId === 'none' ? null : projectId,
        tagIds,
        visibility,
        visibleUserIds,
      };

      if (versioningOn && !isReadOnly) {
        // Versioning mode: manual save creates a new version (and persists live state).
        const version = await saveNoteVersion(note.id, {
          title: title.trim(),
          content,
          projectId: projectId === 'none' ? null : projectId,
          tagIds,
          visibility,
          visibleUserIds,
          comment: versionComment.trim() || undefined,
        });
        setVersionComment('');
        if (version) toast.success(`Saved version v${version.number}`);
      } else {
        await updateNote(note.id, data);
      }

      setLastSavedTitle(title);
      setLastSavedContent(content);
      setLastSavedProjectId(projectId);
      setLastSavedTagIds(tagIds);
      setLastSavedVisibility(visibility);
      setLastSavedVisibleUserIds(visibleUserIds);
      setSaveStatus('saved');
    } catch (error) {
      console.error('Save failed:', error);
      const msg = error instanceof Error ? error.message : 'Save failed';
      toast.error(msg);
      setSaveStatus('unsaved');
    }
  }, [note, title, content, projectId, tagIds, visibility, visibleUserIds, updateNote, versioningOn, isReadOnly, versionComment, saveNoteVersion]);

  // Auto-save with debounce (only when enabled and versioning is off)
  useEffect(() => {
    if (!note || !hasUnsavedChanges || !autoSaveEnabled || versioningOn) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      performSave();
    }, 1500);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [title, content, projectId, tagIds, visibility, visibleUserIds, note, hasUnsavedChanges, autoSaveEnabled, versioningOn, performSave]);

  // Reflect unsaved edits in the status indicator (the "Saved" badge must not
  // persist after further edits — important in manual/versioning mode where there
  // is no auto-save to flip it for us).
  useEffect(() => {
    if (hasUnsavedChanges && saveStatus === 'saved') {
      setSaveStatus('unsaved');
    }
  }, [hasUnsavedChanges, saveStatus]);

  const doCloseNote = () => {
    selectNote(null);
    setCurrentView('notes');
  };

  const handleBack = () => {
    // Confirm before discarding unsaved edits (mirrors the task editor flow).
    if (hasUnsavedChanges && !viewingVersion) {
      setShowDiscardConfirm(true);
      return;
    }
    doCloseNote();
  };

  const handleConfirmDiscard = () => {
    setShowDiscardConfirm(false);
    doCloseNote();
  };

  // Load a specific version when deep-linked via ?v=N. Falls back to the latest
  // existing version if the requested one is gone (deleted), or to the live note
  // if there are no versions at all.
  const loadVersion = useCallback(async (target: number) => {
    if (!note) return;
    setVersionLoading(true);
    try {
      const direct = await fetch(api(`/api/notes/${note.id}/versions/${target}`));
      if (direct.ok) {
        setViewingVersion(await direct.json());
        return;
      }
      // Requested version missing → fall back to the latest existing version.
      const listRes = await fetch(api(`/api/notes/${note.id}/versions`));
      if (listRes.ok) {
        const list = await listRes.json();
        if (Array.isArray(list) && list.length > 0) {
          const latest: { number: number } = list[0];
          const fallback = await fetch(api(`/api/notes/${note.id}/versions/${latest.number}`));
          if (fallback.ok) {
            const v = await fallback.json();
            setViewingVersion(v);
            toast.info(`Version v${target} not found — showing latest v${latest.number}`);
            return;
          }
        }
      }
      // No versions at all → show the live note.
      setViewingVersion(null);
    } catch (error) {
      console.error('Failed to load version:', error);
      setViewingVersion(null);
    } finally {
      setVersionLoading(false);
    }
  }, [note]);

  // Deep-linked version (?v=N) is a ONE-TIME view: load it once when the note
  // is available, then strip ?v= from the URL so leaving and returning to the
  // note (or editing it) shows the current version instead of reopening it.
  const deepLinkVersionLoadedRef = useRef(false);
  useEffect(() => {
    if (deepLinkVersionLoadedRef.current || !note) return;
    deepLinkVersionLoadedRef.current = true;
    const raw = new URLSearchParams(window.location.search).get('v');
    const target = raw ? parseInt(raw, 10) : NaN;
    if (Number.isFinite(target)) {
      window.history.replaceState(null, '', getEntityLink('note', note.shortId || 'N-?', note.id));
      void loadVersion(target);
    } else {
      setViewingVersion(null);
    }
  }, [note, loadVersion]);

  const handleRestoreViewedVersion = async () => {
    if (!note || !viewingVersion) return;
    try {
      await restoreNoteVersion(note.id, viewingVersion.number);
      toast.success(`Restored from v${viewingVersion.number}`);
      setViewingVersion(null);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to restore';
      toast.error(msg);
    }
  };

  const handleGoToCurrent = () => {
    if (!note) return;
    setViewingVersion(null);
  };

  const handleCopyVersionLink = async () => {
    if (!note || !viewingVersion) return;
    const url = window.location.origin + getEntityLink('note', note.shortId || 'N-?', note.id, viewingVersion.number);
    if (await copyToClipboard(url)) toast.success('Version link copied');
    else toast.error('Failed to copy link');
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        performSave();
      }
      if (e.key === 'Escape') {
        handleBack();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [performSave, handleBack]);

  const handleDelete = async () => {
    if (!note) return;
    await deleteNote(note.id);
    selectNote(null);
    setCurrentView('notes');
  };

  const previewRef = useRef<HTMLDivElement>(null);

  const syncPreviewScroll = useCallback(() => {
    const textarea = textareaRef.current;
    const preview = previewRef.current;
    if (!textarea || !preview) return;
    const maxScroll = textarea.scrollHeight - textarea.clientHeight;
    if (maxScroll <= 0) {
      preview.scrollTop = 0;
      return;
    }
    const ratio = textarea.scrollTop / maxScroll;
    preview.scrollTop = ratio * (preview.scrollHeight - preview.clientHeight);
  }, []);

  useEffect(() => {
    syncPreviewScroll();
  }, [content, syncPreviewScroll]);

  // Insert entity reference
  const insertEntityRef = useCallback((prefix: string, id: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const ref = `#${prefix}-${id}`;
    const newContent = textarea.value.substring(0, start) + ref + textarea.value.substring(start);
    setContent(newContent);
    requestAnimationFrame(() => {
      const newCursorPos = start + ref.length;
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    });
  }, []);

  const getSaveStatusDisplay = () => {
    switch (saveStatus) {
      case 'saving':
        return (
          <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            Saving...
          </span>
        );
      case 'saved':
        return (
          <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
            Saved
          </span>
        );
      case 'unsaved':
        return (
          <span className="flex items-center gap-1.5 text-xs text-orange-600 dark:text-orange-400">
            <Save className="h-3 w-3" />
            Unsaved
          </span>
        );
    }
  };

  if (!note) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <FileText className="h-16 w-16 mb-4 opacity-20" />
        <p className="text-lg font-medium">No note selected</p>
        <p className="text-sm mt-1">Select a note from the list to view</p>
        <Button variant="outline" className="mt-4" onClick={() => setCurrentView('notes')}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Notes
        </Button>
      </div>
    );
  }

  const currentProject = projects.find((p) => p.id === (projectId === 'none' ? null : projectId));

  return (
    <div className="flex flex-col h-full">
      {/* Compact header bar */}
      <div className="flex items-center justify-between gap-3 px-2 py-2 border-b shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0 size-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Separator orientation="vertical" className="h-5" />
          {getSaveStatusDisplay()}
          {isReadOnly && (
            <>
              <Badge variant="secondary" className="text-xs h-5">Read-only</Badge>
              <OwnerIndicator ownerId={note.ownerId} currentUserId={currentUserId} />
            </>
          )}
          {/* Manual Save button when autosave is off or versioning is on */}
          {(!autoSaveEnabled || versioningOn) && hasUnsavedChanges && !isReadOnly && !viewingVersion && (
            <>
              {versioningOn && (
                <input
                  type="text"
                  value={versionComment}
                  onChange={(e) => setVersionComment(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void performSave(); } }}
                  placeholder="Comment (optional)"
                  className="h-7 w-40 rounded-md border border-input bg-background px-2 text-xs placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs gap-1.5"
                onClick={performSave}
                disabled={saveStatus === 'saving'}
              >
                {saveStatus === 'saving' ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
                Save
              </Button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <VisibilityLock
            value={visibility}
            visibleUserIds={visibleUserIds}
            onChange={(v, ids) => { setVisibility(v); setVisibleUserIds(ids); }}
            ownerId={note.ownerId}
            currentUserId={currentUserId}
            disabled={isReadOnly || editorMode === 'preview'}
            size="sm"
            users={users}
          />

          {/* Mode toggle */}
          {!isReadOnly && !viewingVersion && (
            <ToggleGroup
              type="single"
              value={editorMode}
              onValueChange={(value) => {
                if (value) setEditorMode(value as EditorMode);
              }}
              className="gap-0"
            >
              <ToggleGroupItem value="preview" className="h-7 px-2.5 text-xs gap-1.5" title="View">
                <Eye className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">View</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="edit" className="h-7 px-2.5 text-xs gap-1.5" title="Edit">
                <Pencil className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Edit</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="split" className="h-7 px-2.5 text-xs gap-1.5" title="Side by side">
                <Columns2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Split</span>
              </ToggleGroupItem>
            </ToggleGroup>
          )}

          <Separator orientation="vertical" className="h-5" />

          {/* Project selector */}
          {editorMode !== 'preview' && !isReadOnly && (
            <Select
              value={projectId}
              onValueChange={(v) => setProjectId(v)}
            >
              <SelectTrigger className="w-[140px] h-7 text-xs">
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No project</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: p.color }}
                      />
                      {p.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {!isReadOnly && !viewingVersion && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground"
                title="Version history"
                onClick={() => setShowHistoryDialog(true)}
              >
                <History className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" onClick={() => setShowDeleteDialog(true)}>
                <Trash2 className="h-4 w-4" />
              </Button>
              <DeleteDialog
                open={showDeleteDialog}
                onOpenChange={setShowDeleteDialog}
                title="Delete Note"
                description={<>Are you sure you want to delete &quot;{title}&quot;? This action cannot be undone.</>}
                onConfirm={handleDelete}
              />
            </>
          )}
        </div>
      </div>

      {editorMode !== 'preview' && !isReadOnly && !viewingVersion && (
        <div className="sticky top-0 z-10 flex items-center gap-1 px-3 py-1.5 border-b shrink-0 bg-background">
          <MarkdownToolbar
            textareaRef={textareaRef}
            value={content}
            onChange={setContent}
          >
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={inlineUpload.triggerFilePicker}
              disabled={inlineUpload.uploadingFiles.length > 0}
              title="Upload file"
            >
              {inlineUpload.uploadingFiles.length > 0 ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Paperclip className="h-3.5 w-3.5" />
              )}
            </Button>
            {inlineUpload.fileInputElement}

            {/* Entity reference inserter */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Insert reference">
                  <AtSign className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="start" side="bottom">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground px-1">Insert entity reference</p>
                  {tasks.length > 0 && (
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-1">Tasks</p>
                      <div className="max-h-24 overflow-y-auto custom-scrollbar">
                        {tasks.filter((t) => !t.parentId).slice(0, 10).map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            className="w-full text-left text-xs px-2 py-1 rounded hover:bg-muted transition-colors truncate flex items-center gap-1.5"
                            onClick={() => insertEntityRef('T', shortId(t.id))}
                          >
                            <span className="text-primary font-mono text-[10px]">T</span>
                            <span className="truncate">{t.title}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {projects.length > 0 && (
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-1">Projects</p>
                      <div className="max-h-24 overflow-y-auto custom-scrollbar">
                        {projects.slice(0, 10).map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className="w-full text-left text-xs px-2 py-1 rounded hover:bg-muted transition-colors truncate flex items-center gap-1.5"
                            onClick={() => insertEntityRef('P', shortId(p.id))}
                          >
                            <span className="text-primary font-mono text-[10px]">P</span>
                            <span className="truncate">{p.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {notes.length > 0 && (
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-1">Notes</p>
                      <div className="max-h-24 overflow-y-auto custom-scrollbar">
                        {notes.slice(0, 10).map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            className="w-full text-left text-xs px-2 py-1 rounded hover:bg-muted transition-colors truncate flex items-center gap-1.5"
                            onClick={() => insertEntityRef('N', shortId(n.id))}
                          >
                            <span className="text-primary font-mono text-[10px]">N</span>
                            <span className="truncate">{n.title}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground px-1 pt-1 border-t">
                    Format: #T-id, #P-id, #N-id
                  </p>
                </div>
              </PopoverContent>
            </Popover>
          </MarkdownToolbar>

          <div className="flex-1" />
          <span className="text-[10px] text-muted-foreground shrink-0">
            {content.length} chars
          </span>
        </div>
      )}

      {!isReadOnly && !viewingVersion && (
        <div className="px-3 py-1.5 border-b shrink-0">
          <TagPicker
            selectedTagIds={tagIds}
            onTagIdsChange={setTagIds}
          />
        </div>
      )}

      {/* Content area - takes most of the screen */}
      <div className="flex-1 overflow-hidden">
        {versionLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading version…
          </div>
        ) : viewingVersion ? (
          <div className="h-full overflow-y-auto custom-scrollbar">
            <div className="w-full md:w-[90%] mx-auto px-4 md:px-6 py-6">
              {/* Version banner */}
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
                <History className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                <span className="font-medium">
                  Viewing v{viewingVersion.number}
                </span>
                <span className="text-muted-foreground">
                  · {viewingVersion.operation === 'restore' ? 'Restored' : 'Manual save'}
                </span>
                <span className="text-muted-foreground" title={viewingVersion.createdAt}>
                  · {formatDistanceToNow(new Date(viewingVersion.createdAt), { addSuffix: true })}
                </span>
                {viewingVersion.author?.name && (
                  <span className="text-muted-foreground">· {viewingVersion.author.name}</span>
                )}
                {viewingVersion.comment && (
                  <span className="text-muted-foreground truncate">· {viewingVersion.comment}</span>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => void handleCopyVersionLink()}>
                    <ExternalLink className="h-3 w-3" />
                    Copy link
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={handleGoToCurrent}>
                    Go to current
                  </Button>
                  {!isReadOnly && (
                    <Button variant="default" size="sm" className="h-7 text-xs gap-1.5" onClick={() => void handleRestoreViewedVersion()}>
                      <RotateCcw className="h-3 w-3" />
                      Restore
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">{viewingVersion.title}</h1>
                <EntityIdBadge id={note.id} shortId={note.shortId || 'N-?'} type="note" version={viewingVersion.number} />
              </div>

              <Separator className="my-6" />

              {!viewingVersion.content.trim() ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground/50">
                  <FileText className="h-12 w-12 mb-3 opacity-30" />
                  <p className="text-sm">This version is empty</p>
                </div>
              ) : (
                <div className="prose-container">
                  <MarkdownRenderer content={viewingVersion.content} stripFirstH1={true} />
                </div>
              )}
            </div>
          </div>
        ) : (
        <>
        {/* Preview / View mode - content-centric */}
        {editorMode === 'preview' && (
          <div className="h-full overflow-y-auto custom-scrollbar">
            <div className="w-full md:w-[90%] mx-auto px-4 md:px-6 py-6">
              {/* Breadcrumb: Area > Project > Folder > Note */}
              <div className="flex flex-wrap items-center gap-1 mb-2 text-xs text-muted-foreground">
                {(() => {
                  const crumbs: { label: string; onClick?: () => void; icon?: React.ReactNode }[] = [];
                  if (currentProject?.areaId) {
                    const area = areas.find((a) => a.id === currentProject.areaId);
                    if (area) {
                      crumbs.push({
                        label: area.name,
                        icon: <span className="text-[10px]">{area.icon || '📁'}</span>,
                        onClick: () => { selectArea(area.id); setCurrentView('areas'); },
                      });
                    }
                  }
                  if (currentProject) {
                    crumbs.push({
                      label: currentProject.name,
                      icon: <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: currentProject.color }} />,
                      onClick: () => { selectProject(currentProject.id); setCurrentView('projects'); },
                    });
                  }
                  if (note.folderId) {
                    const folder = folders.find((f) => f.id === note.folderId);
                    if (folder) {
                      crumbs.push({
                        label: folder.name,
                        icon: <FolderOpen className="h-3 w-3" />,
                      });
                    }
                  }
                  return crumbs.map((crumb, i) => (
                    <span key={i} className="inline-flex items-center gap-1">
                      {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/50" />}
                      {crumb.onClick ? (
                        <button
                          type="button"
                          onClick={crumb.onClick}
                          className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
                        >
                          {crumb.icon}
                          {crumb.label}
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          {crumb.icon}
                          {crumb.label}
                        </span>
                      )}
                    </span>
                  ));
                })()}
              </div>

              {/* Title area */}
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                <EntityIdBadge id={note.id} shortId={note.shortId || 'N-?'} type="note" />
              </div>

              {/* Meta row: tags, date */}
              <div className="flex flex-wrap items-center gap-2 mb-5 text-muted-foreground">
                {tagIds && tagIds.length > 0 && (
                  <TagBadges tagIds={tagIds} max={5} size="sm" />
                )}
                <span className="flex items-center gap-1 text-[11px]">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true })}
                </span>
              </div>

              <Separator className="mb-6" />

              {/* Content */}
              {!content.trim() ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground/50">
                  <FileText className="h-12 w-12 mb-3 opacity-30" />
                  <p className="text-sm">This note is empty</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => setEditorMode('edit')}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    Start writing
                  </Button>
                </div>
              ) : (
                <div className="prose-container">
                  <MarkdownRenderer content={content} stripFirstH1={true} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Edit mode */}
        {editorMode === 'edit' && (
          <div className="h-full flex flex-col overflow-hidden pb-6">
            <div className="px-4 pt-3 shrink-0">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-lg font-semibold border-none p-0 h-auto shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
                placeholder="Note title..."
              />
            </div>
            <div className="relative flex-1 min-h-0" {...inlineUpload.dragHandlers}>
              {inlineUpload.isDragOver && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary/5 border-2 border-dashed border-primary/40 rounded-md pointer-events-none">
                  <p className="text-sm text-primary font-medium">Drop files to upload</p>
                </div>
              )}
              <MentionTextarea
                ref={textareaRef}
                value={content}
                onChange={(val) => setContent(val)}
                onFilePaste={inlineUpload.onPaste}
                placeholder="Start writing... (Markdown supported)"
                data-note-content
                className="h-full resize-none border-none rounded-none px-4 pt-4 pb-8 font-mono text-sm leading-relaxed focus-visible:ring-0 placeholder:text-muted-foreground/50 overflow-y-auto custom-scrollbar w-full"
              />
            </div>
            {inlineUpload.uploadingFiles.length > 0 && (
              <div className="flex items-center gap-2 px-4 py-1.5 text-xs text-muted-foreground bg-muted/50">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Uploading {inlineUpload.uploadingFiles.join(', ')}</span>
              </div>
            )}
            {inlineUpload.uploadError && (
              <p className="text-xs text-destructive px-4">{inlineUpload.uploadError}</p>
            )}
          </div>
        )}

        {editorMode === 'split' && (
          <div className="h-full grid grid-cols-1 lg:grid-cols-2 divide-x divide-border">
            <div className="h-full overflow-hidden flex flex-col min-h-0 pb-6">
              <div className="px-4 py-2 border-b bg-muted/30">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Editor</span>
              </div>
              <div className="px-4 pt-3 shrink-0">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-base font-semibold border-none p-0 h-auto shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
                  placeholder="Note title..."
                />
              </div>
              <div className="relative flex-1 min-h-0" {...inlineUpload.dragHandlers}>
                {inlineUpload.isDragOver && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary/5 border-2 border-dashed border-primary/40 pointer-events-none">
                    <p className="text-sm text-primary font-medium">Drop files to upload</p>
                  </div>
                )}
                <MentionTextarea
                  ref={textareaRef}
                  value={content}
                  onChange={(val) => setContent(val)}
                  onFilePaste={inlineUpload.onPaste}
                  onScroll={syncPreviewScroll}
                  placeholder="Start writing... (Markdown supported)"
                  data-note-content
                  className="h-full resize-none border-none rounded-none px-4 pt-4 pb-8 font-mono text-sm leading-relaxed focus-visible:ring-0 placeholder:text-muted-foreground/50 overflow-y-auto custom-scrollbar w-full"
                />
              </div>
              {inlineUpload.uploadingFiles.length > 0 && (
                <div className="flex items-center gap-2 px-4 py-1.5 text-xs text-muted-foreground bg-muted/50">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Uploading {inlineUpload.uploadingFiles.join(', ')}</span>
                </div>
              )}
              {inlineUpload.uploadError && (
                <p className="text-xs text-destructive px-4">{inlineUpload.uploadError}</p>
              )}
            </div>

            {/* Preview pane */}
            <div className="h-full overflow-hidden flex flex-col">
              <div className="px-4 py-2 border-b bg-muted/30">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Preview</span>
              </div>
              <div ref={previewRef} className="flex-1 overflow-y-auto p-6 pb-12 custom-scrollbar">
                {!content.trim() ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground/50">
                    <p className="text-sm">Preview will appear here...</p>
                  </div>
                ) : (
                  <MarkdownRenderer content={content} stripFirstH1={true} />
                )}
              </div>
            </div>
          </div>
        )}
        </>
        )}
      </div>

      {/* Attachments */}
      {note && !viewingVersion && (
        <div className="border-t pt-4 mt-4 px-3 pb-16 md:pb-2">
          <AttachmentList
            entityId={note.id}
            entityType="note"
            ownerId={note.ownerId}
          />
        </div>
      )}

      {note && (
        <NoteVersionHistory
          note={note}
          open={showHistoryDialog}
          onOpenChange={setShowHistoryDialog}
        />
      )}

      <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to close this note? All unsaved edits will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continue editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDiscard}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
