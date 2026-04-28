'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '@/store/app-store';
import type { Note } from '@/lib/types';
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
import { CreateNoteDialog } from '@/components/create-note-dialog';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { TagBadges } from '@/components/tag-badges';
import { EntityIdBadge } from '@/components/entity-id-badge';
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
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

type SortOption = 'updatedAt' | 'title' | 'project';

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
    createNote,
  } = useAppStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('updatedAt');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [showTagFilter, setShowTagFilter] = useState(false);

  useEffect(() => {
    fetchNotes(selectedProjectId ?? undefined);
  }, [fetchNotes, selectedProjectId]);

  const filteredProject = useMemo(() => {
    if (!selectedProjectId) return null;
    return projects.find((p) => p.id === selectedProjectId) ?? null;
  }, [projects, selectedProjectId]);

  const filteredAndSortedNotes = useMemo(() => {
    let result = [...notes];

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (note) =>
          note.title.toLowerCase().includes(query) ||
          note.content.toLowerCase().includes(query)
      );
    }

    // Filter by tag
    if (tagFilter && tagFilter.length > 0) {
      result = result.filter((note) =>
        tagFilter.some((tagId) => (note.tagIds || []).includes(tagId))
      );
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'updatedAt':
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        case 'title':
          return a.title.localeCompare(b.title);
        case 'project': {
          const aProject = a.project?.name ?? 'zzz';
          const bProject = b.project?.name ?? 'zzz';
          return aProject.localeCompare(bProject);
        }
        default:
          return 0;
      }
    });

    return result;
  }, [notes, searchQuery, sortBy, tagFilter]);

  const handleNoteClick = (note: Note) => {
    selectNote(note.id);
    setCurrentView('note-editor');
  };

  const handleClearFilter = () => {
    selectProject(null);
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
        await createNote({ title, content, projectId: selectedProjectId || null });
        imported++;
      }
      fetchNotes(selectedProjectId ?? undefined);
      toast.success(`Imported ${imported} note${imported !== 1 ? 's' : ''}`);
    };
    input.click();
  };

  if (isLoading && notes.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-muted-foreground">Loading notes...</div>
      </div>
    );
  }

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
            <Button onClick={() => setCreateDialogOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-1.5" />
              New Note
            </Button>
          </div>
        </div>

        {/* Search, Tag filter, and Sort */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
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
            <SelectTrigger className="w-[160px]">
              <ArrowUpDown className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updatedAt">Last Updated</SelectItem>
              <SelectItem value="title">Title</SelectItem>
              <SelectItem value="project">Project</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Notes Grid */}
      <div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
        {filteredAndSortedNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <FileText className="h-16 w-16 mb-4 opacity-20" />
            <p className="text-lg font-medium">
              {searchQuery
                ? 'No notes match your search'
                : 'No notes yet. Create your first note!'}
            </p>
            <p className="text-sm mt-1">
              {searchQuery
                ? 'Try adjusting your search terms'
                : 'Click the "New Note" button to get started'}
            </p>
            {!searchQuery && (
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setCreateDialogOpen(true)}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Create Note
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                          <EntityIdBadge id={note.id} type="note" className="mt-1" />
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
      />
    </div>
  );
}
