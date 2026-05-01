export const TASK_STATUSES = ['todo', 'in_progress', 'done', 'cancelled'] as const;
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const PROJECT_STATUSES = ['active', 'archived', 'completed'] as const;

export const STATUS_LABELS: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
  cancelled: 'Cancelled',
  active: 'Active',
  archived: 'Archived',
  completed: 'Completed',
};

export const PRIORITY_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export const STATUS_COLORS: Record<string, string> = {
  todo: '#94a3b8',
  in_progress: '#3b82f6',
  done: '#22c55e',
  cancelled: '#ef4444',
};

export const PRIORITY_COLORS: Record<string, string> = {
  low: '#94a3b8',
  medium: '#3b82f6',
  high: '#f59e0b',
  urgent: '#ef4444',
};

export const DEFAULT_COLORS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#ef4444', '#f97316',
  '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
];

export function getRandomColor(): string {
  return DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)];
}

export const DEFAULT_PAGE_OPTIONS = [
  { value: 'quick-create', label: 'Quick Create' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'kanban', label: 'Kanban' },
  { value: 'notes', label: 'Notes' },
] as const;

export type DefaultPage = (typeof DEFAULT_PAGE_OPTIONS)[number]['value'];

export interface UserPreferences {
  noteAutoSave: boolean;
  notesTree: boolean;
  showSubtasks: boolean;
  defaultPage: DefaultPage;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  noteAutoSave: true,
  notesTree: false,
  showSubtasks: true,
  defaultPage: 'quick-create',
};
