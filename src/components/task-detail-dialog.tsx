'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAppStore } from '@/store/app-store';
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
  STATUS_LABELS,
  STATUS_COLORS,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
} from '@/lib/constants';
import { CreateTaskDialog } from '@/components/create-task-dialog';
import { TaskComments } from '@/components/task-comments';
import { TagPicker } from '@/components/tag-picker';
import { TagBadges } from '@/components/tag-badges';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { EntityIdBadge } from '@/components/entity-id-badge';

export function TaskDetailDialog() {
  const {
    selectedTaskId,
    tasks,
    projects,
    selectTask,
    updateTask,
    deleteTask,
    fetchTasks,
  } = useAppStore();

  const task = tasks.find((t) => t.id === selectedTaskId);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCreateSubtask, setShowCreateSubtask] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Subtask inline editing state
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState('');
  const [localTagIds, setLocalTagIds] = useState<string[]>([]);

  // Sync local state when task changes
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setStatus(task.status);
      setPriority(task.priority);
      setDueDate(task.dueDate ? parseISO(task.dueDate) : undefined);
      setLocalTagIds(task.tagIds || []);
      setIsEditing(false);
      setEditingSubtaskId(null);
    }
  }, [task?.id]); // Only re-sync when task ID changes, not on every task object update

  const handleSave = async () => {
    if (!task || !title.trim()) return;
    setIsSaving(true);
    try {
      await updateTask(task.id, {
        title: title.trim(),
        description: description.trim() || null,
        status,
        priority,
        dueDate: dueDate ? dueDate.toISOString() : null,
        tagIds: localTagIds,
      });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!task) return;
    // If this is a subtask, go back to parent first
    const parentId = task.parentId;
    await deleteTask(task.id);
    if (parentId) {
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
    // Refresh to get updated subtasks
    if (task?.projectId) {
      fetchTasks(task.projectId);
    } else {
      fetchTasks();
    }
  };

  const handleSubtaskClick = (subtaskId: string) => {
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
    // Refresh tasks
    if (task?.projectId) {
      fetchTasks(task.projectId);
    } else {
      fetchTasks();
    }
  };

  const handleBackToParent = () => {
    if (task?.parentId) {
      selectTask(task.parentId);
    }
  };

  const isOverdue =
    task?.dueDate && isPast(parseISO(task.dueDate)) && task.status !== 'done' && task.status !== 'cancelled';
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
      <Sheet open={!!selectedTaskId} onOpenChange={(open) => !open && selectTask(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0">
          {task && (
            <div className="flex flex-col h-full">
              {/* Header */}
              <SheetHeader className="p-6 pb-4">
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
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!isEditing ? (
                      <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                        Edit
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setIsEditing(false);
                            // Reset to original values
                            setTitle(task.title);
                            setDescription(task.description || '');
                            setStatus(task.status);
                            setPriority(task.priority);
                            setDueDate(task.dueDate ? parseISO(task.dueDate) : undefined);
                          }}
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
              <ScrollArea className="flex-1">
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
                        <ChevronRight className="size-3.5 text-muted-foreground" />
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
                      <Textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Add a description... (Markdown supported)"
                        rows={6}
                        className="font-mono text-sm"
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

                  {/* Status + Priority */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                        Status
                      </Label>
                      {isEditing ? (
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
                      ) : (
                        <Badge
                          className="text-xs"
                          style={{
                            backgroundColor: STATUS_COLORS[task.status] + '20',
                            color: STATUS_COLORS[task.status],
                            borderColor: STATUS_COLORS[task.status] + '40',
                          }}
                        >
                          {STATUS_LABELS[task.status]}
                        </Badge>
                      )}
                    </div>
                    <div className="space-y-2">
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
                  </div>

                  {/* Due Date */}
                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                      Due Date
                    </Label>
                    {isEditing ? (
                      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                        <PopoverTrigger asChild>
                          <Button
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
                            {format(parseISO(task.dueDate), 'PPP')}
                            {isOverdue && ' (Overdue)'}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">No due date</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Project */}
                  {project && (
                    <div className="space-y-2">
                      <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                        Project
                      </Label>
                      <div className="flex items-center gap-2">
                        <FolderOpen className="size-4 text-muted-foreground" />
                        <span className="text-sm">{project.name}</span>
                      </div>
                    </div>
                  )}

                  {/* Tags */}
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                        Tags
                      </Label>
                      {isEditing ? (
                        <TagPicker
                          selectedTagIds={localTagIds}
                          onTagIdsChange={(tagIds) => {
                            setLocalTagIds(tagIds);
                            updateTask(task.id, { tagIds });
                          }}
                        />
                      ) : (
                        <TagBadges tagIds={localTagIds} max={10} />
                      )}
                    </div>
                  </>

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
                                      borderColor: STATUS_COLORS[subtask.status] + '60',
                                      color: STATUS_COLORS[subtask.status],
                                    }}
                                  >
                                    {STATUS_LABELS[subtask.status]}
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
                                          handleSubtaskDelete(subtask.id);
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

                  {/* Comments */}
                  <>
                    <Separator />
                    <TaskComments taskId={task.id} />
                  </>

                  {/* Delete button */}
                  {!isEditing && (
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
              </ScrollArea>
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

      {/* Create subtask dialog */}
      <CreateTaskDialog
        open={showCreateSubtask}
        onOpenChange={setShowCreateSubtask}
        parentId={task?.id}
        defaultProjectId={task?.projectId || undefined}
        defaultStatus="todo"
      />
    </>
  );
}
