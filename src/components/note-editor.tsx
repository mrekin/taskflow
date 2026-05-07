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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/toggle-group';
import {
  ArrowLeft,
  Bold,
  Italic,
  Heading1,
  List,
  Code,
  Link,
  Trash2,
  Save,
  Loader2,
  CheckCircle2,
  FileText,
  Heading2,
  ListOrdered,
  Quote,
  Minus,
  Columns2,
  Eye,
  Pencil,
  Clock,
  FolderOpen,
  AtSign,
  ChevronRight,
  Table,
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { shortId } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import type { Note } from '@/lib/types';
import { EntityIdBadge } from '@/components/entity-id-badge';
import { OwnerIndicator } from '@/components/owner-indicator';
import { VisibilityLock } from '@/components/visibility-lock';

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
    currentUserId,
  } = useAppStore();

  const autoSaveEnabled = useAppStore((s) => s.userPreferences.noteAutoSave);

  const note = notes.find((n) => n.id === noteId);
  const isReadOnly = !!note && !!currentUserId && note.ownerId !== currentUserId;

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

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  }, [title, content, projectId, tagIds, lastSavedTitle, lastSavedContent, lastSavedProjectId, lastSavedTagIds]);

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

      await updateNote(note.id, data);
      setLastSavedTitle(title);
      setLastSavedContent(content);
      setLastSavedProjectId(projectId);
      setLastSavedTagIds(tagIds);
      setLastSavedVisibility(visibility);
      setLastSavedVisibleUserIds(visibleUserIds);
      setSaveStatus('saved');
    } catch (error) {
      console.error('Save failed:', error);
      setSaveStatus('unsaved');
    }
  }, [note, title, content, projectId, tagIds, visibility, visibleUserIds, updateNote]);

  // Auto-save with debounce (only when enabled)
  useEffect(() => {
    if (!note || !hasUnsavedChanges || !autoSaveEnabled) return;

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
  }, [title, content, projectId, tagIds, visibility, visibleUserIds, note, hasUnsavedChanges, autoSaveEnabled, performSave]);

  const handleBack = () => {
    if (hasUnsavedChanges && note) {
      performSave();
    }
    selectNote(null);
    setCurrentView('notes');
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

  const insertMarkdown = useCallback((prefix: string, suffix: string = '', defaultText: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    const textToInsert = selectedText || defaultText;

    const newContent =
      textarea.value.substring(0, start) +
      prefix +
      textToInsert +
      suffix +
      textarea.value.substring(end);

    setContent(newContent);

    requestAnimationFrame(() => {
      const newCursorPos = start + prefix.length + textToInsert.length + suffix.length;
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, newCursorPos - suffix.length);
      const insertLine = newContent.substring(0, newCursorPos).split('\n').length;
      const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 20;
      textarea.scrollTop = Math.max(0, insertLine * lineHeight - textarea.clientHeight / 2);
    });
  }, []);

  // Static toolbar config - no ref access at render time
  const toolbarConfig = [
    { icon: Bold, label: 'Bold', prefix: '**', suffix: '**', defaultText: 'bold text' },
    { icon: Italic, label: 'Italic', prefix: '*', suffix: '*', defaultText: 'italic text' },
    { icon: Heading1, label: 'Heading 1', prefix: '# ', suffix: '', defaultText: 'Heading 1' },
    { icon: Heading2, label: 'Heading 2', prefix: '## ', suffix: '', defaultText: 'Heading 2' },
    { icon: List, label: 'Bullet List', prefix: '- ', suffix: '', defaultText: 'list item' },
    { icon: ListOrdered, label: 'Numbered List', prefix: '1. ', suffix: '', defaultText: 'list item' },
    { icon: Code, label: 'Code', prefix: '`', suffix: '`', defaultText: 'code' },
    { icon: Quote, label: 'Quote', prefix: '> ', suffix: '', defaultText: 'quote' },
    { icon: Link, label: 'Link', prefix: '[', suffix: '](url)', defaultText: 'link text' },
    { icon: Minus, label: 'Divider', prefix: '\n---\n', suffix: '', defaultText: '' },
    { icon: Table, label: 'Table', prefix: '\n| Header | Header | Header |\n|--------|--------|--------|\n| Cell   | Cell   | Cell   |\n| Cell   | Cell   | Cell   |\n', suffix: '', defaultText: '' },
  ] as const;

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
          {/* Manual Save button when autosave is off */}
          {!autoSaveEnabled && hasUnsavedChanges && !isReadOnly && (
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
          />

          {/* Mode toggle */}
          {!isReadOnly && (
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

          {!isReadOnly && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Note</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete &quot;{title}&quot;? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {editorMode !== 'preview' && !isReadOnly && (
        <div className="sticky top-0 z-10 flex items-center gap-1 px-3 py-1.5 border-b shrink-0 bg-background">
          {toolbarConfig.map((tool) => (
            <Button
              key={tool.label}
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => insertMarkdown(tool.prefix, tool.suffix, tool.defaultText)}
              title={tool.label}
            >
              <tool.icon className="h-3.5 w-3.5" />
            </Button>
          ))}

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

          <div className="flex-1" />
          <span className="text-[10px] text-muted-foreground shrink-0">
            {content.length} chars
          </span>
        </div>
      )}

      {!isReadOnly && (
        <div className="px-3 py-1.5 border-b shrink-0">
          <TagPicker
            selectedTagIds={tagIds}
            onTagIdsChange={setTagIds}
          />
        </div>
      )}

      {/* Content area - takes most of the screen */}
      <div className="flex-1 overflow-hidden">
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
            <MentionTextarea
              ref={textareaRef}
              value={content}
              onChange={(val) => setContent(val)}
              placeholder="Start writing... (Markdown supported)"
              className="flex-1 min-h-0 resize-none border-none rounded-none px-4 pt-4 pb-8 font-mono text-sm leading-relaxed focus-visible:ring-0 placeholder:text-muted-foreground/50 overflow-y-auto custom-scrollbar w-full"
            />
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
              <MentionTextarea
                ref={textareaRef}
                value={content}
                onChange={(val) => setContent(val)}
                onScroll={syncPreviewScroll}
                placeholder="Start writing... (Markdown supported)"
                className="flex-1 min-h-0 resize-none border-none rounded-none px-4 pt-4 pb-8 font-mono text-sm leading-relaxed focus-visible:ring-0 placeholder:text-muted-foreground/50 overflow-y-auto custom-scrollbar w-full"
              />
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
      </div>
    </div>
  );
}
