'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUpDown,
  Calendar,
  FolderOpen,
  Plus,
  Trash2,
  Download,
  CheckSquare,
  XSquare,
  Search,
  X,
  User,
  Filter,
  Paperclip,
  ChevronRight,
} from 'lucide-react';
import { format, parseISO, isPast } from 'date-fns';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { CreateTaskDialog } from '@/components/create-task-dialog';
import { TagBadges } from '@/components/tag-badges';
import { EntityIdBadge } from '@/components/entity-id-badge';
import { VisibilityBadge } from '@/components/visibility-badge';
import { OwnerIndicator } from '@/components/owner-indicator';
import { useAppStore } from '@/store/app-store';
import type { Task } from '@/lib/types';
import { useCollapsedState } from '@/hooks/use-collapsed-state';
import { useIsMobile } from '@/hooks/use-mobile';
import { TaskCardMobile } from '@/components/task-card-mobile';
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
import { Check, ChevronsUpDown } from 'lucide-react';
import {
  TASK_STATUSES,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
  getColumnLabelAndColor,
  type StatusConfig,
} from '@/lib/constants';

type SortField = 'id' | 'title' | 'priority' | 'status' | 'dueDate' | 'project' | 'createdAt' | 'updatedAt';
type SortDirection = 'asc' | 'desc';

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const STATUS_ORDER: Record<string, number> = {
  todo: 0,
  in_progress: 1,
  done: 2,
  cancelled: 3,
};

// SortButton must be defined outside of render
function SortButton({
  field,
  currentSortField,
  onSort,
  children,
}: {
  field: SortField;
  currentSortField: SortField;
  onSort: (field: SortField) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      onClick={() => onSort(field)}
    >
      {children}
      <ArrowUpDown
        className={cn(
          'size-3',
          currentSortField === field && 'text-foreground',
        )}
      />
    </button>
  );
}

function TaskListProjectGroup({
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
    <div>
      <button
        className="w-full flex items-center gap-2 px-4 py-1.5 bg-muted/40 border-b hover:bg-muted/60 transition-colors"
        onClick={onToggleCollapse}
      >
        <ChevronRight className={cn('size-3 shrink-0 transition-transform duration-150', !collapsed && 'rotate-90')} />
        <FolderOpen className="size-3 shrink-0 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground truncate">{projectName}</span>
        <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 tabular-nums">{taskCount}</span>
      </button>
      {!collapsed && children}
    </div>
  );
}

function TaskListProjectGroupWrapper({
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
    <TaskListProjectGroup
      groupKey={groupKey}
      projectName={projectName}
      taskCount={taskCount}
      collapsed={collapsed}
      onToggleCollapse={toggleCollapse}
    >
      {children}
    </TaskListProjectGroup>
  );
}

export function TaskList() {
  const {
    tasks, selectedProjectId, selectTask, deleteTask, projects,
    taskStatusFilter, setTaskStatusFilter, tagFilter, projectFilter, assigneeFilter, setAssigneeFilter, userPreferences,
    fetchTasks, taskSearchQuery, setTaskSearchQuery,
    currentUserId, ownershipFilter, setOwnershipFilter, users, statuses,
  } = useAppStore();
  const [sortField, setSortField] = useState<SortField>('priority');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchInput, setSearchInput] = useState(taskSearchQuery);
  const [assigneeFilterOpen, setAssigneeFilterOpen] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMobile = useIsMobile();

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

  const projectTasksCount = useMemo(() => {
    const base = tasks.filter((t) => !t.parentId);
    return {
      all: base.length,
      active: base.filter((t) => t.status !== 'done' && t.status !== 'cancelled').length,
    };
  }, [tasks]);

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

  // Filter tasks
  const filteredTasks = useMemo(() => {
    let filtered = tasks;
    // Only show top-level tasks
    filtered = filtered.filter((t) => !t.parentId);

    // Filter by projects
    if (projectFilter && projectFilter.length > 0) {
      filtered = filtered.filter((t) =>
        t.projectId != null && projectFilter.includes(t.projectId)
      );
    }

    if (taskStatusFilter === 'active') {
      filtered = filtered.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
    } else if (taskStatusFilter !== 'all') {
      filtered = filtered.filter((t) => t.status === taskStatusFilter);
    }

    // Filter by tags
    if (tagFilter && tagFilter.length > 0) {
      filtered = filtered.filter((t) => {
        if (tagFilter.some((tagId) => (t.tagIds || []).includes(tagId))) return true;
        const childTasks = tasks.filter((st) => st.parentId === t.id);
        return childTasks.some((st) => tagFilter.some((tagId) => (st.tagIds || []).includes(tagId)));
      });
    }

    // Filter by assignee
    if (assigneeFilter && assigneeFilter.length > 0) {
      filtered = filtered.filter((t) => {
        if (t.assigneeId != null && assigneeFilter.includes(t.assigneeId)) return true;
        const childTasks = tasks.filter((st) => st.parentId === t.id);
        return childTasks.some((st) => st.assigneeId != null && assigneeFilter.includes(st.assigneeId));
      });
    }

    // Filter by ownership
    if (ownershipFilter === 'mine') {
      filtered = filtered.filter((t) => t.ownerId === currentUserId);
    } else if (ownershipFilter === 'shared') {
      filtered = filtered.filter((t) => t.ownerId !== currentUserId);
    }

    return filtered;
  }, [tasks, projectFilter, taskStatusFilter, tagFilter, assigneeFilter, ownershipFilter, currentUserId]);

  // Sort tasks
  const sortedTasks = useMemo(() => {
    return [...filteredTasks].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'priority':
          comparison = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
          break;
        case 'status':
          comparison = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
          break;
        case 'dueDate':
          if (!a.dueDate && !b.dueDate) comparison = 0;
          else if (!a.dueDate) comparison = 1;
          else if (!b.dueDate) comparison = -1;
          else comparison = a.dueDate.localeCompare(b.dueDate);
          break;
        case 'project': {
          const projA = a.projectId ? projects.find((p) => p.id === a.projectId)?.name || '' : '';
          const projB = b.projectId ? projects.find((p) => p.id === b.projectId)?.name || '' : '';
          comparison = projA.localeCompare(projB);
          break;
        }
        case 'id':
          comparison = (a.shortIdNum ?? 0) - (b.shortIdNum ?? 0);
          break;
        case 'createdAt':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'updatedAt':
          comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredTasks, sortField, sortDirection, projects]);

  const projectGroups = useMemo(() => {
    if (!userPreferences.groupTasksByProject) return null;
    const groups: { key: string; name: string; tasks: Task[] }[] = [];
    const byProject = new Map<string, Task[]>();
    const noProject: Task[] = [];

    for (const t of sortedTasks) {
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
        groups.push({ key: `tasklist_${p.id}`, name: p.name, tasks: arr });
      }
    }

    if (noProject.length > 0) {
      groups.push({ key: 'tasklist__no_project_', name: 'No Project', tasks: noProject });
    }

    return groups;
  }, [sortedTasks, userPreferences.groupTasksByProject, projects]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Selection handlers
  const toggleTaskSelection = useCallback((taskId: string, checked: boolean) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(taskId);
      } else {
        next.delete(taskId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedTaskIds(new Set(sortedTasks.map((t) => t.id)));
  }, [sortedTasks]);

  const deselectAll = useCallback(() => {
    setSelectedTaskIds(new Set());
  }, []);

  const isAllSelected = sortedTasks.length > 0 && sortedTasks.every((t) => selectedTaskIds.has(t.id));
  const isSomeSelected = sortedTasks.some((t) => selectedTaskIds.has(t.id)) && !isAllSelected;

  // Bulk delete
  const handleBulkDelete = async () => {
    if (selectedTaskIds.size === 0) return;
    setIsDeleting(true);
    try {
      await Promise.all(
        Array.from(selectedTaskIds).map((id) => deleteTask(id))
      );
      setSelectedTaskIds(new Set());
    } finally {
      setIsDeleting(false);
    }
  };

  // Export selected tasks as markdown
  const handleExport = useCallback(() => {
    const selectedTasks = sortedTasks.filter((t) => selectedTaskIds.has(t.id));
    if (selectedTasks.length === 0) return;

    const markdown = selectedTasks
      .map((task) => {
        const project = task.projectId
          ? projects.find((p) => p.id === task.projectId)?.name || ''
          : '';
        const lines = [
          `# ${task.title}`,
          `**Status**: ${getColumnLabelAndColor(statuses, task.status).label}`,
          `**Priority**: ${PRIORITY_LABELS[task.priority] || task.priority}`,
          `**Due**: ${task.dueDate ? format(parseISO(task.dueDate), 'yyyy-MM-dd HH:mm') : 'No due date'}`,
        ];
        if (project) {
          lines.push(`**Project**: ${project}`);
        }
        if (task.description) {
          lines.push('', task.description);
        }
        return lines.join('\n');
      })
      .join('\n\n---\n\n');

    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tasks-export-${format(new Date(), 'yyyy-MM-dd')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [sortedTasks, selectedTaskIds, projects]);

  const renderTaskRow = (task: Task) => {
    const isOverdue =
      task.dueDate &&
      isPast(parseISO(task.dueDate)) &&
      task.status !== 'done' &&
      task.status !== 'cancelled';
    const project = task.projectId
      ? projects.find((p) => p.id === task.projectId)
      : null;
    const isSelected = selectedTaskIds.has(task.id);
    const subtasks = task.subtasks ?? [];

    return (
      <div key={task.id}>
        <motion.div
          layout
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.15 }}
          className={cn(
            'grid grid-cols-[auto_1fr_80px_80px_100px_100px_90px_80px_80px] gap-2 px-4 py-3 border-b items-center',
            'hover:bg-muted/30 cursor-pointer transition-colors',
            isSelected && 'bg-primary/5 border-l-2 border-l-primary',
            subtasks.length === 0 && 'last:border-b-0',
          )}
          onClick={() => selectTask(task.id)}
        >
          <div className="w-8" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => toggleTaskSelection(task.id, !!checked)}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm truncate">
                {task.title}
              </span>
              <EntityIdBadge id={task.id} shortId={task.shortId || 'T-?'} type="task" />
              {(task._count?.attachments ?? 0) > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                  <Paperclip className="size-3" />
                  {task._count!.attachments}
                </span>
              )}
              <VisibilityBadge visibility={task.visibility} visibleUserIds={task.visibleUserIds} users={users} />
              <OwnerIndicator ownerId={task.ownerId} currentUserId={currentUserId} />
            </div>
            {task.tagIds && task.tagIds.length > 0 && (
              <div className="mt-0.5">
                <TagBadges tagIds={task.tagIds} max={2} size="sm" />
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: PRIORITY_COLORS[task.priority] }}
            />
            <span className="text-xs text-muted-foreground">
              {PRIORITY_LABELS[task.priority]}
            </span>
          </div>
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 h-5 font-normal w-fit"
            style={{
              borderColor: getColumnLabelAndColor(statuses, task.status).color + '60',
              color: getColumnLabelAndColor(statuses, task.status).color,
            }}
          >
            {getColumnLabelAndColor(statuses, task.status).label}
          </Badge>
          {task.dueDate ? (
            <span
              className={cn(
                'text-xs flex items-center gap-1',
                isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground',
              )}
            >
              <Calendar className="size-3" />
              {format(parseISO(task.dueDate), 'MMM d, HH:mm')}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          {project ? (
            <span className="text-xs text-muted-foreground flex items-center gap-1 truncate">
              <FolderOpen className="size-3 shrink-0" />
              {project.name}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          {task.assignee ? (
            <span className="text-xs text-muted-foreground flex items-center gap-1 truncate">
              {task.assignee.image ? (
                <img src={task.assignee.image} alt="" className="size-3 rounded-full shrink-0" />
              ) : (
                <User className="size-3 shrink-0" />
              )}
              <span className="truncate">{task.assignee.name || task.assignee.email}</span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          <span className="text-xs text-muted-foreground">
            {format(parseISO(task.createdAt), 'MMM d')}
          </span>
          <span className="text-xs text-muted-foreground">
            {format(parseISO(task.updatedAt), 'MMM d')}
          </span>
        </motion.div>

        {userPreferences.showSubtasks && subtasks.length > 0 && subtasks.map((subtask, idx) => (
          <motion.div
            key={subtask.id}
            layout
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.12 }}
            className={cn(
              'grid grid-cols-[auto_1fr_80px_80px_100px_100px_90px_80px_80px] gap-2 pl-10 pr-4 py-2 border-b items-center',
              'hover:bg-muted/20 cursor-pointer transition-colors',
              'bg-muted/10',
              idx === subtasks.length - 1 && 'last:border-b-0',
            )}
            onClick={() => selectTask(subtask.id)}
          >
            <div className="w-4" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: PRIORITY_COLORS[subtask.priority] || '#94a3b8' }}
                />
                <span className={cn(
                  'text-xs truncate',
                  subtask.status === 'done' && 'line-through text-muted-foreground',
                )}>
                  {subtask.title}
                </span>
                <EntityIdBadge id={subtask.id} shortId={subtask.shortId || 'T-?'} type="task" className="text-[9px]" />
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: PRIORITY_COLORS[subtask.priority] || '#94a3b8' }}
              />
              <span className="text-[10px] text-muted-foreground">
                {PRIORITY_LABELS[subtask.priority] || subtask.priority}
              </span>
            </div>
            <Badge
              variant="outline"
              className="text-[9px] px-1 h-4 font-normal w-fit"
              style={{
                borderColor: getColumnLabelAndColor(statuses, subtask.status).color + '60',
                color: getColumnLabelAndColor(statuses, subtask.status).color,
              }}
            >
              {getColumnLabelAndColor(statuses, subtask.status).label}
            </Badge>
            {subtask.dueDate ? (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Calendar className="size-2.5" />
                {format(parseISO(subtask.dueDate), 'MMM d')}
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground">—</span>
            )}
            <span className="text-[10px] text-muted-foreground">—</span>
            {subtask.assignee ? (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1 truncate">
                {subtask.assignee.image ? (
                  <img src={subtask.assignee.image} alt="" className="size-2.5 rounded-full shrink-0" />
                ) : (
                  <User className="size-2.5 shrink-0" />
                )}
                <span className="truncate">{subtask.assignee.name || subtask.assignee.email}</span>
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground">—</span>
            )}
            <span className="text-[10px] text-muted-foreground">—</span>
            <span className="text-[10px] text-muted-foreground">—</span>
          </motion.div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Floating action bar when tasks are selected */}
      <AnimatePresence>
        {selectedTaskIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-3 rounded-lg border bg-primary/5 border-primary/20 px-4 py-2.5"
          >
            <span className="text-sm font-medium text-primary">
              {selectedTaskIds.size} selected
            </span>
            <div className="h-4 w-px bg-border" />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleBulkDelete}
              disabled={isDeleting}
            >
              <Trash2 className="size-3 mr-1" />
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs hover:bg-primary/10"
              onClick={handleExport}
            >
              <Download className="size-3 mr-1" />
              Export
            </Button>
            <div className="flex-1" />
            {isAllSelected ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={deselectAll}
              >
                <XSquare className="size-3 mr-1" />
                Deselect All
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={selectAll}
              >
                <CheckSquare className="size-3 mr-1" />
                Select All
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter tabs */}
      <div className={cn('flex items-center gap-2', isMobile ? 'flex-col' : 'flex-wrap')}>
        <div className={cn('flex items-center gap-2', isMobile && 'w-full overflow-x-auto pb-1')}>
          <Button
            variant={taskStatusFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs shrink-0"
            onClick={() => setTaskStatusFilter('all')}
          >
            All ({projectTasksCount.all})
          </Button>
          <Button
            variant={taskStatusFilter === 'active' ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs shrink-0"
            onClick={() => setTaskStatusFilter('active')}
          >
            Active ({projectTasksCount.active})
          </Button>
          {TASK_STATUSES.map((status) => {
            const count = tasks.filter(
              (t) =>
                t.status === status &&
                !t.parentId &&
                (!selectedProjectId || t.projectId === selectedProjectId),
            ).length;
            return (
              <Button
                key={status}
                variant={taskStatusFilter === status ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs gap-1.5 shrink-0"
                onClick={() => setTaskStatusFilter(status)}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: getColumnLabelAndColor(statuses, status).color }}
                />
                {getColumnLabelAndColor(statuses, status).label} ({count})
              </Button>
            );
          })}

          {/* Assignee filter */}
          {uniqueAssignees.length > 0 && (
            <Popover open={assigneeFilterOpen} onOpenChange={setAssigneeFilterOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant={assigneeFilter.length > 0 ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs gap-1 shrink-0"
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
        </div>

        <div className={cn('flex items-center gap-2', isMobile ? 'w-full' : 'flex-1 justify-end')}>
          {!isMobile && <div className="flex-1" />}
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
          <div className={cn('relative', isMobile ? 'flex-1' : 'w-56')}>
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search tasks..."
              className="h-7 text-xs pl-7 pr-7 w-full"
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
          <Button size="sm" onClick={() => setCreateDialogOpen(true)} className="h-7 text-xs shrink-0">
            <Plus className="size-3 mr-1" /> Add Task
          </Button>
        </div>
      </div>

      {/* Mobile card layout */}
      {isMobile ? (
        <div className="max-h-[calc(100vh-300px)] overflow-y-auto custom-scrollbar">
          {sortedTasks.length > 0 ? (
            projectGroups ? (
              projectGroups.map((group) => (
                <div key={group.key}>
                  <div className="flex items-center gap-2 px-1 py-1.5">
                    <FolderOpen className="size-3 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">{group.name}</span>
                    <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">{group.tasks.length}</span>
                  </div>
                  <div className="space-y-2">
                    {group.tasks.map((task) => (
                      <TaskCardMobile key={task.id} task={task} />
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="space-y-2">
                {sortedTasks.map((task) => (
                  <TaskCardMobile key={task.id} task={task} />
                ))}
              </div>
            )
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              <p className="text-sm">No tasks found</p>
              <p className="text-xs mt-1">Create a task to get started</p>
            </div>
          )}
        </div>
      ) : (
        /* Desktop table layout */
        <div className="border rounded-lg overflow-hidden">
          <div className="grid grid-cols-[auto_1fr_80px_80px_100px_100px_90px_80px_80px] gap-2 px-4 py-2 bg-muted/50 border-b text-xs font-medium text-muted-foreground">
            <div className="w-8 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={isAllSelected ? true : isSomeSelected ? 'indeterminate' : false}
                onCheckedChange={(checked) => {
                  if (checked) {
                    selectAll();
                  } else {
                    deselectAll();
                  }
                }}
              />
            </div>
            <SortButton field="title" currentSortField={sortField} onSort={handleSort}>Title</SortButton>
            <SortButton field="priority" currentSortField={sortField} onSort={handleSort}>Priority</SortButton>
            <SortButton field="status" currentSortField={sortField} onSort={handleSort}>Status</SortButton>
            <SortButton field="dueDate" currentSortField={sortField} onSort={handleSort}>Due Date</SortButton>
            <SortButton field="project" currentSortField={sortField} onSort={handleSort}>Project</SortButton>
            <span className="text-xs font-medium text-muted-foreground">Assignee</span>
            <SortButton field="createdAt" currentSortField={sortField} onSort={handleSort}>Created</SortButton>
            <SortButton field="updatedAt" currentSortField={sortField} onSort={handleSort}>Updated</SortButton>
          </div>

          {/* Task rows */}
          <div className="max-h-[calc(100vh-360px)] overflow-y-auto custom-scrollbar">
            <AnimatePresence mode="popLayout">
              {sortedTasks.length > 0 ? (
                projectGroups ? (
                  projectGroups.map((group) => (
                    <TaskListProjectGroupWrapper key={group.key} groupKey={group.key} projectName={group.name} taskCount={group.tasks.length}>
                      {group.tasks.map((task) => renderTaskRow(task))}
                    </TaskListProjectGroupWrapper>
                  ))
                ) : (
                  sortedTasks.map(renderTaskRow)
                )
              ) : (
                <div className="py-12 text-center text-muted-foreground">
                  <p className="text-sm">No tasks found</p>
                  <p className="text-xs mt-1">Create a task to get started</p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      <CreateTaskDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
    </div>
  );
}
