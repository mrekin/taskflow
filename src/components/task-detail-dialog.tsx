'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { format, parseISO, isPast } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarIcon,
  Loader2,
  Plus,
  Trash2,
  FolderOpen,
  ArrowLeft,
  Pencil,
  Check,
  X,
  ChevronRight,
  Webhook as WebhookIcon,
  ChevronDown,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MentionTextarea } from '@/components/mention-autocomplete';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
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
import type { WebhookTrigger } from '@/lib/types';
import {
  TASK_PRIORITIES,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
  getColumnLabelAndColor,
  type StatusConfig,
} from '@/lib/constants';
import { CreateTaskDialog } from '@/components/create-task-dialog';
import { TaskComments } from '@/components/task-comments';
import { TagPicker } from '@/components/tag-picker';
import { TagBadges } from '@/components/tag-badges';
import { UserPicker } from '@/components/user-picker';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { EntityIdBadge } from '@/components/entity-id-badge';
import { VisibilityLock } from '@/components/visibility-lock';
import { OwnerIndicator } from '@/components/owner-indicator';
import { toast } from 'sonner';
import { useConfirmClose } from '@/hooks/use-confirm-close';

export function TaskDetailDialog() {
  const {
    selectedTaskId,
    tasks,
    projects,
    selectTask,
    updateTask,
    deleteTask,
    fetchTasks,
    statuses,
    webhooks,
    fetchWebhooks,
    createWebhookTrigger,
    updateWebhookTrigger,
    deleteWebhookTrigger,
    users,
    currentUserId,
  } = useAppStore();

  const task = tasks.find((t) => t.id === selectedTaskId);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [dueTime, setDueTime] = useState('09:00');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDeleteSubtaskDialog, setShowDeleteSubtaskDialog] = useState(false);
  const [pendingDeleteSubtaskId, setPendingDeleteSubtaskId] = useState<string | null>(null);
  const [showCreateSubtask, setShowCreateSubtask] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Subtask inline editing state
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState('');
  const [localTagIds, setLocalTagIds] = useState<string[]>([]);
  const [localAssigneeId, setLocalAssigneeId] = useState<string | null>(null);
  const [localVisibility, setLocalVisibility] = useState<string | null>(null);
  const [localVisibleUserIds, setLocalVisibleUserIds] = useState<string[]>([]);

  const navigatedFromParentRef = useRef(false);

  const isDirty = isEditing && !!task && (
    title !== task.title ||
    description !== (task.description || '') ||
    status !== task.status ||
    priority !== task.priority ||
    (dueDate ? dueDate.toISOString().slice(0, 10) : '') !== (task.dueDate ? parseISO(task.dueDate).toISOString().slice(0, 10) : '') ||
    (dueDate ? dueTime : '09:00') !== (task.dueDate ? format(parseISO(task.dueDate), 'HH:mm') : '09:00') ||
    projectId !== (task.projectId ?? null) ||
    localTagIds.join(',') !== (task.tagIds || []).join(',') ||
    localAssigneeId !== (task.assigneeId ?? null)
  );

  const resetEditState = useCallback(() => {
    if (!task) return;
    setIsEditing(false);
    setTitle(task.title);
    setDescription(task.description || '');
    setStatus(task.status);
    setPriority(task.priority);
    setDueDate(task.dueDate ? parseISO(task.dueDate) : undefined);
    setDueTime(task.dueDate ? format(parseISO(task.dueDate), 'HH:mm') : '09:00');
    setProjectId(task.projectId ?? null);
    setLocalTagIds(task.tagIds || []);
    setLocalAssigneeId(task.assigneeId ?? null);
  }, [task]);

  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [discardAction, setDiscardAction] = useState<'cancel-edit' | 'close-sheet'>('close-sheet');

  const handleSheetOpenChange = useCallback((open: boolean) => {
    if (!open && isDirty) {
      setDiscardAction('close-sheet');
      setShowDiscardConfirm(true);
      return;
    }
    if (!open) {
      selectTask(null);
    }
  }, [isDirty, selectTask]);

  const handleCancelEdit = useCallback(() => {
    if (isDirty) {
      setDiscardAction('cancel-edit');
      setShowDiscardConfirm(true);
      return;
    }
    resetEditState();
  }, [isDirty, resetEditState]);

  const handleConfirmDiscard = useCallback(() => {
    setShowDiscardConfirm(false);
    if (discardAction === 'close-sheet') {
      resetEditState();
      selectTask(null);
    } else {
      resetEditState();
    }
  }, [discardAction, resetEditState, selectTask]);

  const [webhookBindings, setWebhookBindings] = useState<
    { webhookId: string; events: string[] }[]
  >([]);
  const [webhooksExpanded, setWebhooksExpanded] = useState(false);
  const [taskTriggers, setTaskTriggers] = useState<
    (WebhookTrigger & { webhookName?: string; webhookUrl?: string; webhookMethod?: string; webhookActive?: boolean })[]
  >([]);

  // Sync local state when task changes
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setStatus(task.status);
      setPriority(task.priority);
      setDueDate(task.dueDate ? parseISO(task.dueDate) : undefined);
      setProjectId(task.projectId ?? null);
      setLocalTagIds(task.tagIds || []);
      setLocalAssigneeId(task.assigneeId ?? null);
      setLocalVisibility(task.visibility);
      setLocalVisibleUserIds(task.visibleUserIds || []);
      setIsEditing(false);
      setEditingSubtaskId(null);
      setWebhookBindings([]);
      setWebhooksExpanded(false);
      navigatedFromParentRef.current = false;
    }
  }, [task?.id]);

  useEffect(() => {
    if (task) {
      fetchWebhooks();
    }
  }, [task?.id, fetchWebhooks]);

  useEffect(() => {
    if (task) {
      const triggers: (WebhookTrigger & { webhookName?: string; webhookUrl?: string; webhookMethod?: string; webhookActive?: boolean })[] = [];
      for (const w of webhooks) {
        for (const t of w.triggers ?? []) {
          if (t.scopeType === 'task' && t.scopeId === task.id) {
            triggers.push({ ...t, webhookName: w.name, webhookUrl: w.url, webhookMethod: w.method, webhookActive: w.active });
          }
        }
      }
      setTaskTriggers(triggers);
    }
  }, [task?.id, webhooks]);

  const handleSave = async () => {
    if (!task || !title.trim()) return;
    setIsSaving(true);
    try {
      await updateTask(task.id, {
        title: title.trim(),
        description: description.trim() || null,
        status,
        priority,
        dueDate: dueDate ? (() => {
          const [h, m] = dueTime.split(':').map(Number);
          const d = new Date(dueDate);
          d.setHours(h, m, 0, 0);
          return d.toISOString();
        })() : null,
        projectId,
        tagIds: localTagIds,
        assigneeId: localAssigneeId,
        visibility: localVisibility,
        visibleUserIds: localVisibleUserIds,
      });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const TASK_WEBHOOK_EVENTS = [
    { value: 'task.status_changed', label: 'Status Changed' },
    { value: 'task.priority_changed', label: 'Priority Changed' },
    { value: 'task.due_date_reached', label: 'Due Date Reached' },
    { value: 'task.created', label: 'Task Created' },
  ] as const;

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

  const handleAddWebhookBindings = async () => {
    if (!task || webhookBindings.length === 0) return;
    for (const binding of webhookBindings) {
      try {
        await createWebhookTrigger({
          webhookId: binding.webhookId,
          events: binding.events,
          scopeType: 'task',
          scopeId: task.id,
        });
      } catch {
        const sourceWebhook = webhooks.find((w) => w.id === binding.webhookId);
        toast.error(`Failed to create trigger for "${sourceWebhook?.name ?? 'webhook'}"`);
      }
    }
    setWebhookBindings([]);
    await fetchWebhooks();
  };

  const handleRemoveTaskTrigger = async (triggerId: string) => {
    try {
      await deleteWebhookTrigger(triggerId);
      toast.success('Trigger removed');
    } catch {
      toast.error('Failed to remove trigger');
    }
  };

  const handleToggleTriggerEvent = async (triggerId: string, eventValue: string, currentEvents: string[]) => {
    const newEvents = currentEvents.includes(eventValue)
      ? currentEvents.filter((e) => e !== eventValue)
      : [...currentEvents, eventValue];
    if (newEvents.length === 0) {
      toast.error('Trigger must have at least one event');
      return;
    }
    try {
      await updateWebhookTrigger(triggerId, { events: newEvents });
    } catch {
      toast.error('Failed to update trigger');
    }
  };

  const handleDelete = async () => {
    if (!task) return;
    const parentId = task.parentId;
    const cameFromParent = navigatedFromParentRef.current;
    await deleteTask(task.id);
    if (parentId && cameFromParent) {
      selectTask(parentId);
    } else {
      selectTask(null);
    }
    setShowDeleteDialog(false);
  };

  const handleSubtaskToggle = async (subtaskId: string, checked: boolean) => {
    await updateTask(subtaskId, {
      status: checked ? 'done' : 'todo',
    });
    fetchTasks();
  };

  const handleSubtaskClick = (subtaskId: string) => {
    if (task && !task.parentId) {
      navigatedFromParentRef.current = true;
    }
    selectTask(subtaskId);
  };

  const handleSubtaskEditStart = (subtaskId: string, currentTitle: string) => {
    setEditingSubtaskId(subtaskId);
    setEditingSubtaskTitle(currentTitle);
  };

  const handleSubtaskEditSave = async (subtaskId: string) => {
    if (!editingSubtaskTitle.trim()) {
      setEditingSubtaskId(null);
      return;
    }
    await updateTask(subtaskId, { title: editingSubtaskTitle.trim() });
    setEditingSubtaskId(null);
    setEditingSubtaskTitle('');
  };

  const handleSubtaskEditCancel = () => {
    setEditingSubtaskId(null);
    setEditingSubtaskTitle('');
  };

  const handleSubtaskDelete = async (subtaskId: string) => {
    await deleteTask(subtaskId);
    fetchTasks();
  };

  const handleBackToParent = () => {
    if (task?.parentId) {
      selectTask(task.parentId);
    }
  };

  const isOverdue =
    task?.dueDate && isPast(parseISO(task.dueDate)) && task.status !== 'done' && task.status !== 'cancelled';
  const isOwner = task?.ownerId === currentUserId;
  const project = task?.projectId ? projects.find((p) => p.id === task.projectId) : null;
  const parentTask = task?.parentId ? tasks.find((t) => t.id === task.parentId) : null;
  const subtasks = task?.subtasks ?? tasks.filter((t) => t.parentId === task?.id);
  const completedSubtasks = subtasks.filter((s) => s.status === 'done').length;

  // Keyboard shortcut for inline editing
  const handleSubtaskKeyDown = useCallback(
    (e: React.KeyboardEvent, subtaskId: string) => {
      if (e.key === 'Enter') {
        handleSubtaskEditSave(subtaskId);
      } else if (e.key === 'Escape') {
        handleSubtaskEditCancel();
      }
    },
    [editingSubtaskTitle]
  );

  return (
    <>
      <Sheet open={!!selectedTaskId} onOpenChange={handleSheetOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-2xl p-0">
          {task && (
            <div className="flex flex-col h-full">
              {/* Header */}
              <SheetHeader className="p-6 pb-4 pr-12">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    {task.parentId && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0"
                        onClick={handleBackToParent}
                        title="Back to parent task"
                      >
                        <ArrowLeft className="size-4" />
                      </Button>
                    )}
                    <SheetTitle className="text-lg truncate">
                      {task.parentId ? 'Subtask Details' : isEditing ? 'Edit Task' : 'Task Details'}
                    </SheetTitle>
                    <EntityIdBadge id={task.id} shortId={task.shortId || 'T-?'} type="task" />
                    <VisibilityLock
                      value={localVisibility}
                      visibleUserIds={localVisibleUserIds}
                      onChange={(v, ids) => { setLocalVisibility(v); setLocalVisibleUserIds(ids); }}
                      ownerId={task.ownerId}
                      currentUserId={currentUserId}
                      disabled={!isEditing}
                      size="sm"
                      users={users}
                    />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <OwnerIndicator
                      ownerId={task.ownerId}
                      currentUserId={currentUserId}
                      ownerName={task.assignee?.name}
                    />
                    {!isOwner ? (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        Read-only
                      </Badge>
                    ) : !isEditing ? (
                      <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                        Edit
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCancelEdit}
                        >
                          Cancel
                        </Button>
                        <Button size="sm" onClick={handleSave} disabled={isSaving}>
                          {isSaving && <Loader2 className="mr-1 size-3 animate-spin" />}
                          Save
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <SheetDescription className="sr-only">Task details view</SheetDescription>
              </SheetHeader>

              {/* Content */}
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar">
                <div className="p-6 pt-0 space-y-5">
                  {/* Parent task link */}
                  {task.parentId && parentTask && (
                    <>
                      <div
                        className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors group"
                        onClick={handleBackToParent}
                      >
                        <ArrowLeft className="size-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Parent Task</p>
                          <p className="text-sm font-medium truncate">{parentTask.title}</p>
                        </div>
                      </div>
                      <Separator />
                    </>
                  )}

                  {/* Title */}
                  {isEditing ? (
                    <div className="space-y-2">
                      <Label>Title</Label>
                      <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Task title"
                      />
                    </div>
                  ) : (
                    <h2 className="text-xl font-semibold leading-tight">{task.title}</h2>
                  )}

                  {/* Description */}
                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                      Description
                    </Label>
                    {isEditing ? (
                      <MentionTextarea
                        value={description}
                        onChange={(val) => setDescription(val)}
                        placeholder="Add a description... (Markdown supported)"
                        rows={isEditing ? 18 : 6}
                        className="font-mono text-sm w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                    ) : (
                      task.description ? (
                        <div className="text-sm">
                          <MarkdownRenderer content={task.description} />
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No description</p>
                      )
                    )}
                  </div>

                  <Separator />

                  {/* Status + Priority + Due Date */}
                  <div className={isEditing ? "grid grid-cols-3 gap-3" : "grid grid-cols-2 gap-4"}>
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                        Status
                      </Label>
                      {isEditing ? (
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
                            {(() => {
                              const { isValid, label } = getColumnLabelAndColor(statuses, task.status);
                              if (!isValid && task.status) {
                                return (
                                  <SelectItem value={task.status}>
                                    {label}
                                  </SelectItem>
                                );
                              }
                              return null;
                            })()}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge
                          className="text-xs"
                          style={{
                            backgroundColor: getColumnLabelAndColor(statuses, task.status).color + '20',
                            color: getColumnLabelAndColor(statuses, task.status).color,
                            borderColor: getColumnLabelAndColor(statuses, task.status).color + '40',
                          }}
                        >
                          {getColumnLabelAndColor(statuses, task.status).label}
                        </Badge>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                        Priority
                      </Label>
                      {isEditing ? (
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
                      ) : (
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: PRIORITY_COLORS[task.priority] }}
                          />
                          <span className="text-sm">{PRIORITY_LABELS[task.priority]}</span>
                        </div>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                        Due Date
                      </Label>
                      {isEditing ? (
                        <div className="flex gap-2">
                          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className={cn(
                                  'flex-1 justify-start text-left font-normal',
                                  !dueDate && 'text-muted-foreground',
                                )}
                              >
                                <CalendarIcon className="mr-2 size-4" />
                                {dueDate ? format(dueDate, 'PP') : 'Pick a date'}
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
                          {dueDate && (
                            <TimePicker
                              value={dueTime}
                              onChange={setDueTime}
                              className="shrink-0"
                            />
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <CalendarIcon className="size-4 text-muted-foreground" />
                          {task.dueDate ? (
                            <span
                              className={cn(
                                'text-sm',
                                isOverdue && 'text-red-600 font-medium',
                              )}
                            >
                              {format(parseISO(task.dueDate), 'PP, HH:mm')}
                              {isOverdue && ' (Overdue)'}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">No due date</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Project + Tags row */}
                  {isEditing ? (
                    <div className={task.parentId ? "grid grid-cols-1 gap-3" : "grid grid-cols-[1fr_2fr] gap-3"}>
                      {!task.parentId && (
                        <div className="space-y-1.5">
                          <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                            Project
                          </Label>
                          <Select
                            value={projectId ?? 'none'}
                            onValueChange={(v) => setProjectId(v === 'none' ? null : v)}
                          >
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
                      <div className="space-y-1.5">
                        <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                          Tags
                        </Label>
                        <TagPicker
                          selectedTagIds={localTagIds}
                          onTagIdsChange={(tagIds) => {
                            setLocalTagIds(tagIds);
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      {!task.parentId && (
                        <div className="space-y-1.5">
                          <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                            Project
                          </Label>
                          {project ? (
                            <div className="flex items-center gap-2">
                              <FolderOpen className="size-4 text-muted-foreground" />
                              <span className="text-sm">{project.name}</span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">No project</span>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {/* Tags - view mode only */}
                  {!isEditing && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                          Tags
                        </Label>
                        <TagBadges tagIds={localTagIds} max={10} />
                      </div>
                    </>
                  )}

                  {/* Assignee */}
                  {isEditing ? (
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                        Assignee
                      </Label>
                      <UserPicker
                        assigneeId={localAssigneeId}
                        assignee={task.assignee ? { id: task.assignee.id, name: task.assignee.name, email: task.assignee.email, label: task.assignee.name || task.assignee.email } : null}
                        onAssigneeChange={setLocalAssigneeId}
                      />
                    </div>
                  ) : (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                          Assignee
                        </Label>
                        {task.assignee ? (
                          <div className="flex items-center gap-2">
                            {task.assignee.image ? (
                              <img
                                src={task.assignee.image}
                                alt=""
                                className="size-5 rounded-full"
                              />
                            ) : (
                              <span className="size-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium">
                                {(task.assignee.name || task.assignee.email || '?')[0].toUpperCase()}
                              </span>
                            )}
                            <span className="text-sm">{task.assignee.name || task.assignee.email}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Unassigned</span>
                        )}
                      </div>
                    </>
                   )}

                  {/* Subtasks - only show for top-level tasks */}
                  {!task.parentId && (
                    <>
                      <Separator />
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                            Subtasks ({completedSubtasks}/{subtasks.length})
                          </Label>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setShowCreateSubtask(true)}
                          >
                            <Plus className="size-3 mr-1" /> Add Subtask
                          </Button>
                        </div>

                        {/* Progress bar for subtasks */}
                        {subtasks.length > 0 && (
                          <div className="w-full bg-muted rounded-full h-1.5">
                            <div
                              className="bg-primary rounded-full h-1.5 transition-all duration-300"
                              style={{
                                width: `${subtasks.length > 0 ? (completedSubtasks / subtasks.length) * 100 : 0}%`,
                              }}
                            />
                          </div>
                        )}

                        {subtasks.length > 0 ? (
                          <div className="space-y-1">
                            <AnimatePresence>
                              {subtasks.map((subtask) => (
                                <motion.div
                                  key={subtask.id}
                                  initial={{ opacity: 0, x: -10 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  exit={{ opacity: 0, x: 10 }}
                                  className="group flex items-center gap-2 py-2 px-2.5 rounded-md hover:bg-muted/50 transition-colors"
                                >
                                  <Checkbox
                                    checked={subtask.status === 'done'}
                                    onCheckedChange={(checked) =>
                                      handleSubtaskToggle(subtask.id, !!checked)
                                    }
                                    className="shrink-0"
                                  />

                                  {/* Inline title editing */}
                                  {editingSubtaskId === subtask.id ? (
                                    <div className="flex-1 flex items-center gap-1 min-w-0">
                                      <Input
                                        value={editingSubtaskTitle}
                                        onChange={(e) => setEditingSubtaskTitle(e.target.value)}
                                        onKeyDown={(e) => handleSubtaskKeyDown(e, subtask.id)}
                                        onBlur={() => handleSubtaskEditSave(subtask.id)}
                                        className="h-7 text-sm py-0 px-2"
                                        autoFocus
                                      />
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-6 shrink-0"
                                        onClick={() => handleSubtaskEditSave(subtask.id)}
                                      >
                                        <Check className="size-3" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-6 shrink-0"
                                        onClick={handleSubtaskEditCancel}
                                      >
                                        <X className="size-3" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <span
                                      className={cn(
                                        'text-sm flex-1 min-w-0 truncate cursor-pointer',
                                        subtask.status === 'done' && 'line-through text-muted-foreground',
                                      )}
                                      onClick={() => handleSubtaskClick(subtask.id)}
                                      title="Click to open subtask details"
                                    >
                                      {subtask.title}
                                    </span>
                                  )}

                                  {/* Priority indicator */}
                                  <span
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{
                                      backgroundColor: PRIORITY_COLORS[subtask.priority],
                                    }}
                                    title={PRIORITY_LABELS[subtask.priority]}
                                  />

                                  {/* Status badge */}
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] px-1.5 h-4 font-normal shrink-0 hidden sm:inline-flex"
                                    style={{
                                      borderColor: getColumnLabelAndColor(statuses, subtask.status).color + '60',
                                      color: getColumnLabelAndColor(statuses, subtask.status).color,
                                    }}
                                  >
                                    {getColumnLabelAndColor(statuses, subtask.status).label}
                                  </Badge>

                                  {/* Action buttons - show on hover */}
                                  {editingSubtaskId !== subtask.id && (
                                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-6"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleSubtaskEditStart(subtask.id, subtask.title);
                                        }}
                                        title="Edit subtask title"
                                      >
                                        <Pencil className="size-3" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-6 text-muted-foreground hover:text-destructive"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setPendingDeleteSubtaskId(subtask.id);
                                          setShowDeleteSubtaskDialog(true);
                                        }}
                                        title="Delete subtask"
                                      >
                                        <Trash2 className="size-3" />
                                      </Button>
                                    </div>
                                  )}

                                  {/* Chevron to indicate clickability */}
                                  {editingSubtaskId !== subtask.id && (
                                    <ChevronRight
                                      className="size-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                      onClick={() => handleSubtaskClick(subtask.id)}
                                    />
                                  )}
                                </motion.div>
                              ))}
                            </AnimatePresence>
                          </div>
                        ) : (
                          <div className="py-4 text-center">
                            <p className="text-sm text-muted-foreground">No subtasks yet</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Click &quot;Add Subtask&quot; to break this task into smaller steps
                            </p>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Nested subtasks indicator for subtask view */}
                  {task.parentId && subtasks.length > 0 && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                          Nested Subtasks ({completedSubtasks}/{subtasks.length})
                        </Label>
                        {subtasks.map((nestedSubtask) => (
                          <div
                            key={nestedSubtask.id}
                            className="flex items-center gap-2 py-1.5 px-2.5 rounded-md hover:bg-muted/50 cursor-pointer"
                            onClick={() => handleSubtaskClick(nestedSubtask.id)}
                          >
                            <Checkbox
                              checked={nestedSubtask.status === 'done'}
                              onCheckedChange={(checked) =>
                                handleSubtaskToggle(nestedSubtask.id, !!checked)
                              }
                              className="shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <span
                              className={cn(
                                'text-sm flex-1 truncate',
                                nestedSubtask.status === 'done' && 'line-through text-muted-foreground',
                              )}
                            >
                              {nestedSubtask.title}
                            </span>
                            <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Webhooks */}
                  <>
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
                        {taskTriggers.length > 0 && (
                          <span className="ml-1 rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px]">
                            {taskTriggers.length}
                          </span>
                        )}
                      </button>

                      {webhooksExpanded && !isEditing && (
                        <div className="space-y-1.5 pl-1">
                          {taskTriggers.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground text-center py-1">
                              No webhooks for this task
                            </p>
                          ) : (
                            taskTriggers.map((trigger) => (
                              <div
                                key={trigger.id}
                                className="rounded-lg border p-2 space-y-1 overflow-hidden min-w-0"
                              >
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-medium truncate">
                                    {trigger.webhookName}
                                  </span>
                                  <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                                    {trigger.webhookMethod}
                                  </span>
                                  <Badge variant={trigger.webhookActive !== false ? 'default' : 'outline'} className="text-[10px] h-4 px-1">
                                    {trigger.webhookActive !== false ? 'Active' : 'Disabled'}
                                  </Badge>
                                </div>
                                <p className="text-[10px] text-muted-foreground font-mono break-all leading-tight">
                                  {trigger.webhookUrl}
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {trigger.events.map((ev) => (
                                    <span
                                      key={ev}
                                      className="inline-flex rounded px-1.5 py-0.5 text-[10px] border border-primary/30 bg-primary/5"
                                    >
                                      {ev.replace('task.', '').replace(/_/g, ' ')}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}

                      {webhooksExpanded && isEditing && (
                        <div className="space-y-2 pl-1">
                          {taskTriggers.map((trigger) => (
                            <div
                              key={trigger.id}
                              className="rounded-lg border p-2.5 space-y-1.5 overflow-hidden min-w-0"
                            >
                              <div className="flex items-center gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-medium truncate">
                                      {trigger.webhookName}
                                    </span>
                                    <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                                      {trigger.webhookMethod}
                                    </span>
                                    <Badge variant={trigger.webhookActive !== false ? 'default' : 'outline'} className="text-[10px] h-4 px-1">
                                      {trigger.webhookActive !== false ? 'Active' : 'Disabled'}
                                    </Badge>
                                  </div>
                                  <p className="text-[10px] text-muted-foreground font-mono break-all leading-tight">
                                    {trigger.webhookUrl}
                                  </p>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                                  onClick={() => handleRemoveTaskTrigger(trigger.id)}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {TASK_WEBHOOK_EVENTS.map((ev) => (
                                  <button
                                    key={ev.value}
                                    type="button"
                                    className={cn(
                                      'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] border transition-colors',
                                      trigger.events.includes(ev.value)
                                        ? 'border-primary/40 bg-primary/5 text-foreground'
                                        : 'border-border text-muted-foreground hover:border-primary/20',
                                    )}
                                    onClick={() => handleToggleTriggerEvent(trigger.id, ev.value, trigger.events)}
                                  >
                                    <span
                                      className={cn(
                                        'size-2.5 rounded-sm border flex items-center justify-center shrink-0',
                                        trigger.events.includes(ev.value)
                                          ? 'border-primary bg-primary'
                                          : 'border-muted-foreground/30',
                                      )}
                                    >
                                      {trigger.events.includes(ev.value) && (
                                        <Check className="size-2 text-primary-foreground" />
                                      )}
                                    </span>
                                    {ev.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}

                          {taskTriggers.length === 0 && webhookBindings.length === 0 && (
                            <p className="text-[11px] text-muted-foreground text-center py-1">
                              No webhooks for this task
                            </p>
                          )}

                          {webhookBindings.map((binding, idx) => {
                            const sourceWebhook = webhooks.find(
                              (w) => w.id === binding.webhookId,
                            );
                            return (
                              <div
                                key={`new-${idx}`}
                                className="rounded-lg border border-dashed border-primary/30 p-2.5 space-y-2 overflow-hidden min-w-0"
                              >
                                <div className="flex items-center gap-2">
                                  <Select
                                    value={binding.webhookId}
                                    onValueChange={(val) =>
                                      updateBindingWebhook(idx, val)
                                    }
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
                                      onClick={() =>
                                        toggleBindingEvent(idx, event.value)
                                      }
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

                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 h-8 text-xs"
                              onClick={addWebhookBinding}
                              disabled={webhooks.length === 0}
                            >
                              <Plus className="size-3 mr-1" />
                              Add Webhook
                            </Button>
                            {webhookBindings.length > 0 && (
                              <Button
                                size="sm"
                                className="h-8 text-xs"
                                onClick={handleAddWebhookBindings}
                              >
                                Apply
                              </Button>
                            )}
                          </div>

                          {webhooks.length === 0 && (
                            <p className="text-[11px] text-muted-foreground text-center">
                              Create webhooks in Settings first
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </>

                  {/* Comments */}
                  <>
                    <Separator />
                    <TaskComments taskId={task.id} />
                  </>

                  {/* Delete button */}
                  {!isEditing && isOwner && (
                    <>
                      <Separator />
                      <Button
                        variant="destructive"
                        size="sm"
                        className="w-full"
                        onClick={() => setShowDeleteDialog(true)}
                      >
                        <Trash2 className="size-4 mr-2" /> Delete {task.parentId ? 'Subtask' : 'Task'}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {task?.parentId ? 'Subtask' : 'Task'}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{task?.title}&quot;? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete subtask confirmation */}
      <AlertDialog open={showDeleteSubtaskDialog} onOpenChange={setShowDeleteSubtaskDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Subtask</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{subtasks.find((s) => s.id === pendingDeleteSubtaskId)?.title}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDeleteSubtaskId) {
                  handleSubtaskDelete(pendingDeleteSubtaskId);
                  setPendingDeleteSubtaskId(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create subtask dialog */}
      <CreateTaskDialog
        open={showCreateSubtask}
        onOpenChange={setShowCreateSubtask}
        parentId={task?.id}
        defaultProjectId={task?.projectId || undefined}
        defaultStatus="todo"
      />

      {/* Discard unsaved changes confirmation */}
      <AlertDialog open={showDiscardConfirm} onOpenChange={(open) => !open && setShowDiscardConfirm(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to {discardAction === 'close-sheet' ? 'close' : 'cancel'}? All unsaved edits will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDiscardConfirm(false)}>Continue editing</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDiscard}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
