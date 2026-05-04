'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Check, X, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
import { useAppStore } from '@/store/app-store';
import { DEFAULT_COLORS } from '@/lib/constants';
import { toast } from 'sonner';
import type { Tag } from '@/lib/types';

const basePath = process.env.NEXT_BASE_PATH || '';

interface TagChipProps {
  tag: Tag;
  usage: number;
  onRename: (id: string, name: string) => Promise<void>;
  onColorChange: (id: string, color: string) => Promise<void>;
  onDelete: (tag: Tag) => void;
}

function TagChip({ tag, usage, onRename, onColorChange, onDelete }: TagChipProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(tag.name);
  const [saving, setSaving] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setEditName(tag.name);
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [editing, tag.name]);

  const handleSave = useCallback(async () => {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === tag.name) {
      setEditing(false);
      setEditName(tag.name);
      return;
    }
    setSaving(true);
    try {
      await onRename(tag.id, trimmed);
      setEditing(false);
    } catch {
      setEditName(tag.name);
    } finally {
      setSaving(false);
    }
  }, [editName, tag.id, tag.name, onRename]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') {
      setEditName(tag.name);
      setEditing(false);
    }
  }, [handleSave, tag.name]);

  return (
    <div className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors group">
      <Popover open={colorOpen} onOpenChange={setColorOpen}>
        <PopoverTrigger asChild>
          <button
            className="w-2.5 h-2.5 rounded-full shrink-0 hover:scale-125 transition-transform"
            style={{ backgroundColor: tag.color }}
            title="Change color"
          />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="flex gap-1 flex-wrap max-w-[184px]">
            {DEFAULT_COLORS.map((color) => (
              <button
                key={color}
                className={cn(
                  'w-5 h-5 rounded-full border-2 hover:scale-110 transition-transform',
                  tag.color === color ? 'border-foreground' : 'border-transparent',
                )}
                style={{ backgroundColor: color }}
                onClick={() => {
                  onColorChange(tag.id, color);
                  setColorOpen(false);
                }}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {editing ? (
        <div className="flex items-center gap-0.5">
          <Input
            ref={inputRef}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            className="h-5 text-xs border-0 p-0 w-24 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
            disabled={saving}
            autoFocus
          />
          <button
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={handleSave}
            disabled={saving}
          >
            <Check className="size-3" />
          </button>
        </div>
      ) : (
        <button
          className="truncate max-w-[140px] hover:underline cursor-text"
          onClick={() => setEditing(true)}
          title="Click to rename"
        >
          {tag.name}
        </button>
      )}

      {usage > 0 && (
        <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
          ×{usage}
        </span>
      )}

      <button
        className="shrink-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => onDelete(tag)}
        title="Delete tag"
      >
        <Trash2 className="size-3" />
      </button>
    </div>
  );
}

export function TagsManagementSection() {
  const { tags, createTag, updateTag, deleteTag } = useAppStore();
  const [tagUsage, setTagUsage] = useState<Record<string, number>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(DEFAULT_COLORS[0]);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Tag | null>(null);

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch(`${basePath}/api/tags/usage`);
      if (res.ok) {
        const data: Record<string, number> = await res.json();
        setTagUsage(data);
      }
    } catch (error) {
      console.error('Failed to fetch tag usage:', error);
    }
  }, []);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  const handleCreate = useCallback(async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      await createTag({ name: trimmed, color: newColor });
      setNewName('');
      setNewColor(DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)]);
      setAddOpen(false);
      await fetchUsage();
      toast.success('Tag created');
    } catch {
      toast.error('Failed to create tag');
    } finally {
      setCreating(false);
    }
  }, [newName, newColor, createTag, fetchUsage]);

  const handleRename = useCallback(async (id: string, name: string) => {
    try {
      await updateTag(id, { name });
      toast.success('Tag renamed');
    } catch {
      toast.error('A tag with this name already exists');
      throw new Error('duplicate');
    }
  }, [updateTag]);

  const handleColorChange = useCallback(async (id: string, color: string) => {
    try {
      await updateTag(id, { color });
    } catch {
      toast.error('Failed to update tag color');
    }
  }, [updateTag]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteTag(deleteTarget.id);
      setDeleteTarget(null);
      await fetchUsage();
      toast.success('Tag deleted');
    } catch {
      toast.error('Failed to delete tag');
    }
  }, [deleteTarget, deleteTag, fetchUsage]);

  const isDuplicate = newName.trim().length > 0 && tags.some(
    (t) => t.name.toLowerCase() === newName.trim().toLowerCase(),
  );

  const deleteUsage = deleteTarget ? tagUsage[deleteTarget.id] ?? 0 : 0;

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Label>Tags</Label>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <TagChip
              key={tag.id}
              tag={tag}
              usage={tagUsage[tag.id] ?? 0}
              onRename={handleRename}
              onColorChange={handleColorChange}
              onDelete={setDeleteTarget}
            />
          ))}
          {tags.length === 0 && (
            <span className="text-xs text-muted-foreground">No tags yet.</span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Popover open={addOpen} onOpenChange={setAddOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-6 text-[11px] px-2">
                <Plus className="size-3 mr-1" /> Add
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3 space-y-2" align="start">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Tag name"
                className="h-8 text-sm"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              />
              <div className="flex gap-1 flex-wrap">
                {DEFAULT_COLORS.map((color) => (
                  <button
                    key={color}
                    className={cn(
                      'w-5 h-5 rounded-full border-2 hover:scale-110 transition-transform',
                      newColor === color ? 'border-foreground' : 'border-transparent',
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewColor(color)}
                  />
                ))}
              </div>
              {isDuplicate && (
                <p className="text-[10px] text-destructive">A tag with this name already exists</p>
              )}
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleCreate}
                  disabled={newName.trim().length === 0 || isDuplicate || creating}
                >
                  {creating ? 'Creating...' : 'Create'}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tag</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the &quot;{deleteTarget?.name}&quot; tag?
              {deleteUsage > 0
                ? ` It will be removed from ${deleteUsage} ${deleteUsage === 1 ? 'entity' : 'entities'}.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
