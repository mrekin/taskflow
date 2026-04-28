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
import { PRIORITY_LABELS, PRIORITY_COLORS, STATUS_COLORS } from '@/lib/constants';
import { useAppStore } from '@/store/app-store';
import { TagBadges } from '@/components/tag-badges';

interface TaskCardProps {
  task: Task;
  isDragOverlay?: boolean;
}

export function TaskCard({ task, isDragOverlay = false }: TaskCardProps) {
  const { selectTask, selectedTaskId, projects } = useAppStore();
  const tags = useAppStore((s) => s.tags);
  const [isHovered, setIsHovered] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: {
      type: 'task',
      task,
    },
  });

  const style = transform
    ? {
        transform: CSS.Transform.toString(transform),
        transition,
      }
    : undefined;

  const isOverdue = task.dueDate && isPast(parseISO(task.dueDate)) && task.status !== 'done' && task.status !== 'cancelled';
  const project = task.projectId ? projects.find((p) => p.id === task.projectId) : null;
  // Use _count.subtasks from API (always available), fall back to subtasks array length
  const subtaskCount = task._count?.subtasks ?? task.subtasks?.length ?? 0;
  // For completed count, prefer API-provided completedSubtasks, fall back to computing from subtasks array
  const completedSubtasks = task.completedSubtasks ?? task.subtasks?.filter((s) => s.status === 'done').length ?? 0;
  const isSelected = selectedTaskId === task.id;

  return (
    <motion.div
      ref={!isDragOverlay ? setNodeRef : undefined}
      style={!isDragOverlay ? style : undefined}
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.15 }}
      className={cn(
        isDragOverlay && 'rotate-3 shadow-xl scale-105',
        isDragging && 'opacity-40',
      )}
      {...(!isDragOverlay ? attributes : {})}
    >
      <Card
        className={cn(
          'cursor-pointer group py-0 gap-2 border-l-4 transition-all duration-200',
          'hover:shadow-md',
          isSelected && 'ring-2 ring-primary/50',
          isDragOverlay && 'shadow-xl',
        )}
        style={{ borderLeftColor: STATUS_COLORS[task.status] || '#94a3b8' }}
        onClick={() => selectTask(task.id)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="p-3 space-y-2">
          {/* Header row: drag handle + title + priority */}
          <div className="flex items-start gap-2">
            {!isDragOverlay && (
              <button
                className="mt-0.5 cursor-grab opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity shrink-0"
                {...listeners}
              >
                <GripVertical className="size-4 text-muted-foreground" />
              </button>
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
                {format(parseISO(task.dueDate), 'MMM d')}
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
