export interface StatusConfig {
  id: string;
  label: string;
  color: string;
  visible: boolean;
}

export const DEFAULT_STATUSES: StatusConfig[] = [
  { id: 'todo', label: 'To Do', color: '#94a3b8', visible: true },
  { id: 'in_progress', label: 'In Progress', color: '#3b82f6', visible: true },
  { id: 'done', label: 'Done', color: '#22c55e', visible: true },
  { id: 'cancelled', label: 'Cancelled', color: '#ef4444', visible: true },
];

export const INVALID_STATE_COLUMN: StatusConfig = {
  id: '__invalid__',
  label: 'Invalid state',
  color: '#dc2626',
  visible: true,
};

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

export const STATUS_COLORS: Record<string, string> = {
  todo: '#94a3b8',
  in_progress: '#3b82f6',
  done: '#22c55e',
  cancelled: '#ef4444',
};

export const PRIORITY_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
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

export interface ProfileVisibility {
  nickname: boolean;
  email: boolean;
}

export interface UserPreferences {
  noteAutoSave: boolean;
  notesTree: boolean;
  showSubtasks: boolean;
  defaultPage: DefaultPage;
  customStatuses: StatusConfig[] | null;
  entityShortLinks: boolean;
  profileVisibility: ProfileVisibility;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  noteAutoSave: true,
  notesTree: false,
  showSubtasks: true,
  defaultPage: 'quick-create',
  customStatuses: null,
  entityShortLinks: false,
  profileVisibility: { nickname: false, email: false },
};

export function resolveStatuses(
  userColumns: StatusConfig[] | null | undefined,
  serverColumns: StatusConfig[] | null | undefined,
): StatusConfig[] {
  if (userColumns && userColumns.length > 0) return userColumns;
  if (serverColumns && serverColumns.length > 0) return serverColumns;
  return DEFAULT_STATUSES;
}

export function slugifyLabel(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function parseStatusesEnv(envValue: string | undefined): StatusConfig[] | null {
  if (!envValue || !envValue.trim()) return null;
  try {
    const parsed = JSON.parse(envValue);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((item: { label?: string; id?: string; color?: string; visible?: boolean }) => ({
        id: item.id || slugifyLabel(item.label || ''),
        label: item.label || '',
        color: item.color || DEFAULT_COLORS[0],
        visible: item.visible !== false,
      })).filter((c: StatusConfig) => c.id && c.label);
    }
  } catch {}
  const columns = envValue.split(',').map((part) => {
    const segments = part.trim().split(':');
    const label = segments[0]?.trim();
    if (!label) return null;
    const color = segments[1]?.trim() || DEFAULT_COLORS[0];
    return { id: slugifyLabel(label), label, color, visible: true } as StatusConfig;
  }).filter(Boolean) as StatusConfig[];
  return columns.length > 0 ? columns : null;
}

export function getColumnLabelAndColor(columns: StatusConfig[], status: string): { label: string; color: string; isValid: boolean } {
  const col = columns.find((c) => c.id === status);
  if (col) return { label: col.label, color: col.color, isValid: true };
  return { label: 'Invalid status', color: '#dc2626', isValid: false };
}
