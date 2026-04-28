'use client';

import { useState, useMemo, useCallback } from 'react';
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
} from 'lucide-react';
import { format, parseISO, isPast } from 'date-fns';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CreateTaskDialog } from '@/components/create-task-dialog';
import { TaskDetailDialog } from '@/components/task-detail-dialog';
import { TagBadges } from '@/components/tag-badges';
import { EntityIdBadge } from '@/components/entity-id-badge';
import { useAppStore } from '@/store/app-store';
import {
  TASK_STATUSES,
  STATUS_LABELS,
  STATUS_COLORS,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
} from '@/lib/constants';

type SortField = 'title' | 'priority' | 'status' | 'dueDate' | 'project';
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

export function TaskList() {
  const { tasks, selectedProjectId, selectTask, deleteTask, projects, taskStatusFilter, setTaskStatusFilter, tagFilter } = useAppStore();
  const [sortField, setSortField] = useState<SortField>('priority');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    let filtered = tasks;
    if (selectedProjectId) {
      filtered = filtered.filter((t) => t.projectId === selectedProjectId);
    }
    // Only show top-level tasks
    filtered = filtered.filter((t) => !t.parentId);

    if (taskStatusFilter !== 'all') {
      filtered = filtered.filter((t) => t.status === taskStatusFilter);
    }

    // Filter by tags
    if (tagFilter && tagFilter.length > 0) {
      filtered = filtered.filter((t) =>
        tagFilter.some((tagId) => (t.tagIds || []).includes(tagId))
      );
    }

    return filtered;
  }, [tasks, selectedProjectId, taskStatusFilter, tagFilter]);

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
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredTasks, sortField, sortDirection, projects]);

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
          `**Status**: ${STATUS_LABELS[task.status] || task.status}`,
          `**Priority**: ${PRIORITY_LABELS[task.priority] || task.priority}`,
          `**Due**: ${task.dueDate ? format(parseISO(task.dueDate), 'yyyy-MM-dd') : 'No due date'}`,
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
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant={taskStatusFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          className="h-7 text-xs"
          onClick={() => setTaskStatusFilter('all')}
        >
          All ({tasks.filter((t) => !t.parentId && (!selectedProjectId || t.projectId === selectedProjectId)).length})
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
              className="h-7 text-xs gap-1.5"
              onClick={() => setTaskStatusFilter(status)}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: STATUS_COLORS[status] }}
              />
              {STATUS_LABELS[status]} ({count})
            </Button>
          );
        })}
        <div className="flex-1" />
        <Button size="sm" onClick={() => setCreateDialogOpen(true)} className="h-7 text-xs">
          <Plus className="size-3 mr-1" /> Add Task
        </Button>
      </div>

      {/* Table header */}
      <div className="border rounded-lg overflow-hidden">
        <div className="grid grid-cols-[auto_1fr_100px_100px_120px_120px] gap-2 px-4 py-2 bg-muted/50 border-b text-xs font-medium text-muted-foreground">
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
        </div>

        {/* Task rows */}
        <ScrollArea className="max-h-[calc(100vh-360px)]">
          <AnimatePresence mode="popLayout">
            {sortedTasks.length > 0 ? (
              sortedTasks.map((task) => {
                const isOverdue =
                  task.dueDate &&
                  isPast(parseISO(task.dueDate)) &&
                  task.status !== 'done' &&
                  task.status !== 'cancelled';
                const project = task.projectId
                  ? projects.find((p) => p.id === task.projectId)
                  : null;
                const isSelected = selectedTaskIds.has(task.id);

                return (
                  <motion.div
                    key={task.id}
                    layout
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.15 }}
                    className={cn(
                      'grid grid-cols-[auto_1fr_100px_100px_120px_120px] gap-2 px-4 py-3 border-b last:border-b-0 items-center',
                      'hover:bg-muted/30 cursor-pointer transition-colors',
                      isSelected && 'bg-primary/5 border-l-2 border-l-primary',
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
                        <span
                          className={cn(
                            'text-sm truncate',
                          )}
                        >
                          {task.title}
                        </span>
                        <EntityIdBadge id={task.id} shortId={task.shortId || 'T-?'} type="task" />
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
                        borderColor: STATUS_COLORS[task.status] + '60',
                        color: STATUS_COLORS[task.status],
                      }}
                    >
                      {STATUS_LABELS[task.status]}
                    </Badge>
                    {task.dueDate ? (
                      <span
                        className={cn(
                          'text-xs flex items-center gap-1',
                          isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground',
                        )}
                      >
                        <Calendar className="size-3" />
                        {format(parseISO(task.dueDate), 'MMM d')}
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
                  </motion.div>
                );
              })
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                <p className="text-sm">No tasks found</p>
                <p className="text-xs mt-1">Create a task to get started</p>
              </div>
            )}
          </AnimatePresence>
        </ScrollArea>
      </div>

      <CreateTaskDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
      <TaskDetailDialog />
    </div>
  );
}
