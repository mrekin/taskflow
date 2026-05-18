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
import { Plus, Search, X, ArrowUpDown, AlertTriangle, User, Filter, Check, ChevronsUpDown, ChevronRight, FolderOpen, ChevronDown, Share2 } from 'lucide-react';

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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EntityIdBadge } from '@/components/entity-id-badge';
import { TagBadges } from '@/components/tag-badges';
import { TaskCard } from '@/components/task-card';
import { CreateTaskDialog } from '@/components/create-task-dialog';
import { useAppStore } from '@/store/app-store';
import { useCollapsedState } from '@/hooks/use-collapsed-state';
import { useIsMobile } from '@/hooks/use-mobile';
import { OwnerIndicator } from '@/components/owner-indicator';
import { INVALID_STATE_COLUMN, TASK_PRIORITIES, PRIORITY_LABELS, PRIORITY_COLORS, getColumnLabelAndColor, type StatusConfig } from '@/lib/constants';
import type { Task } from '@/lib/types';
import type { Project } from '@/lib/types';

type KanbanSortField = 'id' | 'priority' | 'createdAt' | 'updatedAt' | 'title';
type KanbanSortDirection = 'asc' | 'desc';

function KanbanProjectGroup({
  groupKey,
  projectName,
  taskCount,
  collapsed,
  onToggleCollapse,
  children,
}: {
  groupKey: string;
  projectName: string;
  taskCount: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1">
      <button
        className="w-full flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-muted/60 text-xs font-medium text-muted-foreground transition-colors"
        onClick={onToggleCollapse}
      >
        <ChevronRight className={cn('size-3 shrink-0 transition-transform duration-150', !collapsed && 'rotate-90')} />
        <FolderOpen className="size-3 shrink-0" />
        <span className="truncate">{projectName}</span>
        <span className="ml-auto text-[10px] bg-muted rounded-full px-1.5 py-0.5 tabular-nums">{taskCount}</span>
      </button>
      {!collapsed && <div className="mt-1">{children}</div>}
    </div>
  );
}

function KanbanProjectGroupWrapper({
  groupKey,
  projectName,
  taskCount,
  children,
}: {
  groupKey: string;
  projectName: string;
  taskCount: number;
  children: React.ReactNode;
}) {
  const [collapsed, toggleCollapse] = useCollapsedState(groupKey);
  return (
    <KanbanProjectGroup
      groupKey={groupKey}
      projectName={projectName}
      taskCount={taskCount}
      collapsed={collapsed}
      onToggleCollapse={toggleCollapse}
    >
      {children}
    </KanbanProjectGroup>
  );
}

interface KanbanColumnProps {
  column: StatusConfig;
  tasks: Task[];
  onAddTask: (status: string) => void;
  isActive: boolean;
  showSubtasks: boolean;
  isInvalid?: boolean;
  groupTasksByProject?: boolean;
  projects?: Project[];
}

function KanbanColumn({ column, tasks, onAddTask, isActive, showSubtasks, isInvalid, groupTasksByProject, projects }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: {
      type: 'column',
      status: column.id,
    },
  });

  const projectGroups = useMemo(() => {
    if (!groupTasksByProject || !projects) return null;
    const groups: { key: string; name: string; tasks: Task[] }[] = [];
    const byProject = new Map<string, Task[]>();
    const noProject: Task[] = [];

    for (const t of tasks) {
      if (t.projectId) {
        const arr = byProject.get(t.projectId) ?? [];
        arr.push(t);
        byProject.set(t.projectId, arr);
      } else {
        noProject.push(t);
      }
    }

    for (const p of projects) {
      const arr = byProject.get(p.id);
      if (arr) {
        groups.push({ key: `kanban_${column.id}_${p.id}`, name: p.name, tasks: arr });
      }
    }

    if (noProject.length > 0) {
      groups.push({ key: `kanban_${column.id}__no_project_`, name: 'No Project', tasks: noProject });
    }

    return groups;
  }, [tasks, groupTasksByProject, projects, column.id]);

  const renderTask = (task: Task) => (
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
  );

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
            {projectGroups ? (
              projectGroups.map((group) => (
                <KanbanProjectGroupWrapper
                  key={group.key}
                  groupKey={group.key}
                  projectName={group.name}
                  taskCount={group.tasks.length}
                >
                  {group.tasks.map(renderTask)}
                </KanbanProjectGroupWrapper>
              ))
            ) : (
              tasks.map(renderTask)
            )}
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

function MobileTaskCard({ task, visibleColumns, isSubtask = false }: { task: Task; visibleColumns: StatusConfig[]; isSubtask?: boolean }) {
  const { selectTask, updateTask, statuses, currentUserId, users } = useAppStore();
  const { label: statusLabel, color: statusColor } = getColumnLabelAndColor(statuses, task.status);
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'done' && task.status !== 'cancelled';

  const handleStatusChange = (newStatus: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (newStatus === task.status) return;
    useAppStore.setState((state) => ({
      tasks: state.tasks.map((t) => t.id === task.id ? { ...t, status: newStatus } : t),
    }));
    updateTask(task.id, { status: newStatus });
  };

  if (isSubtask) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 px-2.5 py-2 rounded-md cursor-pointer transition-all duration-200 active:scale-[0.98]',
          'ml-4 border-l-2 bg-muted/30',
          task.status === 'done' && 'opacity-60',
        )}
        style={{ borderLeftColor: statusColor }}
        onClick={() => selectTask(task.id)}
      >
        <span
          className="shrink-0 w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: PRIORITY_COLORS[task.priority] || '#94a3b8' }}
        />
        <span className={cn(
          'text-xs leading-tight truncate flex-1',
          task.status === 'done' && 'line-through text-muted-foreground',
        )}>
          {task.title}
        </span>
        {task.ownerId !== currentUserId && (
          <Share2 className="size-3 shrink-0 text-muted-foreground" />
        )}
        <EntityIdBadge id={task.id} shortId={task.shortId || 'T-?'} type="task" className="shrink-0 text-[9px]" />
        <Badge
          variant="outline"
          className="text-[9px] px-1 py-0 h-4 font-normal shrink-0"
          style={{ borderColor: statusColor + '60', color: statusColor }}
        >
          {task.status === 'done' ? '✓' : task.status === 'in_progress' ? '►' : '●'}
        </Badge>
      </div>
    );
  }

  return (
    <Card
      className="cursor-pointer py-0 gap-1.5 border-l-4 transition-all duration-200 active:scale-[0.98]"
      style={{ borderLeftColor: statusColor }}
      onClick={() => selectTask(task.id)}
    >
      <div className="p-2.5 space-y-1.5">
        <div className="flex items-start gap-1.5">
          <span className="text-sm font-medium leading-tight line-clamp-2 flex-1">
            {task.title}
          </span>
          <EntityIdBadge id={task.id} shortId={task.shortId || 'T-?'} type="task" className="shrink-0 text-[9px]" />
          <span
            className="shrink-0 w-2 h-2 rounded-full mt-1.5"
            style={{ backgroundColor: PRIORITY_COLORS[task.priority] || '#94a3b8' }}
            title={PRIORITY_LABELS[task.priority] || task.priority}
          />
        </div>

        <OwnerIndicator ownerId={task.ownerId} currentUserId={currentUserId} />

        <div className="flex items-center gap-1.5 flex-wrap">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-normal border transition-colors hover:bg-accent shrink-0"
                style={{ borderColor: statusColor + '60', color: statusColor }}
                onClick={(e) => e.stopPropagation()}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: statusColor }} />
                {statusLabel}
                <ChevronDown className="size-2.5 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[140px]" onClick={(e) => e.stopPropagation()}>
              {visibleColumns.map((col) => (
                <DropdownMenuItem
                  key={col.id}
                  className={cn('gap-2 text-xs', col.id === task.status && 'font-medium')}
                  onClick={(e) => handleStatusChange(col.id, e)}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: col.color }} />
                  {col.label}
                  {col.id === task.status && <Check className="size-3 ml-auto" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {task.dueDate && (
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] px-1.5 py-0 h-5 gap-1 font-normal',
                isOverdue && 'border-red-300 text-red-600 bg-red-50 dark:bg-red-950/30',
              )}
            >
              {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </Badge>
          )}

          {(task._count?.subtasks ?? task.subtasks?.length ?? 0) > 0 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-1 font-normal">
              {task.completedSubtasks ?? task.subtasks?.filter((s) => s.status === 'done').length ?? 0}/{task._count?.subtasks ?? task.subtasks?.length ?? 0}
            </Badge>
          )}

          {task.tagIds && task.tagIds.length > 0 && (
            <TagBadges tagIds={task.tagIds} max={2} size="sm" />
          )}
        </div>
      </div>
    </Card>
  );
}

export function KanbanBoard() {
  const { tasks, selectedProjectId, tagFilter, projectFilter, assigneeFilter, setAssigneeFilter, updateTask, userPreferences, fetchTasks, taskSearchQuery, setTaskSearchQuery, statuses, currentUserId, ownershipFilter, setOwnershipFilter, projects } = useAppStore();
  const isMobile = useIsMobile();
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [defaultStatus, setDefaultStatus] = useState<string>('todo');
  const [searchInput, setSearchInput] = useState(taskSearchQuery);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sortField, setSortField] = useState<KanbanSortField>('id');
  const [sortDirection, setSortDirection] = useState<KanbanSortDirection>('asc');
  const [assigneeFilterOpen, setAssigneeFilterOpen] = useState(false);
  const [activeColumnIndex, setActiveColumnIndex] = useState(0);

  const visibleColumns = useMemo(() => statuses.filter((c) => c.visible), [statuses]);
  const allColumnIds = useMemo(() => new Set(statuses.map((c) => c.id)), [statuses]);

  useEffect(() => {
    setActiveColumnIndex(0);
  }, [visibleColumns.map((c) => c.id).join(',')]);

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
      filtered = filtered.filter((t) => {
        if (tagFilter.some((tagId) => (t.tagIds || []).includes(tagId))) return true;
        const childTasks = tasks.filter((st) => st.parentId === t.id);
        return childTasks.some((st) => tagFilter.some((tagId) => (st.tagIds || []).includes(tagId)));
      });
    }

    if (assigneeFilter && assigneeFilter.length > 0) {
      filtered = filtered.filter((t) => {
        if (t.assigneeId != null && assigneeFilter.includes(t.assigneeId)) return true;
        const childTasks = tasks.filter((st) => st.parentId === t.id);
        return childTasks.some((st) => st.assigneeId != null && assigneeFilter.includes(st.assigneeId));
      });
    }

    if (ownershipFilter === 'mine') {
      filtered = filtered.filter((t) => t.ownerId === currentUserId);
    } else if (ownershipFilter === 'shared') {
      filtered = filtered.filter((t) => t.ownerId !== currentUserId);
    }

    return filtered;
  }, [tasks, projectFilter, tagFilter, assigneeFilter, ownershipFilter, currentUserId]);

  const uniqueAssignees = useMemo(() => {
    const map = new Map<string, { id: string; name: string | null; email: string | null }>();
    for (const t of tasks) {
      if (t.assigneeId && t.assignee && !map.has(t.assigneeId)) {
        map.set(t.assigneeId, { id: t.assigneeId, name: t.assignee.name, email: t.assignee.email });
      }
      if (t.subtasks) {
        for (const s of t.subtasks) {
          if (s.assigneeId && s.assignee && !map.has(s.assigneeId)) {
            map.set(s.assigneeId, { id: s.assigneeId, name: s.assignee.name, email: s.assignee.email });
          }
        }
      }
    }
    return Array.from(map.values());
  }, [tasks]);

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

  const allMobileColumns = useMemo(() => {
    const cols = [...visibleColumns];
    if (hasInvalidTasks) cols.push(INVALID_STATE_COLUMN);
    return cols;
  }, [visibleColumns, hasInvalidTasks]);

  // Swipe state
  const swipeContainerRef = useRef<HTMLDivElement>(null);
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const swipeStartXRef = useRef(0);
  const swipeStartYRef = useRef(0);
  const isVerticalRef = useRef(false);
  const swipeDeltaRef = useRef(0);
  const swipeTargetRef = useRef(-1);
  const snapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [swipeDelta, setSwipeDelta] = useState(0);
  const [swipePhase, setSwipePhase] = useState<'idle' | 'dragging' | 'snapping' | 'resetting'>('idle');

  const activeColumnIndexRef = useRef(0);
  const allMobileColumnsLengthRef = useRef(allMobileColumns.length);
  activeColumnIndexRef.current = activeColumnIndex;
  allMobileColumnsLengthRef.current = allMobileColumns.length;

  useEffect(() => {
    const el = mobileScrollRef.current;
    if (!el || !isMobile) return;

    const onTouchStart = (e: TouchEvent) => {
      if (snapTimeoutRef.current) {
        clearTimeout(snapTimeoutRef.current);
        snapTimeoutRef.current = null;
      }
      swipeStartXRef.current = e.touches[0].clientX;
      swipeStartYRef.current = e.touches[0].clientY;
      isVerticalRef.current = false;
      swipeDeltaRef.current = 0;
      swipeTargetRef.current = -1;
      setSwipeDelta(0);
      setSwipePhase('idle');
    };

    const onTouchMove = (e: TouchEvent) => {
      const dx = e.touches[0].clientX - swipeStartXRef.current;
      const dy = e.touches[0].clientY - swipeStartYRef.current;

      if (!isVerticalRef.current && Math.abs(dx) < 30 && Math.abs(dy) < 30) return;

      if (!isVerticalRef.current && Math.abs(dy) > Math.abs(dx)) {
        isVerticalRef.current = true;
        return;
      }
      if (isVerticalRef.current) return;

      e.preventDefault();

      if (swipeTargetRef.current < 0) {
        if (dx < 0 && activeColumnIndexRef.current < allMobileColumnsLengthRef.current - 1) {
          swipeTargetRef.current = activeColumnIndexRef.current + 1;
        } else if (dx > 0 && activeColumnIndexRef.current > 0) {
          swipeTargetRef.current = activeColumnIndexRef.current - 1;
        }
      }

      const delta = swipeTargetRef.current < 0 ? dx * 0.2 : dx;
      swipeDeltaRef.current = delta;
      setSwipeDelta(delta);
      setSwipePhase('dragging');
    };

    const onTouchEnd = () => {
      const delta = swipeDeltaRef.current;

      if (Math.abs(delta) < 30) {
        swipeTargetRef.current = -1;
        swipeDeltaRef.current = 0;
        setSwipeDelta(0);
        setSwipePhase('idle');
        return;
      }

      const width = swipeContainerRef.current?.clientWidth ?? 300;
      const threshold = width * 0.15;

      setSwipePhase('snapping');

      if (Math.abs(delta) > threshold && swipeTargetRef.current >= 0) {
        const snapDelta = delta > 0 ? width : -width;
        setSwipeDelta(snapDelta);
        snapTimeoutRef.current = setTimeout(() => {
          snapTimeoutRef.current = null;
          setSwipePhase('resetting');
          setActiveColumnIndex(swipeTargetRef.current);
          swipeTargetRef.current = -1;
          swipeDeltaRef.current = 0;
          setSwipeDelta(0);
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setSwipePhase('idle');
            });
          });
        }, 260);
      } else {
        swipeTargetRef.current = -1;
        swipeDeltaRef.current = 0;
        setSwipeDelta(0);
        snapTimeoutRef.current = setTimeout(() => {
          snapTimeoutRef.current = null;
          setSwipePhase('idle');
        }, 260);
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [isMobile]);

  const activeColTasks = allMobileColumns[activeColumnIndex]
    ? tasksByStatus[allMobileColumns[activeColumnIndex].id] || []
    : [];

  const buildMobileProjectGroups = useCallback((colId: string, colTasks: Task[]) => {
    if (!userPreferences.groupTasksByProject || !projects) return null;
    const groups: { key: string; name: string; tasks: Task[] }[] = [];
    const byProject = new Map<string, Task[]>();
    const noProject: Task[] = [];

    for (const t of colTasks) {
      if (t.projectId) {
        const arr = byProject.get(t.projectId) ?? [];
        arr.push(t);
        byProject.set(t.projectId, arr);
      } else {
        noProject.push(t);
      }
    }

    for (const p of projects) {
      const arr = byProject.get(p.id);
      if (arr) {
        groups.push({ key: `kanban_mobile_${colId}_${p.id}`, name: p.name, tasks: arr });
      }
    }

    if (noProject.length > 0) {
      groups.push({ key: `kanban_mobile_${colId}__no_project_`, name: 'No Project', tasks: noProject });
    }

    return groups;
  }, [userPreferences.groupTasksByProject, projects]);

  const activeColProjectGroups = useMemo(
    () => buildMobileProjectGroups(allMobileColumns[activeColumnIndex]?.id ?? '', activeColTasks),
    [buildMobileProjectGroups, allMobileColumns, activeColumnIndex, activeColTasks],
  );

  const renderMobileTask = (task: Task) => (
    <div key={task.id}>
      <MobileTaskCard task={task} visibleColumns={visibleColumns} />
      {userPreferences.showSubtasks && (task.subtasks ?? []).length > 0 && (
        <div className="mt-1 space-y-0.5 ml-2">
          {(task.subtasks ?? []).map((subtask) => (
            <MobileTaskCard key={subtask.id} task={subtask} visibleColumns={visibleColumns} isSubtask />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className={cn('h-full', isMobile ? 'flex flex-col' : 'flex flex-col gap-4 md:p-6')}>
      <div className={cn('flex items-center gap-2 justify-end shrink-0', isMobile && 'flex-wrap px-3 pt-3')}>
        <div className="flex items-center gap-1">
          <Button
            variant={ownershipFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs px-2"
            onClick={() => setOwnershipFilter('all')}
          >
            All
          </Button>
          <Button
            variant={ownershipFilter === 'mine' ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs px-2"
            onClick={() => setOwnershipFilter('mine')}
          >
            Mine
          </Button>
          <Button
            variant={ownershipFilter === 'shared' ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs px-2"
            onClick={() => setOwnershipFilter('shared')}
          >
            Shared
          </Button>
        </div>
        {uniqueAssignees.length > 0 && (
          <Popover open={assigneeFilterOpen} onOpenChange={setAssigneeFilterOpen}>
            <PopoverTrigger asChild>
              <Button
                variant={assigneeFilter.length > 0 ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs gap-1"
              >
                <User className="size-3" />
                Assignee
                {assigneeFilter.length > 0 && ` (${assigneeFilter.length})`}
                <ChevronsUpDown className="size-3 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search assignee..." />
                <CommandList onWheel={(e) => e.stopPropagation()}>
                  <CommandEmpty>No assignee found.</CommandEmpty>
                  <CommandGroup>
                    {uniqueAssignees.map((assignee) => (
                      <CommandItem
                        key={assignee.id}
                        value={`${assignee.name || ''} ${assignee.email || ''}`}
                        onSelect={() => {
                          const next = assigneeFilter.includes(assignee.id)
                            ? assigneeFilter.filter((id) => id !== assignee.id)
                            : [...assigneeFilter, assignee.id];
                          setAssigneeFilter(next);
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 size-4 shrink-0',
                            assigneeFilter.includes(assignee.id) ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <span className="truncate">{assignee.name || assignee.email}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
        <div className={cn('relative', isMobile ? 'w-full' : 'w-56')}>
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
        {!isMobile && (
          <>
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
          </>
        )}
      </div>

      {isMobile ? (
        <div
          className="flex flex-col flex-1 min-h-0"
        >
          <div className="flex border-b overflow-x-auto shrink-0">
            {allMobileColumns.map((col, idx) => (
              <button
                key={col.id}
                className={cn(
                  'px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                  idx === activeColumnIndex
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
                onClick={() => setActiveColumnIndex(idx)}
              >
                <span className="flex items-center gap-1.5">
                  {col.id === INVALID_STATE_COLUMN.id ? (
                    <AlertTriangle className="size-3 shrink-0" />
                  ) : (
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: col.color }}
                    />
                  )}
                  {col.label}
                  <span className="text-xs text-muted-foreground">
                    ({(tasksByStatus[col.id] || []).length})
                  </span>
                </span>
              </button>
            ))}
          </div>

          <div
            ref={swipeContainerRef}
            className="relative flex-1 min-h-0 overflow-hidden"
            style={{ touchAction: 'pan-y' }}
          >
            {/* Current column */}
            <div
              className="h-full"
              style={{
                transform: `translateX(${swipeDelta}px)`,
                transition: (swipePhase === 'dragging' || swipePhase === 'resetting') ? 'none' : 'transform 0.25s ease-out',
              }}
            >
              <div ref={mobileScrollRef} className="overflow-auto p-3 h-full" style={{ touchAction: 'pan-y' }}>
                <div className="space-y-2 min-h-full">
                <AnimatePresence mode="popLayout">
                  {activeColProjectGroups ? (
                    activeColProjectGroups.map((group) => (
                      <KanbanProjectGroupWrapper
                        key={group.key}
                        groupKey={group.key}
                        projectName={group.name}
                        taskCount={group.tasks.length}
                      >
                        {group.tasks.map(renderMobileTask)}
                      </KanbanProjectGroupWrapper>
                    ))
                  ) : (
                    activeColTasks.map(renderMobileTask)
                  )}
                </AnimatePresence>
                {activeColTasks.length === 0 && (
                  <div className="py-8 text-center text-muted-foreground text-sm">
                    {allMobileColumns[activeColumnIndex]?.id === INVALID_STATE_COLUMN.id
                      ? 'No invalid tasks'
                      : 'No tasks'}
                  </div>
                )}
                </div>
              </div>
            </div>

            {/* Adjacent column */}
            {swipePhase !== 'idle' && swipeTargetRef.current >= 0 && (() => {
              const adjIdx = swipeTargetRef.current;
              const adjCol = allMobileColumns[adjIdx];
              if (!adjCol) return null;
              const adjTasks = tasksByStatus[adjCol.id] || [];
              const adjProjectGroups = buildMobileProjectGroups(adjCol.id, adjTasks);
              const w = swipeContainerRef.current?.clientWidth ?? 0;
              const base = adjIdx > activeColumnIndex ? w : -w;
              return (
                <div
                  className="absolute top-0 left-0 right-0 bottom-0"
                  style={{
                    transform: `translateX(${base + swipeDelta}px)`,
                    transition: (swipePhase === 'dragging' || swipePhase === 'resetting') ? 'none' : 'transform 0.25s ease-out',
                  }}
                >
                  <div className="overflow-auto p-3 h-full" style={{ touchAction: 'pan-y' }}>
                    <div className="space-y-2 min-h-full">
                    <AnimatePresence mode="popLayout">
                      {adjProjectGroups ? (
                        adjProjectGroups.map((group) => (
                          <KanbanProjectGroupWrapper
                            key={group.key}
                            groupKey={group.key}
                            projectName={group.name}
                            taskCount={group.tasks.length}
                          >
                            {group.tasks.map(renderMobileTask)}
                          </KanbanProjectGroupWrapper>
                        ))
                      ) : (
                        adjTasks.map(renderMobileTask)
                      )}
                    </AnimatePresence>
                    {adjTasks.length === 0 && (
                      <div className="py-8 text-center text-muted-foreground text-sm">No tasks</div>
                    )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {allMobileColumns[activeColumnIndex]?.id !== INVALID_STATE_COLUMN.id && (
            <div className="p-3 pt-0 pb-14">
              <Button
                variant="ghost"
                className="w-full justify-start text-muted-foreground hover:text-foreground h-9"
                onClick={() => handleAddTask(allMobileColumns[activeColumnIndex]?.id || 'todo')}
              >
                <Plus className="size-4 mr-2" /> Add task
              </Button>
            </div>
          )}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="flex gap-4 overflow-x-auto pb-4 flex-1 min-h-0 custom-scrollbar-horizontal">
            {visibleColumns.map((col) => (
              <KanbanColumn
                key={col.id}
                column={col}
                tasks={tasksByStatus[col.id] || []}
                onAddTask={handleAddTask}
                isActive={activeColumnId === col.id && activeTask !== null}
                showSubtasks={userPreferences.showSubtasks}
                groupTasksByProject={userPreferences.groupTasksByProject}
                projects={projects}
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
      )}

      <CreateTaskDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        defaultStatus={defaultStatus}
      />
    </div>
  );
}
