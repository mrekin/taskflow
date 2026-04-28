'use client';

import { useState, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { TaskCard } from '@/components/task-card';
import { CreateTaskDialog } from '@/components/create-task-dialog';
import { TaskDetailDialog } from '@/components/task-detail-dialog';
import { useAppStore } from '@/store/app-store';
import { TASK_STATUSES, STATUS_LABELS, STATUS_COLORS } from '@/lib/constants';
import type { Task } from '@/lib/types';

interface KanbanColumnProps {
  status: string;
  tasks: Task[];
  onAddTask: (status: string) => void;
}

function KanbanColumn({ status, tasks, onAddTask }: KanbanColumnProps) {
  const color = STATUS_COLORS[status] || '#94a3b8';
  const label = STATUS_LABELS[status] || status;

  // Make the column itself a droppable zone
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
        'flex flex-col bg-muted/30 rounded-lg min-w-[280px] w-full sm:min-w-[300px] transition-colors',
        isOver && 'bg-muted/50',
      )}
    >
      {/* Column header */}
      <div
        className="rounded-t-lg px-4 py-3 flex items-center justify-between border-b-2"
        style={{ borderColor: color }}
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
              <TaskCard key={task.id} task={task} />
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
  const { tasks, selectedProjectId, updateTask } = useAppStore();
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [defaultStatus, setDefaultStatus] = useState<string>('todo');

  // Filter tasks by selected project
  const filteredTasks = useMemo(() => {
    let filtered = tasks;
    if (selectedProjectId) {
      filtered = filtered.filter((t) => t.projectId === selectedProjectId);
    }
    // Only show top-level tasks (no parent)
    return filtered.filter((t) => !t.parentId);
  }, [tasks, selectedProjectId]);

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
    return grouped;
  }, [filteredTasks]);

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
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

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
  };

  const handleAddTask = (status: string) => {
    setDefaultStatus(status);
    setCreateDialogOpen(true);
  };

  return (
    <div className="h-full">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
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
