'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAppStore } from '@/store/app-store';
import { TASK_STATUSES, TASK_PRIORITIES, STATUS_LABELS, PRIORITY_LABELS } from '@/lib/constants';
import { TagPicker } from '@/components/tag-picker';

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultStatus?: string;
  defaultProjectId?: string;
  parentId?: string;
}

export function CreateTaskDialog({
  open,
  onOpenChange,
  defaultStatus,
  defaultProjectId,
  parentId,
}: CreateTaskDialogProps) {
  const { createTask, projects, tasks, selectedProjectId } = useAppStore();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<string>(defaultStatus || 'todo');
  const [priority, setPriority] = useState<string>('medium');
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [projectId, setProjectId] = useState<string>(defaultProjectId || selectedProjectId || 'none');
  const [parentTaskId, setParentTaskId] = useState<string>(parentId || 'none');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setTitle('');
      setDescription('');
      setStatus(defaultStatus || 'todo');
      setPriority('medium');
      setDueDate(undefined);
      setProjectId(defaultProjectId || selectedProjectId || 'none');
      setParentTaskId(parentId || 'none');
      setTagIds([]);
      setIsCreating(false);
    }
  }, [open, defaultStatus, defaultProjectId, selectedProjectId, parentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setIsCreating(true);

    try {
      await createTask({
        title: title.trim(),
        description: description.trim() || null,
        status,
        priority,
        dueDate: dueDate ? dueDate.toISOString() : null,
        projectId: projectId === 'none' ? null : projectId,
        parentId: parentTaskId === 'none' ? null : parentTaskId,
        tagIds,
      });
      onOpenChange(false);
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setTitle('');
      setDescription('');
      setStatus(defaultStatus || 'todo');
      setPriority('medium');
      setDueDate(undefined);
      setProjectId(defaultProjectId || selectedProjectId || 'none');
      setParentTaskId(parentId || 'none');
      setTagIds([]);
    }
    onOpenChange(newOpen);
  };

  // Filter tasks that could be parent tasks (top-level only)
  const topLevelTasks = tasks.filter((t) => !t.parentId);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{parentId ? 'Create Subtask' : 'Create Task'}</DialogTitle>
            <DialogDescription>
              Add a new task to your workflow.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="task-title">Title *</Label>
              <Input
                id="task-title"
                placeholder="Task title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="task-desc">Description</Label>
              <Textarea
                id="task-desc"
                placeholder="What needs to be done?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PRIORITY_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Due Date</Label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !dueDate && 'text-muted-foreground',
                    )}
                  >
                    <CalendarIcon className="mr-2 size-4" />
                    {dueDate ? format(dueDate, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    onSelect={(date) => {
                      setDueDate(date);
                      setCalendarOpen(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {!parentId && (
              <div className="flex flex-col gap-2">
                <Label>Project</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No project</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label>Tags</Label>
              <TagPicker selectedTagIds={tagIds} onTagIdsChange={setTagIds} />
            </div>

            {!parentId && (
              <div className="flex flex-col gap-2">
                <Label>Parent Task</Label>
                <Select value={parentTaskId} onValueChange={setParentTaskId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="No parent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No parent</SelectItem>
                    {topLevelTasks.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="line-clamp-1">{t.title}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim() || isCreating}>
              {isCreating ? 'Creating...' : 'Create Task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
