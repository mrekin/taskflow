'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Search, X, ArrowUpDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TaskCard } from '@/components/task-card';
import { CreateTaskDialog } from '@/components/create-task-dialog';
import { TaskDetailDialog } from '@/components/task-detail-dialog';
import { useAppStore } from '@/store/app-store';
import { TASK_STATUSES, STATUS_LABELS, STATUS_COLORS } from '@/lib/constants';
import type { Task } from '@/lib/types';

type KanbanSortField = 'sortOrder' | 'id' | 'createdAt' | 'updatedAt' | 'title';
type KanbanSortDirection = 'asc' | 'desc';

interface KanbanColumnProps {
  status: string;
  tasks: Task[];
  onAddTask: (status: string) => void;
  isActive: boolean;
  showSubtasks: boolean;
}

function KanbanColumn({ status, tasks, onAddTask, isActive, showSubtasks }: KanbanColumnProps) {
  const color = STATUS_COLORS[status] || '#94a3b8';
  const label = STATUS_LABELS[status] || status;

  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: {
      type: 'column',
      status,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col rounded-lg min-w-[280px] w-full sm:min-w-[300px] transition-all duration-150',
        isActive
          ? 'bg-muted/60 ring-2 ring-primary/40'
          : 'bg-muted/30',
      )}
    >
      <div
        className={cn(
          'rounded-t-lg px-4 py-3 flex items-center justify-between border-b-2 transition-all duration-150',
          isActive && 'bg-primary/10',
        )}
        style={{ borderColor: isActive ? 'var(--color-primary)' : color }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: color }}
          />
          <h3 className="font-semibold text-sm">{label}</h3>
          <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
            {tasks.length}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => onAddTask(status)}
        >
          <Plus className="size-4" />
        </Button>
      </div>

      {/* Cards area */}
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 p-2 space-y-2 max-h-[calc(100vh-260px)] overflow-y-auto custom-scrollbar">
          <AnimatePresence mode="popLayout">
            {tasks.map((task) => (
              <div key={task.id}>
                <TaskCard task={task} />
                {showSubtasks && (task.subtasks ?? []).length > 0 && (
                  <div className="mt-1 space-y-0.5 ml-2">
                    {(task.subtasks ?? []).map((subtask) => (
                      <TaskCard key={subtask.id} task={subtask} isSubtask />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </AnimatePresence>
          {tasks.length === 0 && (
            <div className="py-8 text-center text-muted-foreground text-sm">
              No tasks
            </div>
          )}
        </div>
      </SortableContext>

      {/* Add task button at bottom */}
      <div className="p-2 pt-0">
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground hover:text-foreground h-9"
          onClick={() => onAddTask(status)}
        >
          <Plus className="size-4 mr-2" /> Add task
        </Button>
      </div>
    </div>
  );
}

export function KanbanBoard() {
  const { tasks, selectedProjectId, tagFilter, projectFilter, updateTask, userPreferences, fetchTasks, taskSearchQuery, setTaskSearchQuery } = useAppStore();
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [defaultStatus, setDefaultStatus] = useState<string>('todo');
  const [searchInput, setSearchInput] = useState(taskSearchQuery);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sortField, setSortField] = useState<KanbanSortField>('sortOrder');
  const [sortDirection, setSortDirection] = useState<KanbanSortDirection>('asc');

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setTaskSearchQuery(value);
      fetchTasks(selectedProjectId ?? undefined, value || undefined);
    }, 500);
  }, [selectedProjectId, setTaskSearchQuery, fetchTasks]);

  const clearSearch = useCallback(() => {
    setSearchInput('');
    setTaskSearchQuery('');
    fetchTasks(selectedProjectId ?? undefined, undefined);
  }, [selectedProjectId, setTaskSearchQuery, fetchTasks]);

  // Filter tasks by selected project
  const filteredTasks = useMemo(() => {
    let filtered = tasks;
    // Only show top-level tasks (no parent)
    filtered = filtered.filter((t) => !t.parentId);

    // Filter by projects
    if (projectFilter && projectFilter.length > 0) {
      filtered = filtered.filter((t) =>
        projectFilter.includes(t.projectId)
      );
    }

    // Filter by tags
    if (tagFilter && tagFilter.length > 0) {
      filtered = filtered.filter((t) =>
        tagFilter.some((tagId) => (t.tagIds || []).includes(tagId))
      );
    }

    return filtered;
  }, [tasks, projectFilter, tagFilter]);

  // Group tasks by status
  const tasksByStatus = useMemo(() => {
    const grouped: Record<string, Task[]> = {};
    for (const status of TASK_STATUSES) {
      grouped[status] = [];
    }
    for (const task of filteredTasks) {
      if (!grouped[task.status]) {
        grouped[task.status] = [];
      }
      grouped[task.status].push(task);
    }
    for (const status of TASK_STATUSES) {
      grouped[status].sort((a, b) => {
        let comparison = 0;
        switch (sortField) {
          case 'id':
            comparison = (a.shortIdNum ?? 0) - (b.shortIdNum ?? 0);
            break;
          case 'createdAt':
            comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            break;
          case 'updatedAt':
            comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
            break;
          case 'title':
            comparison = a.title.localeCompare(b.title);
            break;
          default:
            comparison = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        }
        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }
    return grouped;
  }, [filteredTasks, sortField, sortDirection]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const task = tasks.find((t) => t.id === active.id);
    if (task) {
      setActiveTask(task);
      setActiveColumnId(task.status);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (!over) {
      setActiveColumnId(null);
      return;
    }

    const overId = over.id as string;

    if (TASK_STATUSES.includes(overId as typeof TASK_STATUSES[number])) {
      setActiveColumnId(overId);
    } else {
      const overTask = tasks.find((t) => t.id === overId);
      if (overTask) {
        setActiveColumnId(overTask.status);
      }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);
    setActiveColumnId(null);

    if (!over) return;

    const activeTaskId = active.id as string;
    const overId = over.id as string;

    // Find the target status - could be a column or another task
    let targetStatus: string | null = null;

    // Check if dropped on a column (column id is the status string)
    if (TASK_STATUSES.includes(overId as typeof TASK_STATUSES[number])) {
      targetStatus = overId;
    } else {
      // Dropped on another task - use that task's status
      const overTask = tasks.find((t) => t.id === overId);
      if (overTask) {
        targetStatus = overTask.status;
      }
    }

    // Update the task's status if it changed
    const currentTask = tasks.find((t) => t.id === activeTaskId);
    if (currentTask && targetStatus && currentTask.status !== targetStatus) {
      updateTask(activeTaskId, { status: targetStatus });
    }
  };

  const handleDragCancel = () => {
    setActiveTask(null);
    setActiveColumnId(null);
  };

  const handleAddTask = (status: string) => {
    setDefaultStatus(status);
    setCreateDialogOpen(true);
  };

  return (
    <div className="h-full space-y-4">
      <div className="flex items-center gap-2 justify-end">
        <Select value={sortField} onValueChange={(v) => setSortField(v as KanbanSortField)}>
          <SelectTrigger className="w-[150px] h-7 text-xs">
            <ArrowUpDown className="size-3 mr-1 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sortOrder">Order</SelectItem>
            <SelectItem value="id">ID</SelectItem>
            <SelectItem value="createdAt">Created</SelectItem>
            <SelectItem value="updatedAt">Updated</SelectItem>
            <SelectItem value="title">Title</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs px-2"
          onClick={() => setSortDirection((d) => d === 'asc' ? 'desc' : 'asc')}
        >
          {sortDirection === 'asc' ? '↑ Asc' : '↓ Desc'}
        </Button>
        <div className="relative w-56">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search tasks..."
            className="h-7 text-xs pl-7 pr-7"
          />
          {searchInput && (
            <button
              className="absolute right-1.5 top-1/2 -translate-y-1/2 size-4 flex items-center justify-center rounded-sm hover:bg-muted text-muted-foreground"
              onClick={clearSearch}
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex gap-4 overflow-x-auto pb-4 h-full custom-scrollbar-horizontal">
          {TASK_STATUSES.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              tasks={tasksByStatus[status] || []}
              onAddTask={handleAddTask}
              isActive={activeColumnId === status && activeTask !== null}
              showSubtasks={userPreferences.showSubtasks}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask && <TaskCard task={activeTask} isDragOverlay />}
        </DragOverlay>
      </DndContext>

      <CreateTaskDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        defaultStatus={defaultStatus}
      />
      <TaskDetailDialog />
    </div>
  );
}