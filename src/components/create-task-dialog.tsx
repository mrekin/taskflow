'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import {
  CalendarIcon,
  Check,
  ChevronsUpDown,
  Plus,
  Trash2,
  Webhook as WebhookIcon,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

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
import { TimePicker } from '@/components/ui/time-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/store/app-store';
import {
  TASK_PRIORITIES,
  PRIORITY_LABELS,
  getColumnLabelAndColor,
  type StatusConfig,
} from '@/lib/constants';
import { TagPicker } from '@/components/tag-picker';
import { UserPicker } from '@/components/user-picker';
import { toast } from 'sonner';

const TASK_WEBHOOK_EVENTS = [
  { value: 'task.status_changed', label: 'Status Changed' },
  { value: 'task.priority_changed', label: 'Priority Changed' },
  { value: 'task.due_date_reached', label: 'Due Date Reached' },
  { value: 'task.created', label: 'Task Created' },
] as const;

interface WebhookBinding {
  webhookId: string;
  events: string[];
}

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultStatus?: string;
  defaultProjectId?: string;
  parentId?: string;
  defaultTitle?: string;
  defaultDescription?: string;
  defaultParentId?: string;
}

export function CreateTaskDialog({
  open,
  onOpenChange,
  defaultStatus,
  defaultProjectId,
  parentId,
  defaultTitle,
  defaultDescription,
  defaultParentId,
}: CreateTaskDialogProps) {
  const { createTask, projects, tasks, selectedProjectId, statuses, webhooks, fetchWebhooks, createWebhookTrigger } = useAppStore();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<string>(defaultStatus || 'todo');
  const [priority, setPriority] = useState<string>('medium');
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [dueTime, setDueTime] = useState('09:00');
  const [projectId, setProjectId] = useState<string>(defaultProjectId || selectedProjectId || 'none');
  const [parentTaskId, setParentTaskId] = useState<string>(parentId || defaultParentId || 'none');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [parentTaskOpen, setParentTaskOpen] = useState(false);

  const [webhookBindings, setWebhookBindings] = useState<WebhookBinding[]>([]);
  const [webhooksExpanded, setWebhooksExpanded] = useState(false);

  useEffect(() => {
    if (open) fetchWebhooks();
  }, [open, fetchWebhooks]);

  useEffect(() => {
    if (open) {
      setTitle(defaultTitle || '');
      setDescription(defaultDescription || '');
      setStatus(defaultStatus || 'todo');
      setPriority('medium');
      setDueDate(undefined);
      setDueTime('09:00');
      setProjectId(defaultProjectId || selectedProjectId || 'none');
      setParentTaskId(parentId || defaultParentId || 'none');
      setTagIds([]);
      setAssigneeId(null);
      setIsCreating(false);
      setWebhookBindings([]);
      setWebhooksExpanded(false);
    }
  }, [open, defaultStatus, defaultProjectId, selectedProjectId, parentId, defaultTitle, defaultDescription, defaultParentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setIsCreating(true);

    try {
      const newTask = await createTask({
        title: title.trim(),
        description: description.trim() || null,
        status,
        priority,
        dueDate: dueDate
          ? (() => {
              const [h, m] = dueTime.split(':').map(Number);
              const d = new Date(dueDate);
              d.setHours(h, m, 0, 0);
              return d.toISOString();
            })()
          : null,
        projectId: projectId === 'none' ? null : projectId,
        parentId: parentTaskId === 'none' ? null : parentTaskId,
        tagIds,
        assigneeId,
      });

      if (newTask && webhookBindings.length > 0) {
        for (const binding of webhookBindings) {
          try {
            await createWebhookTrigger({
              webhookId: binding.webhookId,
              events: binding.events,
              scopeType: 'task',
              scopeId: newTask.id,
            });
          } catch {
            const sourceWebhook = webhooks.find((w) => w.id === binding.webhookId);
            toast.error(`Failed to create trigger for "${sourceWebhook?.name ?? 'webhook'}"`);
          }
        }
      }

      onOpenChange(false);
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setTitle(defaultTitle || '');
      setDescription(defaultDescription || '');
      setStatus(defaultStatus || 'todo');
      setPriority('medium');
      setDueDate(undefined);
      setDueTime('09:00');
      setProjectId(defaultProjectId || selectedProjectId || 'none');
      setParentTaskId(parentId || defaultParentId || 'none');
      setTagIds([]);
      setAssigneeId(null);
      setWebhookBindings([]);
      setWebhooksExpanded(false);
    }
    onOpenChange(newOpen);
  };

  const topLevelTasks = tasks.filter((t) => !t.parentId);

  const addWebhookBinding = () => {
    if (webhooks.length === 0) return;
    setWebhookBindings((prev) => [
      ...prev,
      { webhookId: webhooks[0].id, events: ['task.status_changed'] },
    ]);
  };

  const removeWebhookBinding = (index: number) => {
    setWebhookBindings((prev) => prev.filter((_, i) => i !== index));
  };

  const updateBindingWebhook = (index: number, webhookId: string) => {
    setWebhookBindings((prev) =>
      prev.map((b, i) => (i === index ? { ...b, webhookId } : b)),
    );
  };

  const toggleBindingEvent = (index: number, eventValue: string) => {
    setWebhookBindings((prev) =>
      prev.map((b, i) => {
        if (i !== index) return b;
        const events = b.events.includes(eventValue)
          ? b.events.filter((e) => e !== eventValue)
          : [...b.events, eventValue];
        return { ...b, events };
      }),
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{parentId ? 'Create Subtask' : 'Create Task'}</DialogTitle>
            <DialogDescription>Add a new task to your workflow.</DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-3 overflow-x-hidden">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                Title *
              </Label>
              <Input
                placeholder="Task title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                Description
              </Label>
              <Textarea
                placeholder="What needs to be done?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                  Status
                </Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statuses.map((col: StatusConfig) => (
                      <SelectItem key={col.id} value={col.id}>
                        {col.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                  Priority
                </Label>
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
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                  Due Date
                </Label>
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
                      <CalendarIcon className="mr-1.5 size-3.5" />
                      {dueDate ? format(dueDate, 'PP') : 'Pick date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dueDate}
                      onSelect={(date) => {
                        if (date) {
                          const [h, m] = dueTime.split(':').map(Number);
                          date.setHours(h, m, 0, 0);
                        }
                        setDueDate(date ?? undefined);
                        setCalendarOpen(false);
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {dueDate && (
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                  Due Time
                </Label>
                <TimePicker value={dueTime} onChange={setDueTime} />
              </div>
            )}

            {!parentId && (
              <div className="grid grid-cols-[1fr_2fr] gap-3">
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                    Project
                  </Label>
                  <Select value={projectId} onValueChange={setProjectId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select..." />
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
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                    Tags
                  </Label>
                  <TagPicker selectedTagIds={tagIds} onTagIdsChange={setTagIds} />
                </div>
              </div>
            )}

            {parentId && (
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                  Tags
                </Label>
                <TagPicker selectedTagIds={tagIds} onTagIdsChange={setTagIds} />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                Assignee
              </Label>
              <UserPicker
                assigneeId={assigneeId}
                assignee={null}
                onAssigneeChange={setAssigneeId}
              />
            </div>

            {!parentId && (
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                  Parent Task
                </Label>
                <Popover open={parentTaskOpen} onOpenChange={setParentTaskOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={parentTaskOpen}
                      className="w-full justify-between font-normal"
                    >
                      {parentTaskId !== 'none'
                        ? (() => {
                            const t = topLevelTasks.find((task) => task.id === parentTaskId);
                            return t ? (
                              <span className="truncate">
                                <span className="text-muted-foreground mr-1">{t.shortId}</span>
                                {t.title}
                              </span>
                            ) : (
                              'Select task...'
                            );
                          })()
                        : 'No parent'}
                      <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[--radix-popover-trigger-width] p-0"
                    align="start"
                    onOpenAutoFocus={(e) => e.preventDefault()}
                  >
                    <Command>
                      <CommandInput placeholder="Search by ID or title..." />
                      <CommandList onWheel={(e) => e.stopPropagation()}>
                        <CommandEmpty>No tasks found.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="none"
                            onSelect={() => {
                              setParentTaskId('none');
                              setParentTaskOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 size-4',
                                parentTaskId === 'none' ? 'opacity-100' : 'opacity-0',
                              )}
                            />
                            No parent
                          </CommandItem>
                          {topLevelTasks.map((t) => (
                            <CommandItem
                              key={t.id}
                              value={`${t.shortId} ${t.title}`}
                              onSelect={() => {
                                setParentTaskId(t.id);
                                setParentTaskOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  'mr-2 size-4 shrink-0',
                                  parentTaskId === t.id ? 'opacity-100' : 'opacity-0',
                                )}
                              />
                              <span className="text-muted-foreground mr-1 shrink-0">
                                {t.shortId}
                              </span>
                              <span className="truncate">{t.title}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            <Separator />

            <div className="space-y-2">
              <button
                type="button"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setWebhooksExpanded(!webhooksExpanded)}
              >
                {webhooksExpanded ? (
                  <ChevronDown className="size-3.5" />
                ) : (
                  <ChevronRight className="size-3.5" />
                )}
                <WebhookIcon className="size-3.5" />
                <span className="uppercase tracking-wider font-medium">
                  Webhooks
                </span>
                {webhookBindings.length > 0 && (
                  <span className="ml-1 rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px]">
                    {webhookBindings.length}
                  </span>
                )}
              </button>

              {webhooksExpanded && (
                <div className="space-y-2 pl-1">
                  {webhookBindings.map((binding, idx) => {
                    const sourceWebhook = webhooks.find(
                      (w) => w.id === binding.webhookId,
                    );
                    return (
                      <div
                        key={idx}
                        className="rounded-lg border p-2.5 space-y-2 overflow-hidden min-w-0"
                      >
                        <div className="flex items-center gap-2">
                          <Select
                            value={binding.webhookId}
                            onValueChange={(val) => updateBindingWebhook(idx, val)}
                          >
                            <SelectTrigger className="flex-1 h-8 text-xs">
                              <SelectValue placeholder="Select webhook" />
                            </SelectTrigger>
                            <SelectContent>
                              {webhooks.map((w) => (
                                <SelectItem key={w.id} value={w.id}>
                                  <div className="flex flex-col">
                                    <span className="flex items-center gap-1.5">
                                      <span className="font-mono text-[10px] text-muted-foreground">
                                        {w.method}
                                      </span>
                                      {w.name}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[280px]">
                                      {w.url}
                                    </span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => removeWebhookBinding(idx)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>

                        {sourceWebhook && (
                          <p className="text-[10px] text-muted-foreground font-mono break-all leading-tight px-0.5">
                            {sourceWebhook.url}
                          </p>
                        )}

                        <div className="flex flex-wrap gap-1">
                          {TASK_WEBHOOK_EVENTS.map((event) => (
                            <button
                              key={event.value}
                              type="button"
                              className={cn(
                                'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] border transition-colors',
                                binding.events.includes(event.value)
                                  ? 'border-primary/40 bg-primary/5 text-foreground'
                                  : 'border-border text-muted-foreground hover:border-primary/20',
                              )}
                              onClick={() => toggleBindingEvent(idx, event.value)}
                            >
                              <span
                                className={cn(
                                  'size-2.5 rounded-sm border flex items-center justify-center shrink-0',
                                  binding.events.includes(event.value)
                                    ? 'border-primary bg-primary'
                                    : 'border-muted-foreground/30',
                                )}
                              >
                                {binding.events.includes(event.value) && (
                                  <Check className="size-2 text-primary-foreground" />
                                )}
                              </span>
                              {event.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full h-8 text-xs"
                    onClick={addWebhookBinding}
                    disabled={webhooks.length === 0}
                  >
                    <Plus className="size-3 mr-1" />
                    {webhooks.length === 0 ? 'No webhooks available' : 'Add Webhook'}
                  </Button>

                  {webhooks.length === 0 && (
                    <p className="text-[11px] text-muted-foreground text-center">
                      Create webhooks in Settings first
                    </p>
                  )}
                </div>
              )}
            </div>
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
