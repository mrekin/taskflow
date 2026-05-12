'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAppStore } from '@/store/app-store';
import type { Note, NoteFolder } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CreateNoteDialog } from '@/components/create-note-dialog';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { TagBadges } from '@/components/tag-badges';
import { EntityIdBadge } from '@/components/entity-id-badge';
import { VisibilityBadge } from '@/components/visibility-badge';
import { VisibilityLock } from '@/components/visibility-lock';
import { OwnerIndicator } from '@/components/owner-indicator';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Plus,
  Search,
  FileText,
  Clock,
  ArrowUpDown,
  X,
  StickyNote,
  Tag,
  Download,
  Upload,
  FileDown,
  Folder,
  FolderPlus,
  ChevronRight,
  MoreVertical,
  Pencil,
  Trash2,
  Home,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

type SortOption = 'id' | 'createdAt' | 'updatedAt' | 'title' | 'project' | 'folder';

export function NotesList() {
  const {
    notes,
    projects,
    selectedProjectId,
    fetchNotes,
    selectNote,
    setCurrentView,
    selectProject,
    isLoading,
    tags,
    tagFilter,
    setTagFilter,
    projectFilter,
    createNote,
    folders,
    fetchFolders,
    createFolder,
    updateFolder,
    deleteFolder,
    selectedFolderId,
    noteSearchQuery,
    setNoteSearchQuery,
    noteSearchResults,
    folderSearchResults,
    searchNotes,
    clearNoteSearch,
    currentUserId,
    ownershipFilter,
    setOwnershipFilter,
    users,
  } = useAppStore();

  const [searchInput, setSearchInput] = useState(noteSearchQuery);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentFolderId = useMemo(() => {
    return selectedFolderId ?? null;
  }, [selectedFolderId]);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const executeSearch = useCallback((value: string) => {
    if (value.trim()) {
      searchNotes(selectedProjectId ?? undefined, value, currentFolderId ?? undefined);
    } else {
      clearNoteSearch();
    }
  }, [selectedProjectId, currentFolderId, searchNotes, clearNoteSearch]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setNoteSearchQuery(value);
      executeSearch(value);
    }, 500);
  }, [setNoteSearchQuery, executeSearch]);

  const handleSearchSubmit = useCallback(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setNoteSearchQuery(searchInput);
    executeSearch(searchInput);
  }, [searchInput, setNoteSearchQuery, executeSearch]);

  const clearSearch = useCallback(() => {
    setSearchInput('');
    setNoteSearchQuery('');
    clearNoteSearch();
  }, [setNoteSearchQuery, clearNoteSearch]);

  const [sortBy, setSortBy] = useState<SortOption>('updatedAt');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [showTagFilter, setShowTagFilter] = useState(false);

  // Folder navigation state (currentFolderId derived from selectedFolderId)

  // Folder dialog state
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renameFolderId, setRenameFolderId] = useState<string | null>(null);
  const [renameFolderName, setRenameFolderName] = useState('');
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);

  useEffect(() => {
    fetchNotes(selectedProjectId ?? undefined);
    fetchFolders(selectedProjectId ?? undefined);
  }, [fetchNotes, fetchFolders, selectedProjectId]);

  useEffect(() => {
    if (noteSearchQuery.trim()) {
      executeSearch(noteSearchQuery);
    }
  }, [currentFolderId, executeSearch, noteSearchQuery]);

  const folderBreadcrumbs = useMemo((): NoteFolder[] => {
    if (!selectedFolderId) return [];
    const chain: NoteFolder[] = [];
    let current = folders.find((f) => f.id === selectedFolderId);
    while (current) {
      chain.unshift(current);
      current = current.parentId
        ? folders.find((f) => f.id === current!.parentId)
        : undefined;
    }
    return chain;
  }, [selectedFolderId, folders]);

  const filteredProject = useMemo(() => {
    if (!selectedProjectId) return null;
    return projects.find((p) => p.id === selectedProjectId) ?? null;
  }, [projects, selectedProjectId]);

  const isSearching = noteSearchQuery.trim().length > 0;

  const visibleFolders = useMemo(() => {
    if (isSearching) {
      return folderSearchResults;
    }
    return folders.filter((f) => f.parentId === currentFolderId);
  }, [folders, currentFolderId, isSearching, folderSearchResults]);

  const handleFolderClick = (folder: NoteFolder) => {
    useAppStore.getState().selectFolder(folder.id);
  };

  const handleBreadcrumbClick = (folderId: string | null) => {
    useAppStore.getState().selectFolder(folderId);
  };

  const filteredAndSortedNotes = useMemo(() => {
    let result = isSearching ? [...noteSearchResults] : [...notes];

    if (!isSearching) {
      result = result.filter((note) => note.folderId === currentFolderId);
    }

    if (tagFilter && tagFilter.length > 0) {
      result = result.filter((note) =>
        tagFilter.some((tagId) => (note.tagIds || []).includes(tagId))
      );
    }

    if (projectFilter && projectFilter.length > 0) {
      result = result.filter((note) =>
        note.projectId != null && projectFilter.includes(note.projectId)
      );
    }

    if (ownershipFilter === 'mine') {
      result = result.filter((note) => note.ownerId === currentUserId);
    } else if (ownershipFilter === 'shared') {
      result = result.filter((note) => note.ownerId !== currentUserId);
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case 'id':
          return (a.shortIdNum ?? 0) - (b.shortIdNum ?? 0);
        case 'createdAt':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'updatedAt':
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        case 'title':
          return a.title.localeCompare(b.title);
        case 'project': {
          const aProject = a.project?.name ?? 'zzz';
          const bProject = b.project?.name ?? 'zzz';
          return aProject.localeCompare(bProject);
        }
        case 'folder': {
          const aFolder = a.folder?.name ?? 'zzz';
          const bFolder = b.folder?.name ?? 'zzz';
          return aFolder.localeCompare(bFolder);
        }
        default:
          return 0;
      }
    });

    return result;
  }, [notes, noteSearchResults, isSearching, sortBy, tagFilter, projectFilter, currentFolderId, ownershipFilter, currentUserId]);

  const handleNoteClick = (note: Note) => {
    selectNote(note.id);
    setCurrentView('note-editor');
  };

  const handleClearFilter = () => {
    selectProject(null);
  };

  // Folder CRUD handlers
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await createFolder({
        name: newFolderName.trim(),
        parentId: currentFolderId,
      });
      setNewFolderName('');
      setCreateFolderOpen(false);
      toast.success(`Folder "${newFolderName.trim()}" created`);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to create folder';
      toast.error(message);
    }
  };

  const handleRenameFolder = async () => {
    if (!renameFolderId || !renameFolderName.trim()) return;
    try {
      await updateFolder(renameFolderId, { name: renameFolderName.trim() });
      setRenameFolderId(null);
      setRenameFolderName('');
      toast.success('Folder renamed');
    } catch {
      toast.error('Failed to rename folder');
    }
  };

  const handleDeleteFolder = async (folderId?: string) => {
    const id = folderId ?? deleteFolderId;
    if (!id) return;
    try {
      await deleteFolder(id);
      setDeleteFolderId(null);
      toast.success('Folder deleted');
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to delete folder';
      toast.error(message);
    }
  };

  const isFolderNonEmpty = (folderId: string) => {
    return folders.some((f) => f.parentId === folderId) || notes.some((n) => n.folderId === folderId);
  };

  const openRenameDialog = (folder: NoteFolder) => {
    setRenameFolderId(folder.id);
    setRenameFolderName(folder.name);
  };

  function downloadFile(filename: string, content: string) {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const handleExportSingle = (note: Note) => {
    const filename = `${note.title}.md`;
    downloadFile(filename, note.content || '');
    toast.success(`Exported "${note.title}"`);
  };

  const handleExportAll = () => {
    const visibleNotes = filteredAndSortedNotes;
    if (visibleNotes.length === 0) {
      toast.error('No notes to export');
      return;
    }
    if (visibleNotes.length === 1) {
      handleExportSingle(visibleNotes[0]);
      return;
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const parts = visibleNotes.map((note) => {
      const projectName = note.project?.name ?? 'No Project';
      const updatedDate = new Date(note.updatedAt).toLocaleDateString();
      return `# ${note.title}\n\n> Project: ${projectName} | Updated: ${updatedDate}\n\n${note.content || ''}`;
    });
    const content = parts.join('\n\n---\n\n');
    downloadFile(`notes-export-${timestamp}.md`, content);
    toast.success(`Exported ${visibleNotes.length} notes`);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.md,.txt,.markdown';
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files) return;
      let imported = 0;
      for (const file of Array.from(files)) {
        const content = await file.text();
        const title = file.name.replace(/\.(md|txt|markdown)$/, '');
        await createNote({
          title,
          content,
          projectId: selectedProjectId || null,
          folderId: currentFolderId,
        });
        imported++;
      }
      fetchNotes(selectedProjectId ?? undefined);
      toast.success(`Imported ${imported} note${imported !== 1 ? 's' : ''}`);
    };
    input.click();
  };

  const getFolderItemCount = (folder: NoteFolder): number => {
    const directChildren = folders.filter((f) => f.parentId === folder.id).length;
    const directNotes = notes.filter((n) => n.folderId === folder.id).length;
    return directChildren + directNotes;
  };

  if (isLoading && notes.length === 0 && folders.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-muted-foreground">Loading notes...</div>
      </div>
    );
  }

  const hasNoContent = visibleFolders.length === 0 && filteredAndSortedNotes.length === 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col gap-4 pb-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StickyNote className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Notes</h1>
            {filteredProject && (
              <Badge
                variant="secondary"
                className="flex items-center gap-1.5 px-2.5 py-0.5"
              >
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: filteredProject.color }}
                />
                {filteredProject.name}
                <button
                  onClick={handleClearFilter}
                  className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
                  aria-label="Clear filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleImport}>
              <Upload className="h-4 w-4 mr-1.5" />
              Import
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportAll}>
              <FileDown className="h-4 w-4 mr-1.5" />
              Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreateFolderOpen(true)}
            >
              <FolderPlus className="h-4 w-4 mr-1.5" />
              New Folder
            </Button>
            <Button onClick={() => setCreateDialogOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-1.5" />
              New Note
            </Button>
          </div>
        </div>

        {/* Search, Tag filter, and Sort */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Button
              variant={ownershipFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              className="h-9 text-xs px-2"
              onClick={() => setOwnershipFilter('all')}
            >
              All
            </Button>
            <Button
              variant={ownershipFilter === 'mine' ? 'default' : 'outline'}
              size="sm"
              className="h-9 text-xs px-2"
              onClick={() => setOwnershipFilter('mine')}
            >
              Mine
            </Button>
            <Button
              variant={ownershipFilter === 'shared' ? 'default' : 'outline'}
              size="sm"
              className="h-9 text-xs px-2"
              onClick={() => setOwnershipFilter('shared')}
            >
              Shared
            </Button>
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search notes..."
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearchSubmit();
              }}
              className="pl-9"
            />
            {searchInput && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {/* Tag filter toggle */}
          <Popover open={showTagFilter} onOpenChange={setShowTagFilter}>
            <PopoverTrigger asChild>
              <Button
                variant={tagFilter && tagFilter.length > 0 ? 'default' : 'outline'}
                size="sm"
                className="h-9 gap-1.5"
              >
                <Tag className="h-4 w-4" />
                Tags
                {tagFilter && tagFilter.length > 0 && (
                  <span className="ml-0.5 size-4 rounded-full bg-background text-foreground text-[10px] flex items-center justify-center font-medium">
                    {tagFilter.length}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="start">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">Filter by tag</p>
                  {tagFilter && tagFilter.length > 0 && (
                    <button
                      className="text-[10px] text-muted-foreground hover:text-foreground underline"
                      onClick={() => setTagFilter([])}
                    >
                      Clear
                    </button>
                  )}
                </div>
                {tags.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No tags available</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                    {tags.map((tag) => {
                      const isSelected = tagFilter?.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setTagFilter(tagFilter?.filter((id) => id !== tag.id) || []);
                            } else {
                              setTagFilter([...(tagFilter || []), tag.id]);
                            }
                          }}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-all border',
                            isSelected
                              ? 'border-foreground/20 shadow-sm'
                              : 'border-transparent opacity-60 hover:opacity-100'
                          )}
                          style={{
                            backgroundColor: isSelected ? `${tag.color}20` : `${tag.color}10`,
                            color: tag.color,
                          }}
                        >
                          <span
                            className="size-2 rounded-full shrink-0"
                            style={{ backgroundColor: tag.color }}
                          />
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="w-[180px]">
              <ArrowUpDown className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updatedAt">Last Updated</SelectItem>
              <SelectItem value="createdAt">Created</SelectItem>
              <SelectItem value="id">ID</SelectItem>
              <SelectItem value="title">Title</SelectItem>
              <SelectItem value="project">Project</SelectItem>
              <SelectItem value="folder">Folder</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Breadcrumbs */}
        {(currentFolderId || folderBreadcrumbs.length > 0) && (
          <div className="flex items-center gap-1 text-sm">
            <button
              onClick={() => handleBreadcrumbClick(null)}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Home className="h-3.5 w-3.5" />
              <span>All Notes</span>
            </button>
            {folderBreadcrumbs.map((folder) => (
              <span key={folder.id} className="flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                <button
                  onClick={() => handleBreadcrumbClick(folder.id)}
                  className={cn(
                    'transition-colors',
                    folder.id === currentFolderId
                      ? 'text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {folder.name}
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Folders & Notes Grid */}
      <div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
        {hasNoContent ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <FileText className="h-16 w-16 mb-4 opacity-20" />
            <p className="text-lg font-medium">
              {noteSearchQuery
                ? 'No notes match your search'
                : 'No notes yet. Create your first note!'}
            </p>
            <p className="text-sm mt-1">
              {noteSearchQuery
                ? 'Try adjusting your search terms'
                : 'Click the "New Note" button to get started'}
            </p>
            {!noteSearchQuery && (
              <div className="flex items-center gap-2 mt-4">
                <Button
                  variant="outline"
                  onClick={() => setCreateFolderOpen(true)}
                >
                  <FolderPlus className="h-4 w-4 mr-1.5" />
                  Create Folder
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setCreateDialogOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Create Note
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Folder cards */}
            {visibleFolders.map((folder) => {
              const itemCount = getFolderItemCount(folder);
              return (
                <Card
                  key={folder.id}
                  className="cursor-pointer hover:shadow-md transition-all duration-200 hover:border-primary/30 group overflow-hidden"
                  onClick={() => handleFolderClick(folder)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Folder className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-semibold text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                              {folder.name}
                            </h3>
                            <div className="flex items-center gap-1 mt-0.5">
                              <p className="text-xs text-muted-foreground">
                                {itemCount} item{itemCount !== 1 ? 's' : ''}
                              </p>
                              <VisibilityLock
                                value={folder.visibility}
                                visibleUserIds={folder.visibleUserIds || []}
                                onChange={() => {}}
                                ownerId={folder.ownerId}
                                currentUserId={currentUserId}
                                disabled={true}
                                size="sm"
                              />
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openRenameDialog(folder);
                                }}
                              >
                                <Pencil className="h-4 w-4 mr-2" />
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isFolderNonEmpty(folder.id)) {
                                    setDeleteFolderId(folder.id);
                                  } else {
                                    handleDeleteFolder(folder.id);
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {/* Note cards */}
            {filteredAndSortedNotes.map((note) => (
              <Card
                key={note.id}
                className="cursor-pointer hover:shadow-md transition-all duration-200 hover:border-primary/30 group overflow-hidden"
                onClick={() => handleNoteClick(note)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Color indicator */}
                    <div
                      className="h-10 w-1 rounded-full shrink-0 mt-0.5"
                      style={{
                        backgroundColor: note.project?.color ?? '#94a3b8',
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                            {note.title}
                          </h3>
                          <EntityIdBadge id={note.id} shortId={note.shortId || 'N-?'} type="note" className="mt-1" />
                          <div className="flex items-center gap-1.5 mt-1">
                            <VisibilityBadge visibility={note.visibility} visibleUserIds={note.visibleUserIds} users={users} />
                            <OwnerIndicator ownerId={note.ownerId} currentUserId={currentUserId} />
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExportSingle(note);
                          }}
                          aria-label={`Export ${note.title}`}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {note.content && (
                        <div className="mt-1.5 line-clamp-3 text-xs text-muted-foreground [&_*]:text-xs [&_h1]:text-xs [&_h2]:text-xs [&_h3]:text-xs [&_p]:m-0 [&_ul]:m-0 [&_ol]:m-0 [&_li]:m-0 [&_blockquote]:m-0 [&_pre]:m-0 [&_code]:text-[0.65rem]">
                          <MarkdownRenderer content={note.content} compact />
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-3 flex-wrap">
                        {note.tagIds && note.tagIds.length > 0 && (
                          <TagBadges tagIds={note.tagIds} max={2} size="sm" />
                        )}
                        {note.project && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 h-5 font-normal"
                          >
                            <div
                              className="h-1.5 w-1.5 rounded-full mr-1"
                              style={{ backgroundColor: note.project.color }}
                            />
                            {note.project.name}
                          </Badge>
                        )}
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Note Dialog */}
      <CreateNoteDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        defaultProjectId={selectedProjectId ?? undefined}
        defaultFolderId={currentFolderId}
      />

      {/* Create Folder Dialog */}
      <Dialog open={createFolderOpen} onOpenChange={(open) => {
        setCreateFolderOpen(open);
        if (!open) setNewFolderName('');
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Folder</DialogTitle>
            <DialogDescription>
              Create a new folder to organize your notes.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <Input
              placeholder="Folder name..."
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder();
              }}
              autoFocus
            />
          </div>
          <DialogFooter className="mt-6">
            <Button
              variant="outline"
              onClick={() => setCreateFolderOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Folder Dialog */}
      <Dialog
        open={renameFolderId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRenameFolderId(null);
            setRenameFolderName('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
            <DialogDescription>
              Enter a new name for this folder.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <Input
              placeholder="Folder name..."
              value={renameFolderName}
              onChange={(e) => setRenameFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameFolder();
              }}
              autoFocus
            />
          </div>
          <DialogFooter className="mt-6">
            <Button
              variant="outline"
              onClick={() => {
                setRenameFolderId(null);
                setRenameFolderName('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRenameFolder}
              disabled={!renameFolderName.trim()}
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Folder Confirmation */}
      <AlertDialog
        open={deleteFolderId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteFolderId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Folder</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this folder?
              {deleteFolderId && isFolderNonEmpty(deleteFolderId) && (
                <span className="block mt-2 font-bold text-destructive">
                  ALL NOTES AND SUBFOLDERS INSIDE WILL BE DELETED.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteFolderId(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => handleDeleteFolder()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
