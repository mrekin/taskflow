'use client';

import { useState, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Trash2, Eye, EyeOff, RotateCcw, X, ListChecks } from 'lucide-react';

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
import { DEFAULT_COLORS, type StatusConfig, slugifyLabel } from '@/lib/constants';

interface StatusChipProps {
  column: StatusConfig;
  onToggleVisible: (id: string) => void;
  onDelete: (id: string) => void;
}

function StatusChip({ column, onToggleVisible, onDelete }: StatusChipProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id });

  const style = transform
    ? { transform: CSS.Transform.toString(transform), transition }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors group',
        isDragging && 'opacity-50 shadow-lg z-50',
        !column.visible && 'opacity-50 line-through',
      )}
    >
      <button
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3" />
      </button>
      <span
        className="w-2.5 h-2.5 rounded-full shrink-0"
        style={{ backgroundColor: column.color }}
      />
      <span className="truncate max-w-[120px]">{column.label}</span>
      <button
        className="shrink-0 text-muted-foreground hover:text-foreground"
        onClick={() => onToggleVisible(column.id)}
        title={column.visible ? 'Hide' : 'Show'}
      >
        {column.visible ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
      </button>
      <button
        className="shrink-0 text-muted-foreground hover:text-destructive"
        onClick={() => onDelete(column.id)}
        title="Delete"
      >
        <Trash2 className="size-3" />
      </button>
    </div>
  );
}

export function StatusColumnsSettings() {
  const {
    statuses,
    userPreferences,
    updateCustomStatuses,
    resetCustomStatuses,
  } = useAppStore();

  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState(DEFAULT_COLORS[0]);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const hasUserOverrides = userPreferences.customStatuses !== null && userPreferences.customStatuses.length > 0;

  const currentColumns = hasUserOverrides
    ? userPreferences.customStatuses!
    : statuses;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = currentColumns.findIndex((c) => c.id === active.id);
    const newIndex = currentColumns.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const updated = [...currentColumns];
    const [moved] = updated.splice(oldIndex, 1);
    updated.splice(newIndex, 0, moved);

    updateCustomStatuses(updated);
  }, [currentColumns, updateCustomStatuses]);

  const handleToggleVisible = useCallback((id: string) => {
    const updated = currentColumns.map((c) =>
      c.id === id ? { ...c, visible: !c.visible } : c
    );
    updateCustomStatuses(updated);
  }, [currentColumns, updateCustomStatuses]);

  const handleDelete = useCallback(() => {
    if (!deleteTarget) return;
    const updated = currentColumns.filter((c) => c.id !== deleteTarget);
    updateCustomStatuses(updated);
    setDeleteTarget(null);
  }, [deleteTarget, currentColumns, updateCustomStatuses]);

  const handleAdd = useCallback(() => {
    const label = newLabel.trim();
    if (!label) return;
    const id = slugifyLabel(label);
    if (currentColumns.some((c) => c.id === id)) return;

    updateCustomStatuses([...currentColumns, { id, label, color: newColor, visible: true }]);
    setNewLabel('');
    setNewColor(DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)]);
    setAddOpen(false);
  }, [newLabel, newColor, currentColumns, updateCustomStatuses]);

  const handleResetUser = useCallback(() => {
    resetCustomStatuses();
  }, [resetCustomStatuses]);

  const deleteTargetColumn = deleteTarget ? currentColumns.find((c) => c.id === deleteTarget) : null;
  const isDuplicate = newLabel.trim() && currentColumns.some((c) => c.id === slugifyLabel(newLabel.trim()));

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
            <Label>Statuses</Label>
          </div>
          {hasUserOverrides && (
            <Button variant="ghost" size="sm" className="h-6 text-[11px] px-1.5" onClick={handleResetUser}>
              <RotateCcw className="size-3 mr-1" /> Reset
            </Button>
          )}
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={currentColumns.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
            <div className="flex flex-wrap gap-1.5">
              {currentColumns.map((col) => (
                <StatusChip
                  key={col.id}
                  column={col}
                  onToggleVisible={handleToggleVisible}
                  onDelete={setDeleteTarget}
                />
              ))}
              {currentColumns.length === 0 && (
                <span className="text-xs text-muted-foreground">No statuses configured.</span>
              )}
            </div>
          </SortableContext>
        </DndContext>

        <div className="flex items-center gap-1.5">
          <Popover open={addOpen} onOpenChange={setAddOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-6 text-[11px] px-2">
                <Plus className="size-3 mr-1" /> Add
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3 space-y-2" align="start">
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Status name"
                className="h-8 text-sm"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              />
              <div className="flex gap-1 flex-wrap">
                {DEFAULT_COLORS.slice(0, 10).map((color) => (
                  <button
                    key={color}
                    className={cn(
                      'w-4 h-4 rounded-full border-2 hover:scale-110 transition-transform',
                      newColor === color ? 'border-foreground' : 'border-transparent',
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewColor(color)}
                  />
                ))}
              </div>
              {newLabel.trim() && (
                <p className="text-[10px] text-muted-foreground break-all overflow-hidden">
                  id: <span className="font-mono">{slugifyLabel(newLabel.trim())}</span>
                </p>
              )}
              {isDuplicate && (
                <p className="text-[10px] text-destructive">Already exists</p>
              )}
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleAdd}
                  disabled={!newLabel.trim() || isDuplicate}
                >
                  Add
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Status</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the &quot;{deleteTargetColumn?.label}&quot; status?
              Tasks with this status will appear in the &quot;Invalid state&quot; column on the Kanban board until they are moved to a valid status.
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
