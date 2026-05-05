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
import { Plus, Search, X, ArrowUpDown, AlertTriangle } from 'lucide-react';

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
import { useAppStore } from '@/store/app-store';
import { INVALID_STATE_COLUMN, TASK_PRIORITIES, type StatusConfig } from '@/lib/constants';
import type { Task } from '@/lib/types';

type KanbanSortField = 'id' | 'priority' | 'createdAt' | 'updatedAt' | 'title';
type KanbanSortDirection = 'asc' | 'desc';

interface KanbanColumnProps {
  column: StatusConfig;
  tasks: Task[];
  onAddTask: (status: string) => void;
  isActive: boolean;
  showSubtasks: boolean;
  isInvalid?: boolean;
}

function KanbanColumn({ column, tasks, onAddTask, isActive, showSubtasks, isInvalid }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: {
      type: 'column',
      status: column.id,
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
        isInvalid && 'border border-red-500/30',
      )}
    >
      <div
        className={cn(
          'rounded-t-lg px-4 py-3 flex items-center justify-between border-b-2 transition-all duration-150',
          isActive && 'bg-primary/10',
          isInvalid && 'bg-red-500/5',
        )}
        style={{ borderColor: isActive ? 'var(--color-primary)' : column.color }}
      >
      <div className="flex items-center gap-2 justify-end">
          {isInvalid ? (
            <AlertTriangle className="size-3.5 text-red-500 shrink-0" />
          ) : (
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: column.color }}
            />
          )}
          <h3 className="font-semibold text-sm">{column.label}</h3>
          <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
            {tasks.length}
          </span>
        </div>
        {!isInvalid && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => onAddTask(column.id)}
          >
            <Plus className="size-4" />
          </Button>
        )}
      </div>

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
              {isInvalid ? 'No invalid tasks' : 'No tasks'}
            </div>
          )}
        </div>
      </SortableContext>

      {!isInvalid && (
        <div className="p-2 pt-0">
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground hover:text-foreground h-9"
            onClick={() => onAddTask(column.id)}
          >
            <Plus className="size-4 mr-2" /> Add task
          </Button>
        </div>
      )}
    </div>
  );
}

export function KanbanBoard() {
  const { tasks, selectedProjectId, tagFilter, projectFilter, updateTask, userPreferences, fetchTasks, taskSearchQuery, setTaskSearchQuery, statuses } = useAppStore();
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [defaultStatus, setDefaultStatus] = useState<string>('todo');
  const [searchInput, setSearchInput] = useState(taskSearchQuery);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sortField, setSortField] = useState<KanbanSortField>('id');
  const [sortDirection, setSortDirection] = useState<KanbanSortDirection>('asc');

  const visibleColumns = useMemo(() => statuses.filter((c) => c.visible), [statuses]);
  const allColumnIds = useMemo(() => new Set(statuses.map((c) => c.id)), [statuses]);

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

  const filteredTasks = useMemo(() => {
    let filtered = tasks;
    filtered = filtered.filter((t) => !t.parentId);

    if (projectFilter && projectFilter.length > 0) {
      filtered = filtered.filter((t) =>
        t.projectId != null && projectFilter.includes(t.projectId)
      );
    }

    if (tagFilter && tagFilter.length > 0) {
      filtered = filtered.filter((t) =>
        tagFilter.some((tagId) => (t.tagIds || []).includes(tagId))
      );
    }

    return filtered;
  }, [tasks, projectFilter, tagFilter]);

  const tasksByStatus = useMemo(() => {
    const grouped: Record<string, Task[]> = {};
    for (const col of visibleColumns) {
      grouped[col.id] = [];
    }
    grouped[INVALID_STATE_COLUMN.id] = [];

    for (const task of filteredTasks) {
      if (!grouped[task.status]) {
        grouped[task.status] = [];
      }
      grouped[task.status].push(task);
    }

    const invalidTasks: Task[] = [];
    for (const [status, statusTasks] of Object.entries(grouped)) {
      if (status === INVALID_STATE_COLUMN.id) continue;
      if (!allColumnIds.has(status)) {
        invalidTasks.push(...statusTasks);
        delete grouped[status];
      }
    }
    if (invalidTasks.length > 0) {
      grouped[INVALID_STATE_COLUMN.id] = invalidTasks;
    }

    for (const col of visibleColumns) {
      grouped[col.id]?.sort((a, b) => {
        let comparison = 0;
        switch (sortField) {
          case 'id':
            comparison = (a.shortIdNum ?? 0) - (b.shortIdNum ?? 0);
            break;
          case 'priority':
            comparison = TASK_PRIORITIES.indexOf(a.priority as typeof TASK_PRIORITIES[number]) - TASK_PRIORITIES.indexOf(b.priority as typeof TASK_PRIORITIES[number]);
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
            comparison = (a.shortIdNum ?? 0) - (b.shortIdNum ?? 0);
        }
        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }

    return grouped;
  }, [filteredTasks, visibleColumns, allColumnIds, sortField, sortDirection]);

  const hasInvalidTasks = (tasksByStatus[INVALID_STATE_COLUMN.id]?.length ?? 0) > 0;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  const columnIds = useMemo(() => {
    const ids = [...visibleColumns.map((c) => c.id)];
    if (hasInvalidTasks) ids.push(INVALID_STATE_COLUMN.id);
    return ids;
  }, [visibleColumns, hasInvalidTasks]);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const task = tasks.find((t) => t.id === active.id);
    if (task) {
      setActiveTask(task);
      const taskStatus = task.status;
      if (allColumnIds.has(taskStatus)) {
        setActiveColumnId(taskStatus);
      } else {
        setActiveColumnId(INVALID_STATE_COLUMN.id);
      }
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (!over) {
      setActiveColumnId(null);
      return;
    }

    const overId = over.id as string;

    if (columnIds.includes(overId)) {
      setActiveColumnId(overId);
    } else {
      const overTask = tasks.find((t) => t.id === overId);
      if (overTask) {
        const taskStatus = overTask.status;
        if (allColumnIds.has(taskStatus)) {
          setActiveColumnId(taskStatus);
        } else {
          setActiveColumnId(INVALID_STATE_COLUMN.id);
        }
      }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) {
      setActiveTask(null);
      setActiveColumnId(null);
      return;
    }

    const activeTaskId = active.id as string;
    const overId = over.id as string;

    let targetStatus: string | null = null;

    if (overId === INVALID_STATE_COLUMN.id) {
      setActiveTask(null);
      setActiveColumnId(null);
      return;
    }

    if (columnIds.includes(overId) && overId !== INVALID_STATE_COLUMN.id) {
      targetStatus = overId;
    } else {
      const overTask = tasks.find((t) => t.id === overId);
      if (overTask) {
        const overStatus = overTask.status;
        if (allColumnIds.has(overStatus)) {
          targetStatus = overStatus;
        } else {
          setActiveTask(null);
          setActiveColumnId(null);
          return;
        }
      }
    }

    const currentTask = tasks.find((t) => t.id === activeTaskId);
    if (currentTask && targetStatus && currentTask.status !== targetStatus) {
      useAppStore.setState((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === activeTaskId ? { ...t, status: targetStatus! } : t
        ),
      }));
      updateTask(activeTaskId, { status: targetStatus });
    }

    setActiveTask(null);
    setActiveColumnId(null);
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
        <Select value={sortField} onValueChange={(v) => setSortField(v as KanbanSortField)}>
          <SelectTrigger className="w-[150px] h-7 text-xs">
            <ArrowUpDown className="size-3 mr-1 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="id">ID</SelectItem>
            <SelectItem value="priority">Priority</SelectItem>
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
          {visibleColumns.map((col) => (
            <KanbanColumn
              key={col.id}
              column={col}
              tasks={tasksByStatus[col.id] || []}
              onAddTask={handleAddTask}
              isActive={activeColumnId === col.id && activeTask !== null}
              showSubtasks={userPreferences.showSubtasks}
            />
          ))}
          {hasInvalidTasks && (
            <KanbanColumn
              column={INVALID_STATE_COLUMN}
              tasks={tasksByStatus[INVALID_STATE_COLUMN.id] || []}
              onAddTask={handleAddTask}
              isActive={activeColumnId === INVALID_STATE_COLUMN.id && activeTask !== null}
              showSubtasks={userPreferences.showSubtasks}
              isInvalid
            />
          )}
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
    </div>
  );
}
