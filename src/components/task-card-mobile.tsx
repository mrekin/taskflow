'use client';

import { format, parseISO, isPast } from 'date-fns';
import { Calendar, FolderOpen, Share2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { EntityIdBadge } from '@/components/entity-id-badge';
import { useAppStore } from '@/store/app-store';
import type { Task } from '@/lib/types';
import {
  PRIORITY_COLORS,
  getColumnLabelAndColor,
} from '@/lib/constants';

interface TaskCardMobileProps {
  task: Task;
  isSubtask?: boolean;
}

export function TaskCardMobile({ task, isSubtask = false }: TaskCardMobileProps) {
  const { projects, tags, statuses, selectTask, currentUserId } = useAppStore();

  const isOverdue =
    task.dueDate &&
    isPast(parseISO(task.dueDate)) &&
    task.status !== 'done' &&
    task.status !== 'cancelled';

  const project = task.projectId
    ? projects.find((p) => p.id === task.projectId)
    : null;

  const subtasks = task.subtasks ?? [];
  const completedSubtasks = task.completedSubtasks ?? 0;
  const totalSubtasks = task._count?.subtasks ?? subtasks.length;

  const taskTags = task.tagIds
    ? task.tagIds
        .map((id) => tags.find((t) => t.id === id))
        .filter((t): t is NonNullable<typeof t> => t !== undefined)
    : [];

  const statusInfo = getColumnLabelAndColor(statuses, task.status);

  if (isSubtask) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 px-2.5 py-2 rounded-md cursor-pointer transition-colors',
          'ml-4 border-l-2 bg-muted/30',
          task.status === 'done' && 'opacity-60',
        )}
        style={{ borderLeftColor: statusInfo.color }}
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
          style={{ borderColor: statusInfo.color + '60', color: statusInfo.color }}
        >
          {task.status === 'done' ? '✓' : task.status === 'in_progress' ? '►' : '●'}
        </Badge>
      </div>
    );
  }

  return (
    <div
      className="border rounded-lg p-3 bg-card hover:bg-muted/30 cursor-pointer transition-colors"
      onClick={() => selectTask(task.id)}
    >
      <div className="flex items-center gap-2">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: PRIORITY_COLORS[task.priority] || '#94a3b8' }}
        />
        <span className="text-sm truncate flex-1 min-w-0">{task.title}</span>
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 h-5 font-normal shrink-0"
          style={{
            borderColor: statusInfo.color + '60',
            color: statusInfo.color,
          }}
        >
          {statusInfo.label}
        </Badge>
      </div>

      <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
        {task.dueDate ? (
          <span
            className={cn(
              'flex items-center gap-0.5',
              isOverdue && 'text-red-600 font-medium',
            )}
          >
            <Calendar className="size-3" />
            {format(parseISO(task.dueDate), 'MMM d')}
          </span>
        ) : null}

        {task.dueDate && project ? <span>·</span> : null}

        {project ? (
          <span className="flex items-center gap-0.5 truncate">
            <FolderOpen className="size-3 shrink-0" />
            {project.name}
          </span>
        ) : null}

        {(task.dueDate || project) && (totalSubtasks > 0 || taskTags.length > 0) ? (
          <span>·</span>
        ) : null}

        {totalSubtasks > 0 && (
          <Badge variant="secondary" className="px-1.5 py-0 text-[10px] leading-4 h-4">
            {completedSubtasks}/{totalSubtasks}
          </Badge>
        )}

        {taskTags.length > 0 && (
          <div className="flex items-center gap-0.5">
            {taskTags.slice(0, 2).map((tag) => (
              <span
                key={tag.id}
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: tag.color }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
