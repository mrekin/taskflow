'use client';

import { useState, useRef, useCallback } from 'react';
import { Zap, Layers, FolderOpen, StickyNote, CheckSquare, X, Tag, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useAppStore } from '@/store/app-store';
import { getRandomColor } from '@/lib/constants';
import { toast } from '@/hooks/use-toast';

export function QuickCreate() {
  const { createArea, createProject, createTask, createNote, areas, projects, tags } = useAppStore();

  const [inputText, setInputText] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('none');
  const [selectedAreaId, setSelectedAreaId] = useState<string>('none');
  const [noteProjectId, setNoteProjectId] = useState<string>('none');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);

  // Flash animation state per button type
  const [flashType, setFlashType] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Parse input: first line = title, rest = description
  const parsed = useCallback(() => {
    const lines = inputText.split('\n');
    const title = lines[0]?.trim() || '';
    const description = lines.slice(1).join('\n').trim() || null;
    return { title, description };
  }, [inputText]);

  const hasTitle = parsed().title.length > 0;

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const handleClearInput = () => {
    setInputText('');
    textareaRef.current?.focus();
  };

  const flash = (type: string) => {
    setFlashType(type);
    setTimeout(() => setFlashType(null), 600);
  };

  const handleCreateTask = async () => {
    const { title, description } = parsed();
    if (!title || isCreating) return;
    setIsCreating(true);
    try {
      await createTask({
        title,
        description,
        projectId: selectedProjectId === 'none' ? null : selectedProjectId,
        tagIds: selectedTagIds,
        status: 'todo',
        priority: 'medium',
      });
      toast({ title: 'Task created', description: `"${title}" has been added.` });
      flash('task');
      resetForm();
    } catch {
      toast({ title: 'Error', description: 'Failed to create task.', variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateArea = async () => {
    const { title, description } = parsed();
    if (!title || isCreating) return;
    setIsCreating(true);
    try {
      await createArea({
        name: title,
        description,
        color: getRandomColor(),
        tagIds: selectedTagIds,
      });
      toast({ title: 'Area created', description: `"${title}" has been added.` });
      flash('area');
      resetForm();
    } catch {
      toast({ title: 'Error', description: 'Failed to create area.', variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateProject = async () => {
    const { title, description } = parsed();
    if (!title || isCreating) return;
    setIsCreating(true);
    try {
      await createProject({
        name: title,
        description,
        areaId: selectedAreaId === 'none' ? null : selectedAreaId,
        color: getRandomColor(),
        tagIds: selectedTagIds,
      });
      toast({ title: 'Project created', description: `"${title}" has been added.` });
      flash('project');
      resetForm();
    } catch {
      toast({ title: 'Error', description: 'Failed to create project.', variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateNote = async () => {
    const { title, description } = parsed();
    if (!title || isCreating) return;
    setIsCreating(true);
    try {
      await createNote({
        title,
        content: description || '',
        projectId: noteProjectId === 'none' ? null : noteProjectId,
        tagIds: selectedTagIds,
      });
      toast({ title: 'Note created', description: `"${title}" has been added.` });
      flash('note');
      resetForm();
    } catch {
      toast({ title: 'Error', description: 'Failed to create note.', variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setInputText('');
    setSelectedTagIds([]);
    setSelectedProjectId('none');
    setSelectedAreaId('none');
    setNoteProjectId('none');
    textareaRef.current?.focus();
  };

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Zap className="size-5 text-amber-500" />
        <h2 className="text-lg font-semibold">Quick Create</h2>
      </div>

      {/* Main textarea */}
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type to create... First line = title, rest = description"
          className={cn(
            'min-h-32 resize-y text-base leading-relaxed pr-10',
            'border-2 border-dashed border-muted-foreground/25 hover:border-muted-foreground/40',
            'focus-visible:border-solid focus-visible:border-primary/60',
            'transition-colors duration-200'
          )}
          autoFocus
        />
        {inputText && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 size-7 text-muted-foreground hover:text-foreground"
            onClick={handleClearInput}
          >
            <X className="size-4" />
            <span className="sr-only">Clear input</span>
          </Button>
        )}
      </div>

      {/* Context selectors row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Project selector for Tasks */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground whitespace-nowrap hidden md:inline">Task →</span>
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger size="sm" className="h-9 md:h-7 text-xs gap-1">
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No project</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="line-clamp-1">{p.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Area selector for Projects */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground whitespace-nowrap hidden md:inline">Project →</span>
          <Select value={selectedAreaId} onValueChange={setSelectedAreaId}>
            <SelectTrigger size="sm" className="h-9 md:h-7 text-xs gap-1">
              <SelectValue placeholder="Area" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No area</SelectItem>
              {areas.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  <span className="line-clamp-1">{a.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Project selector for Notes */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground whitespace-nowrap hidden md:inline">Note →</span>
          <Select value={noteProjectId} onValueChange={setNoteProjectId}>
            <SelectTrigger size="sm" className="h-9 md:h-7 text-xs gap-1">
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No project</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="line-clamp-1">{p.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tag selector */}
        <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
            >
              <Tag className="size-3" />
              Tags
              {selectedTagIds.length > 0 && (
                <span className="ml-0.5 size-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-medium">
                  {selectedTagIds.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="start">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Select tags</p>
              {tags.length === 0 ? (
                <p className="text-xs text-muted-foreground">No tags available</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                  {tags.map((tag) => {
                    const isSelected = selectedTagIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleTag(tag.id)}
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
                        {isSelected && <X className="size-3 ml-0.5" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Selected tags display */}
      {selectedTagIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Selected:</span>
          {selectedTagIds.map((tagId) => {
            const tag = tags.find((t) => t.id === tagId);
            if (!tag) return null;
            return (
              <Badge
                key={tag.id}
                variant="secondary"
                className="gap-1 text-xs pr-1"
                style={{
                  backgroundColor: `${tag.color}15`,
                  color: tag.color,
                  borderColor: `${tag.color}30`,
                }}
              >
                {tag.name}
                <button
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  className="rounded-full hover:bg-foreground/10 p-0.5"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            );
          })}
          <button
            type="button"
            onClick={() => setSelectedTagIds([])}
            className="text-xs text-muted-foreground hover:text-foreground ml-1 underline underline-offset-2"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Action buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Create Task */}
        <Button
          variant="outline"
          className={cn(
            'h-auto flex-col gap-2 py-4 transition-all duration-300',
            flashType === 'task' && 'bg-green-500/10 border-green-500/50 scale-[0.97]',
            !hasTitle && 'opacity-50'
          )}
          onClick={handleCreateTask}
          disabled={!hasTitle || isCreating}
        >
          {isCreating ? (
            <Loader2 className="size-5 animate-spin text-emerald-500" />
          ) : (
            <CheckSquare className="size-5 text-emerald-500" />
          )}
          <span className="text-sm font-medium">Create Task</span>
        </Button>

        {/* Create Area */}
        <Button
          variant="outline"
          className={cn(
            'h-auto flex-col gap-2 py-4 transition-all duration-300',
            flashType === 'area' && 'bg-purple-500/10 border-purple-500/50 scale-[0.97]',
            !hasTitle && 'opacity-50'
          )}
          onClick={handleCreateArea}
          disabled={!hasTitle || isCreating}
        >
          {isCreating ? (
            <Loader2 className="size-5 animate-spin text-purple-500" />
          ) : (
            <Layers className="size-5 text-purple-500" />
          )}
          <span className="text-sm font-medium">Create Area</span>
        </Button>

        {/* Create Project */}
        <Button
          variant="outline"
          className={cn(
            'h-auto flex-col gap-2 py-4 transition-all duration-300',
            flashType === 'project' && 'bg-amber-500/10 border-amber-500/50 scale-[0.97]',
            !hasTitle && 'opacity-50'
          )}
          onClick={handleCreateProject}
          disabled={!hasTitle || isCreating}
        >
          {isCreating ? (
            <Loader2 className="size-5 animate-spin text-amber-500" />
          ) : (
            <FolderOpen className="size-5 text-amber-500" />
          )}
          <span className="text-sm font-medium">Create Project</span>
        </Button>

        {/* Create Note */}
        <Button
          variant="outline"
          className={cn(
            'h-auto flex-col gap-2 py-4 transition-all duration-300',
            flashType === 'note' && 'bg-sky-500/10 border-sky-500/50 scale-[0.97]',
            !hasTitle && 'opacity-50'
          )}
          onClick={handleCreateNote}
          disabled={!hasTitle || isCreating}
        >
          {isCreating ? (
            <Loader2 className="size-5 animate-spin text-sky-500" />
          ) : (
            <StickyNote className="size-5 text-sky-500" />
          )}
          <span className="text-sm font-medium">Create Note</span>
        </Button>
      </div>

      {/* Hint */}
      <p className="text-xs text-muted-foreground text-center mt-2">
        Type a title on the first line, add description below, then pick an entity type to create.
      </p>
    </div>
  );
}
