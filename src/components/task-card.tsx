'use client';

import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import { Calendar, GripVertical, ListChecks, FolderOpen, Tag } from 'lucide-react';
import { format, isPast, parseISO } from 'date-fns';

import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EntityIdBadge } from '@/components/entity-id-badge';
import type { Task } from '@/lib/types';
import { PRIORITY_LABELS, PRIORITY_COLORS, getColumnLabelAndColor } from '@/lib/constants';
import { useAppStore } from '@/store/app-store';
import { TagBadges } from '@/components/tag-badges';

interface TaskCardProps {
  task: Task;
  isDragOverlay?: boolean;
  isSubtask?: boolean;
}

export function TaskCard({ task, isDragOverlay = false, isSubtask = false }: TaskCardProps) {
  const { selectTask, selectedTaskId, projects, statuses } = useAppStore();
  const tags = useAppStore((s) => s.tags);
  const [isHovered, setIsHovered] = useState(false);

  const { color: statusColor } = getColumnLabelAndColor(statuses, task.status);

  const sortableResult = useSortable({
    id: task.id,
    disabled: isSubtask,
    data: {
      type: 'task',
      task,
    },
  });

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = sortableResult;

  const style = transform
    ? {
        transform: CSS.Transform.toString(transform),
        transition,
      }
    : undefined;

  const isOverdue = task.dueDate && isPast(parseISO(task.dueDate)) && task.status !== 'done' && task.status !== 'cancelled';
  const project = task.projectId ? projects.find((p) => p.id === task.projectId) : null;
  const subtaskCount = task._count?.subtasks ?? task.subtasks?.length ?? 0;
  const completedSubtasks = task.completedSubtasks ?? task.subtasks?.filter((s) => s.status === 'done').length ?? 0;
  const isSelected = selectedTaskId === task.id;

  if (isSubtask) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -5 }}
        transition={{ duration: 0.12 }}
      >
        <div
          className={cn(
            'flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-all duration-150',
            'hover:bg-muted/50 ml-4 border-l-2',
            isSelected && 'ring-1 ring-primary/40 bg-primary/5',
          )}
          style={{ borderLeftColor: statusColor }}
          onClick={() => selectTask(task.id)}
        >
          <span
            className="shrink-0 w-2 h-2 rounded-full"
            style={{ backgroundColor: PRIORITY_COLORS[task.priority] || '#94a3b8' }}
          />
          <span className={cn(
            'text-xs leading-tight truncate flex-1',
            task.status === 'done' && 'line-through text-muted-foreground',
          )}>
            {task.title}
          </span>
          <EntityIdBadge id={task.id} shortId={task.shortId || 'T-?'} type="task" className="shrink-0 text-[9px]" />
          <Badge
            variant="outline"
            className="text-[9px] px-1 py-0 h-4 font-normal shrink-0"
            style={{
              borderColor: statusColor + '60',
              color: statusColor,
            }}
          >
            {task.status === 'done' ? '✓' : task.status === 'in_progress' ? '►' : '●'}
          </Badge>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      ref={!isDragOverlay ? setNodeRef : undefined}
      style={!isDragOverlay ? style : undefined}
      layout
      transition={{ duration: 0.15 }}
      className={cn(
        !isDragOverlay && !isDragging && 'opacity-100',
        !isDragOverlay && isDragging && 'opacity-0',
        isDragOverlay && 'rotate-3 shadow-xl scale-105',
      )}
      {...(!isDragOverlay ? attributes : {})}
      {...(!isDragOverlay ? listeners : {})}
    >
      <Card
        className={cn(
          'cursor-pointer group py-0 gap-2 border-l-4 transition-all duration-200',
          'hover:shadow-md',
          isSelected && 'ring-2 ring-primary/50',
          isDragOverlay && 'shadow-xl',
        )}
        style={{ borderLeftColor: statusColor }}
        onClick={() => selectTask(task.id)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="p-3 space-y-2">
          <div className="flex items-start gap-2">
            {!isDragOverlay && (
              <div className="mt-0.5 opacity-0 group-hover:opacity-60 transition-opacity shrink-0 pointer-events-none">
                <GripVertical className="size-4 text-muted-foreground" />
              </div>
            )}
            {isDragOverlay && (
              <GripVertical className="size-4 text-muted-foreground mt-0.5 shrink-0" />
            )}
            <span className="text-sm font-medium leading-tight line-clamp-2 flex-1">
              {task.title}
            </span>
            <EntityIdBadge id={task.id} shortId={task.shortId || 'T-?'} type="task" className="shrink-0" />
            <span
              className="shrink-0 w-2.5 h-2.5 rounded-full mt-1"
              style={{ backgroundColor: PRIORITY_COLORS[task.priority] || '#94a3b8' }}
              title={PRIORITY_LABELS[task.priority] || task.priority}
            />
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-2 flex-wrap pl-0">
            {/* Due date */}
            {task.dueDate && (
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] px-1.5 py-0 h-5 gap-1 font-normal',
                  isOverdue && 'border-red-300 text-red-600 bg-red-50 dark:bg-red-950/30',
                )}
              >
                <Calendar className="size-3" />
                {format(parseISO(task.dueDate), 'MMM d, HH:mm')}
              </Badge>
            )}

            {/* Subtask count */}
            {subtaskCount > 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-1 font-normal">
                <ListChecks className="size-3" />
                {completedSubtasks}/{subtaskCount}
              </Badge>
            )}

            {/* Project name */}
            {project && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-1 font-normal">
                <FolderOpen className="size-3" />
                {project.name}
              </Badge>
            )}

            {/* Tags */}
            {task.tagIds && task.tagIds.length > 0 && (
              <TagBadges tagIds={task.tagIds} max={2} size="sm" />
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
