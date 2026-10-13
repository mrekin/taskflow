import { create } from 'zustand';
import type { Area, Project, Task, Note, NoteFolder, Comment, Tag, Webhook, WebhookDelivery, WebhookTrigger, Attachment, AttachmentConfig, TaskPrice, NoteVersionMeta, ApiToken, TokenPermissions, ApiTokenScopeType, Release } from '@/lib/types';
import { DEFAULT_PREFERENCES, type UserPreferences, type StatusConfig, resolveStatuses, DEFAULT_STATUSES } from '@/lib/constants';

import { api } from '@/lib/api-utils';
import { summarize } from '@/lib/prices';

// Aggregate a task's price summary from its own prices plus its direct subtasks' prices.
// Mirrors the server-side computation in TaskService.listTasks/getTask (one level of subtasks).
function aggregateTaskPriceSummary(task: Task): { done: number; total: number } | undefined {
  const allPrices: TaskPrice[] = [
    ...(task.prices ?? []),
    ...(task.subtasks ?? []).flatMap((s) => s.prices ?? []),
  ];
  if (!allPrices.length) return undefined;
  return summarize(allPrices);
}

// Recompute a task's subtask-derived aggregates. Call AFTER the `subtasks` array has
// already been updated (add / edit / remove). Single source of truth shared by
// createTask / updateTask / deleteTask. Mirrors server-side logic.
function recomputeSubtaskAggregates(task: Task) {
  const subtasks = task.subtasks ?? [];
  return {
    _count: { subtasks: subtasks.length, attachments: task._count?.attachments ?? 0 },
    completedSubtasks: subtasks.filter((s) => s.status === 'done').length,
    priceSummary: aggregateTaskPriceSummary(task),
  };
}

type ViewType = 'areas' | 'projects' | 'tasks' | 'kanban' | 'notes' | 'note-editor' | 'releases' | 'settings' | 'quick-create';

// ─── External-change sync (auto-refresh) ───

export interface SyncConflict {
  /** Entity id (conflicts are keyed by entityType + id). */
  id: string;
  entityType: 'task' | 'note' | 'folder' | 'project' | 'area' | 'tag' | 'release';
  kind: 'updated' | 'deleted';
  /** Display name for the conflict banner. */
  title: string;
  /** Fresh server row (absent for deletions). */
  serverEntity: unknown;
  serverUpdatedAt: string;
}

/** Shape of GET /api/sync/changes (see src/services/sync.service.ts). */
interface SyncChangesPayload {
  serverTime: string;
  truncated: boolean;
  changed: {
    areas: unknown[];
    projects: unknown[];
    tasks: unknown[];
    notes: unknown[];
    folders: unknown[];
    releases: unknown[];
    tags: unknown[];
    users: Array<{ id: string; name: string | null; image: string | null }>;
  };
  allIds: {
    areas: string[];
    projects: string[];
    tasks: string[];
    notes: string[];
    folders: string[];
    releases: string[];
    tags: string[];
  };
  openTask?: { commentsChanged: boolean };
}

/** Kanban sidebar counts over top-level tasks. Shared by fetchTasks and syncChanges. */
function computeTaskCounts(tasks: Task[]): { totalTaskCount: number; totalTaskStatusCounts: Record<string, number> } {
  const topLevel = tasks.filter((t) => !t.parentId);
  return {
    totalTaskCount: topLevel.length,
    totalTaskStatusCounts: {
      todo: topLevel.filter((t) => t.status === 'todo').length,
      in_progress: topLevel.filter((t) => t.status === 'in_progress').length,
      done: topLevel.filter((t) => t.status === 'done').length,
      cancelled: topLevel.filter((t) => t.status === 'cancelled').length,
    },
  };
}

/** Collect a folder and all its descendants (shared by deleteFolder and conflict resolution). */
function collectFolderIds(folderId: string, folders: NoteFolder[]): string[] {
  const children = folders.filter((f) => f.parentId === folderId);
  return [folderId, ...children.flatMap((c) => collectFolderIds(c.id, folders))];
}

interface SyncMergeParams<T extends { id: string; updatedAt: string }> {
  entityType: SyncConflict['entityType'];
  current: T[];
  changed: T[];
  /** Ids the client should currently hold (view-scoped) — deletions diff against these. */
  allIds: string[];
  allowAdditions: boolean;
  isProtected: (id: string) => boolean;
  dismissed: Record<string, string>;
  conflicts: SyncConflict[];
}

interface SyncMergeResult<T> {
  rows: T[];
  /** The store array changed (applied updates, additions or deletions). */
  touched: boolean;
  applied: Map<string, T>;
  deletedIds: Set<string>;
  /** Watched ids (open dialog / open note) silently merged — drives refresh ticks. */
  mergedWatched: string[];
}

/**
 * Merge a sync delta into one store array: replace changed rows by id, drop rows
 * missing from allIds, queue a conflict instead of touching protected rows.
 * Skips rows the store already holds at a fresher-or-equal updatedAt (the UI's own
 * mutation response can beat the poll), and revisions the user already dismissed.
 */
function mergeSyncedEntities<T extends { id: string; updatedAt: string }>(
  p: SyncMergeParams<T>,
  watchIds: string[] = [],
): SyncMergeResult<T> {
  const alive = new Set(p.allIds);
  const known = new Set(p.current.map((r) => r.id));
  const applyIds = new Set<string>();
  const deletedIds = new Set<string>();
  const mergedWatched: string[] = [];

  const queueConflict = (id: string, kind: SyncConflict['kind'], serverEntity: unknown, serverUpdatedAt: string) => {
    const curRow = p.current.find((r) => r.id === id);
    const named = curRow as unknown as { title?: string; name?: string } | undefined;
    const title = named?.title || named?.name || id;
    const idx = p.conflicts.findIndex((c) => c.entityType === p.entityType && c.id === id);
    if (idx >= 0) {
      if (p.conflicts[idx].serverUpdatedAt !== serverUpdatedAt) {
        p.conflicts[idx] = { ...p.conflicts[idx], kind, serverEntity, serverUpdatedAt };
      }
      return;
    }
    p.conflicts.push({ id, entityType: p.entityType, kind, title, serverEntity, serverUpdatedAt });
  };

  for (const r of p.changed) {
    if (p.dismissed[r.id] === r.updatedAt) continue;
    const curRow = p.current.find((x) => x.id === r.id);
    if (curRow && new Date(curRow.updatedAt).getTime() >= new Date(r.updatedAt).getTime()) continue;
    if (p.isProtected(r.id)) {
      queueConflict(r.id, 'updated', r, r.updatedAt);
      continue;
    }
    if (!curRow && !p.allowAdditions) continue; // scoped view: the correction refetch picks it up
    applyIds.add(r.id);
    if (watchIds.includes(r.id)) mergedWatched.push(r.id);
  }
  for (const r of p.current) {
    if (alive.has(r.id)) continue;
    if (p.isProtected(r.id)) {
      queueConflict(r.id, 'deleted', undefined, r.updatedAt);
      continue;
    }
    if (p.dismissed[r.id]) continue; // user chose to keep the local copy
    deletedIds.add(r.id);
  }

  const touched = applyIds.size > 0 || deletedIds.size > 0;
  const applied = new Map(p.changed.filter((r) => applyIds.has(r.id)).map((r) => [r.id, r as T]));
  const rows = p.current
    .map((r) => applied.get(r.id) ?? r)
    .filter((r) => !deletedIds.has(r.id));
  const additions = p.changed.filter((r) => !known.has(r.id) && applyIds.has(r.id));
  if (p.allowAdditions && additions.length) rows.push(...(additions as T[]));

  return { rows, touched, applied, deletedIds, mergedWatched };
}

interface AppState {
  // Navigation
  currentView: ViewType;
  selectedAreaId: string | null;
  selectedProjectId: string | null;
  selectedTaskId: string | null;
  selectedNoteId: string | null;
  /** Id of the task whose cost breakdown dialog is open (top-level, rendered once). */
  costBreakdownTaskId: string | null;
  selectedFolderId: string | null;
  selectedReleaseId: string | null;

  // Data
  areas: Area[];
  projects: Project[];
  tasks: Task[];
  notes: Note[];
  folders: NoteFolder[];
  releases: Release[];
  tags: Tag[];
  comments: Comment[];
  webhooks: Webhook[];
  apiTokens: ApiToken[];
  attachments: Attachment[];
  attachmentConfig: AttachmentConfig | null;

  // UI State
  sidebarOpen: boolean;
  isLoading: boolean;
  taskStatusFilter: string;
  tagFilter: string[];
  projectFilter: string[];
  assigneeFilter: string[];
  taskSearchQuery: string;
  noteSearchQuery: string;
  noteSearchResults: Note[];
  folderSearchResults: NoteFolder[];
  totalTaskCount: number;
  totalTaskStatusCounts: Record<string, number>;
  currentUserId: string | null;
  publicReadonly: boolean;
  ownershipFilter: 'all' | 'mine' | 'shared';
  users: Array<{ id: string; name: string | null; image: string | null }>;

  // User Preferences
  userPreferences: UserPreferences;
  preferencesLoaded: boolean;

  // Kanban Columns
  statuses: StatusConfig[];
  serverStatuses: StatusConfig[] | null;

  // External-change sync
  /** Watermark from the last sync's serverTime; null → next poll backdates 60 s. */
  lastSyncedAt: string | null;
  /** Set on 401/403 (demo reset mid-flight, revoked session); clears on the next successful sync. */
  syncPaused: boolean;
  /** Current list views, maintained by fetch* — sent to /api/sync/changes for scoped deletion diffs. */
  tasksScope: { projectId?: string; search?: string } | null;
  notesScope: { projectId?: string } | null;
  foldersScope: { projectId?: string } | null;
  projectsScope: { areaId?: string } | null;
  pendingConflicts: SyncConflict[];
  /** entityId → updatedAt of the revision the user chose to keep editing. */
  dismissedConflicts: Record<string, string>;
  /** Registered by task-detail-dialog: a task edit dialog is open with unsaved changes. */
  taskDialogDirty: boolean;
  /** Registered by note-editor: which note is open and whether it has unsaved changes. */
  noteEditor: { noteId: string | null; dirty: boolean };
  /** Set by kanban-board while a card is being dragged. */
  draggedTaskId: string | null;
  /** Bump to remount NoteEditor with fresh server data (external apply on an open note). */
  noteEditorReloadTick: number;
  /** Bump to re-sync the open (clean) task dialog's fields after a silent external merge. */
  taskDialogRefreshTick: number;

  // Actions - Navigation
  setCurrentView: (view: ViewType) => void;
  selectArea: (id: string | null) => void;
  selectProject: (id: string | null) => void;
  selectTask: (id: string | null) => void;
  setCostBreakdownTask: (id: string | null) => void;
  selectNote: (id: string | null) => void;
  selectFolder: (id: string | null) => void;
  toggleSidebar: () => void;
  setTaskStatusFilter: (filter: string) => void;
  setTagFilter: (tagIds: string[]) => void;
  setProjectFilter: (projectIds: string[]) => void;
  setAssigneeFilter: (userIds: string[]) => void;
  setCurrentUserId: (id: string | null) => void;
  setPublicReadonly: (v: boolean) => void;
  setOwnershipFilter: (filter: 'all' | 'mine' | 'shared') => void;
  fetchUsers: () => Promise<void>;
  setTaskSearchQuery: (query: string) => void;
  setNoteSearchQuery: (query: string) => void;
  searchNotes: (projectId?: string, search?: string, folderId?: string) => Promise<void>;
  clearNoteSearch: () => void;

  // Actions - User Preferences
  fetchUserPreferences: () => Promise<void>;
  updateUserPreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => Promise<void>;

  // Actions - Kanban Columns
  fetchStatuses: () => Promise<void>;
  updateCustomStatuses: (columns: StatusConfig[] | null) => Promise<void>;
  resetCustomStatuses: () => Promise<void>;

  // Actions - Data Fetching
  fetchAreas: () => Promise<void>;
  fetchProjects: (areaId?: string) => Promise<void>;
  fetchTasks: (projectId?: string, search?: string) => Promise<void>;
  fetchNotes: (projectId?: string) => Promise<void>;
  fetchTags: () => Promise<void>;
  fetchComments: (taskId: string) => Promise<void>;

  // Actions - CRUD Areas
  createArea: (data: Partial<Area>) => Promise<void>;
  updateArea: (id: string, data: Partial<Area>) => Promise<void>;
  deleteArea: (id: string) => Promise<void>;

  // Actions - CRUD Projects
  createProject: (data: Partial<Project>) => Promise<void>;
  updateProject: (id: string, data: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;

  // Actions - CRUD Tasks
  createTask: (data: Partial<Task>) => Promise<Task | undefined>;
  updateTask: (id: string, data: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;

  // Actions - CRUD Notes
  createNote: (data: Partial<Note>) => Promise<void>;
  updateNote: (id: string, data: Partial<Note>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  // Actions - Note versions
  saveNoteVersion: (id: string, data: {
    title: string;
    content: string;
    projectId?: string | null;
    tagIds?: string[];
    visibility?: string | null;
    visibleUserIds?: string[];
    comment?: string | null;
  }) => Promise<NoteVersionMeta | null>;
  restoreNoteVersion: (id: string, number: number) => Promise<NoteVersionMeta | null>;
  deleteNoteVersions: (id: string, numbers: number[]) => Promise<number>;
  setVersionKept: (id: string, number: number, kept: boolean) => Promise<void>;

  // Actions - CRUD Folders
  fetchFolders: (projectId?: string) => Promise<void>;
  createFolder: (data: Partial<NoteFolder>) => Promise<void>;
  updateFolder: (id: string, data: Partial<NoteFolder>) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;

  // Actions - CRUD Releases
  fetchReleases: (projectId?: string) => Promise<void>;
  createRelease: (data: Partial<Release>) => Promise<Release | undefined>;
  updateRelease: (id: string, data: Partial<Release>) => Promise<Release | undefined>;
  deleteRelease: (id: string) => Promise<void>;
  selectRelease: (id: string | null) => void;

  // Actions - CRUD Comments
  createComment: (data: { content: string; taskId: string; parentId?: string }) => Promise<Comment | undefined>;
  updateComment: (id: string, data: { content: string }) => Promise<void>;
  deleteComment: (id: string) => Promise<void>;

  // Actions - CRUD Tags
  createTag: (data: { name: string; color?: string }) => Promise<void>;
  updateTag: (id: string, data: Partial<Tag>) => Promise<void>;
  deleteTag: (id: string) => Promise<void>;

  // Actions - CRUD Webhooks
  fetchWebhooks: () => Promise<void>;
  createWebhook: (data: Partial<Webhook>) => Promise<Webhook>;
  updateWebhook: (id: string, data: Partial<Webhook>) => Promise<void>;
  deleteWebhook: (id: string) => Promise<void>;
  testWebhook: (id: string) => Promise<{ success: boolean; statusCode: number | null; response: string | null; elapsed: number }>;
  fetchWebhookDeliveries: (id: string) => Promise<WebhookDelivery[]>;

  // Actions - CRUD Webhook Triggers
  createWebhookTrigger: (data: { webhookId: string; events: string[]; scopeType?: string; scopeId?: string }) => Promise<WebhookTrigger | undefined>;
  updateWebhookTrigger: (id: string, data: { events?: string[]; scopeType?: string; scopeId?: string; active?: boolean }) => Promise<WebhookTrigger | undefined>;
  deleteWebhookTrigger: (id: string) => Promise<void>;

  // Actions - API tokens
  fetchApiTokens: () => Promise<void>;
  createApiToken: (data: { name: string; scopeType: ApiTokenScopeType; projectIds?: string[]; permissions: TokenPermissions; expiresAt?: string | null }) => Promise<{ token: string; record: ApiToken }>;
  revokeApiToken: (id: string) => Promise<void>;
  deleteApiToken: (id: string) => Promise<void>;

  // Actions - Attachments
  fetchAttachmentConfig: () => Promise<void>;
  fetchAttachments: (entityId: string, entityType: string) => Promise<void>;
  uploadAttachment: (file: File, entityId: string, entityType: string, hash: string) => Promise<Attachment | undefined>;
  deleteAttachment: (id: string) => Promise<void>;

  // Actions - External-change sync
  syncChanges: () => Promise<void>;
  forceFullRefetch: () => Promise<void>;
  resolveConflict: (entityId: string, entityType: SyncConflict['entityType'], choice: 'apply' | 'keep') => void;
  setNoteEditorState: (noteId: string | null, dirty: boolean) => void;
  setTaskDialogDirty: (dirty: boolean) => void;
  setDraggedTask: (id: string | null) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Navigation initial state
  currentView: 'quick-create',
  selectedAreaId: null,
  selectedProjectId: null,
  selectedTaskId: null,
  selectedNoteId: null,
  costBreakdownTaskId: null,
  selectedFolderId: null,
  selectedReleaseId: null,

  // Data initial state
  areas: [],
  projects: [],
  tasks: [],
  notes: [],
  folders: [],
  releases: [],
  tags: [],
  comments: [],
  webhooks: [],
  apiTokens: [],
  attachments: [],
  attachmentConfig: null,

  // UI initial state
  sidebarOpen: true,
  isLoading: false,
  taskStatusFilter: 'all',
  tagFilter: [],
  projectFilter: [],
  assigneeFilter: [],
  taskSearchQuery: '',
  noteSearchQuery: '',
  noteSearchResults: [],
  folderSearchResults: [],
  totalTaskCount: 0,
  totalTaskStatusCounts: { todo: 0, in_progress: 0, done: 0, cancelled: 0 },
  currentUserId: null,
  publicReadonly: false,
  ownershipFilter: 'all',
  users: [],

  // User Preferences initial state
  userPreferences: DEFAULT_PREFERENCES,
  preferencesLoaded: false,

  // Kanban Columns initial state
  statuses: DEFAULT_STATUSES,
  serverStatuses: null,

  // External-change sync initial state
  lastSyncedAt: null,
  syncPaused: false,
  tasksScope: null,
  notesScope: null,
  foldersScope: null,
  projectsScope: null,
  pendingConflicts: [],
  dismissedConflicts: {},
  taskDialogDirty: false,
  noteEditor: { noteId: null, dirty: false },
  draggedTaskId: null,
  noteEditorReloadTick: 0,
  taskDialogRefreshTick: 0,

  // Navigation actions
  setCurrentView: (view) => set({ currentView: view }),
  selectArea: (id) => set({ selectedAreaId: id }),
  selectProject: (id) => set({ selectedProjectId: id }),
  selectTask: (id) => set({ selectedTaskId: id }),
  setCostBreakdownTask: (id) => set({ costBreakdownTaskId: id }),
  selectNote: (id) => set({ selectedNoteId: id }),
  selectFolder: (id) => set({ selectedFolderId: id }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setTaskStatusFilter: (filter) => set({ taskStatusFilter: filter }),
  setTagFilter: (tagIds) => set({ tagFilter: tagIds }),
  setProjectFilter: (projectIds) => set({ projectFilter: projectIds }),
  setAssigneeFilter: (userIds) => set({ assigneeFilter: userIds }),
  setCurrentUserId: (id) => set({ currentUserId: id }),
  setPublicReadonly: (v) => set({ publicReadonly: v }),
  setOwnershipFilter: (filter) => set({ ownershipFilter: filter }),
  fetchUsers: async () => {
    try {
      const res = await fetch(api('/api/users'));
      if (!res.ok) throw new Error('Failed to fetch users');
      const users = await res.json();
      set({ users });
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  },
  setTaskSearchQuery: (query) => set({ taskSearchQuery: query }),
  setNoteSearchQuery: (query) => set({ noteSearchQuery: query }),
  searchNotes: async (projectId?: string, search?: string, folderId?: string) => {
    const actualSearch = search !== undefined ? search : get().noteSearchQuery;
    if (!actualSearch) {
      set({ noteSearchResults: [], folderSearchResults: [] });
      return;
    }
    try {
      const params = new URLSearchParams();
      if (projectId) params.set('projectId', projectId);
      if (actualSearch) params.set('search', actualSearch);
      if (folderId) params.set('folderId', folderId);
      const url = api(`/api/notes/search?${params.toString()}`);
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to search notes');
      const data = await res.json();
      set({ noteSearchResults: data.notes, folderSearchResults: data.folders });
    } catch (error) {
      console.error('Failed to search notes:', error);
    }
  },
  clearNoteSearch: () => set({ noteSearchQuery: '', noteSearchResults: [], folderSearchResults: [] }),

  // Data Fetching
  fetchAreas: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch(api('/api/areas'));
      if (!res.ok) throw new Error('Failed to fetch areas');
      const areas: Area[] = await res.json();
      set({ areas });
    } catch (error) {
      console.error('Failed to fetch areas:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  fetchProjects: async (areaId?: string) => {
    set({ isLoading: true });
    try {
      const url = areaId ? api(`/api/projects?areaId=${areaId}`) : api('/api/projects');
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch projects');
      const projects: Project[] = await res.json();
      set({ projects, projectsScope: { areaId } });
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  fetchTasks: async (projectId?: string, search?: string) => {
    set({ isLoading: true });
    try {
      const actualSearch = search !== undefined ? search : get().taskSearchQuery;
      const params = new URLSearchParams();
      if (projectId) params.set('projectId', projectId);
      if (actualSearch) params.set('search', actualSearch);
      const url = params.toString() ? api(`/api/tasks?${params.toString()}`) : api('/api/tasks');
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch tasks');
      const tasks: Task[] = await res.json();
      const updates: Partial<AppState> = {
        tasks,
        tasksScope: { projectId, search: actualSearch || undefined },
      };
      if (!actualSearch) {
        Object.assign(updates, computeTaskCounts(tasks));
      }
      set(updates);
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  fetchNotes: async (projectId?: string) => {
    set({ isLoading: true });
    try {
      const url = projectId ? api(`/api/notes?projectId=${projectId}`) : api('/api/notes');
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch notes');
      const notes: Note[] = await res.json();
      set({ notes, notesScope: { projectId } });
    } catch (error) {
      console.error('Failed to fetch notes:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  fetchTags: async () => {
    try {
      const res = await fetch(api('/api/tags'));
      if (!res.ok) throw new Error('Failed to fetch tags');
      const tags: Tag[] = await res.json();
      set({ tags });
    } catch (error) {
      console.error('Failed to fetch tags:', error);
    }
  },

  fetchComments: async (taskId: string) => {
    try {
      const res = await fetch(api(`/api/comments?taskId=${taskId}`));
      if (!res.ok) throw new Error('Failed to fetch comments');
      const comments: Comment[] = await res.json();
      set({ comments });
    } catch (error) {
      console.error('Failed to fetch comments:', error);
    }
  },

  // CRUD Areas
  createArea: async (data) => {
    try {
      const res = await fetch(api('/api/areas'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create area');
      const newArea: Area = await res.json();
      set((state) => ({ areas: [...state.areas, newArea] }));
    } catch (error) {
      console.error('Failed to create area:', error);
    }
  },

  updateArea: async (id, data) => {
    try {
      const res = await fetch(api(`/api/areas/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update area');
      const updatedArea: Area = await res.json();
      set((state) => ({
        areas: state.areas.map((a) => (a.id === id ? updatedArea : a)),
      }));
    } catch (error) {
      console.error('Failed to update area:', error);
    }
  },

  deleteArea: async (id) => {
    try {
      const res = await fetch(api(`/api/areas/${id}`), { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete area');
      set((state) => ({
        areas: state.areas.filter((a) => a.id !== id),
        selectedAreaId: state.selectedAreaId === id ? null : state.selectedAreaId,
      }));
    } catch (error) {
      console.error('Failed to delete area:', error);
    }
  },

  // CRUD Projects
  createProject: async (data) => {
    try {
      const res = await fetch(api('/api/projects'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create project');
      const newProject: Project = await res.json();
      set((state) => ({ projects: [...state.projects, newProject] }));
    } catch (error) {
      console.error('Failed to create project:', error);
    }
  },

  updateProject: async (id, data) => {
    try {
      const res = await fetch(api(`/api/projects/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update project');
      const updatedProject: Project = await res.json();
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? updatedProject : p)),
      }));
    } catch (error) {
      console.error('Failed to update project:', error);
    }
  },

  deleteProject: async (id) => {
    try {
      const res = await fetch(api(`/api/projects/${id}`), { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete project');
      set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
        selectedProjectId: state.selectedProjectId === id ? null : state.selectedProjectId,
      }));
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  },

  // CRUD Tasks
  createTask: async (data) => {
    try {
      const res = await fetch(api('/api/tasks'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create task');
      const newTask: Task = await res.json();
      set((state) => {
        const tasks = [...state.tasks, newTask];
        if (newTask.parentId) {
          const parentIdx = tasks.findIndex((t) => t.id === newTask.parentId);
          if (parentIdx !== -1) {
            const parent = { ...tasks[parentIdx] };
            const subtasks = [...(parent.subtasks ?? []), {
              id: newTask.id,
              title: newTask.title,
              status: newTask.status,
              priority: newTask.priority,
              parentId: newTask.parentId,
              shortIdNum: newTask.shortIdNum,
              shortId: newTask.shortId,
              prices: newTask.prices,
              currency: newTask.currency,
            } as Task];
            tasks[parentIdx] = {
              ...parent,
              subtasks,
              ...recomputeSubtaskAggregates({ ...parent, subtasks }),
            };
          }
        }
        return { tasks };
      });
      return newTask;
    } catch (error) {
      console.error('Failed to create task:', error);
      return undefined;
    }
  },

  updateTask: async (id, data) => {
    try {
      const res = await fetch(api(`/api/tasks/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update task');
      const updatedTask: Task = await res.json();
      set((state) => ({
        tasks: state.tasks.map((t) => {
          if (t.id === id) {
            return {
              ...updatedTask,
              subtasks: updatedTask.subtasks ?? t.subtasks,
              completedSubtasks: updatedTask.completedSubtasks ?? t.completedSubtasks,
            };
          }
          if (t.subtasks?.some((s) => s.id === id)) {
            const subtasks = t.subtasks.map((s) => (s.id === id ? { ...s, ...updatedTask } : s));
            return {
              ...t,
              subtasks,
              ...recomputeSubtaskAggregates({ ...t, subtasks }),
            };
          }
          return t;
        }),
      }));
    } catch (error) {
      console.error('Failed to update task:', error);
    }
  },

  deleteTask: async (id) => {
    try {
      const res = await fetch(api(`/api/tasks/${id}`), { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete task');
      set((state) => {
        const deleted = state.tasks.find((t) => t.id === id);
        return {
          tasks: state.tasks
            .filter((t) => t.id !== id)
            .map((t) => {
              if (!deleted?.parentId || t.id !== deleted.parentId) return t;
              const subtasks = (t.subtasks ?? []).filter((s) => s.id !== id);
              return {
                ...t,
                subtasks,
                ...recomputeSubtaskAggregates({ ...t, subtasks }),
              };
            }),
          selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId,
        };
      });
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  },

  // CRUD Notes
  createNote: async (data) => {
    try {
      const res = await fetch(api('/api/notes'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to create note' }));
        throw new Error(err.error || 'Failed to create note');
      }
      const newNote: Note = await res.json();
      set((state) => ({ notes: [...state.notes, newNote] }));
    } catch (error) {
      console.error('Failed to create note:', error);
      throw error;
    }
  },

  updateNote: async (id, data) => {
    try {
      const res = await fetch(api(`/api/notes/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update note');
      const updatedNote: Note = await res.json();
      set((state) => ({
        notes: state.notes.map((n) => (n.id === id ? updatedNote : n)),
      }));
    } catch (error) {
      console.error('Failed to update note:', error);
    }
  },

  deleteNote: async (id) => {
    try {
      const res = await fetch(api(`/api/notes/${id}`), { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete note');
      set((state) => ({
        notes: state.notes.filter((n) => n.id !== id),
        selectedNoteId: state.selectedNoteId === id ? null : state.selectedNoteId,
      }));
    } catch (error) {
      console.error('Failed to delete note:', error);
    }
  },

  // CRUD Note versions — versions are NOT cached in the store; UI fetches them on
  // demand. These actions only persist changes and refresh the live note in state.
  saveNoteVersion: async (id, data) => {
    try {
      const res = await fetch(api(`/api/notes/${id}/versions`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to save version' }));
        throw new Error(err.error || 'Failed to save version');
      }
      const { note, version } = await res.json() as { note: Note; version: NoteVersionMeta };
      set((state) => ({ notes: state.notes.map((n) => (n.id === id ? note : n)) }));
      return version;
    } catch (error) {
      console.error('Failed to save note version:', error);
      throw error;
    }
  },

  restoreNoteVersion: async (id, number) => {
    try {
      const res = await fetch(api(`/api/notes/${id}/versions/${number}/restore`), {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to restore version' }));
        throw new Error(err.error || 'Failed to restore version');
      }
      const { note, version } = await res.json() as { note: Note; version: NoteVersionMeta };
      set((state) => ({ notes: state.notes.map((n) => (n.id === id ? note : n)) }));
      return version;
    } catch (error) {
      console.error('Failed to restore note version:', error);
      throw error;
    }
  },

  deleteNoteVersions: async (id, numbers) => {
    try {
      const res = await fetch(api(`/api/notes/${id}/versions`), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numbers }),
      });
      if (!res.ok) throw new Error('Failed to delete versions');
      const { deleted } = await res.json() as { deleted: number };
      return deleted;
    } catch (error) {
      console.error('Failed to delete note versions:', error);
      return 0;
    }
  },

  setVersionKept: async (id, number, kept) => {
    try {
      await fetch(api(`/api/notes/${id}/versions/${number}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kept }),
      });
    } catch (error) {
      console.error('Failed to set version kept:', error);
    }
  },

  // CRUD Folders
  fetchFolders: async (projectId?: string) => {
    set({ isLoading: true });
    try {
      const url = projectId ? api(`/api/folders?projectId=${projectId}`) : api('/api/folders');
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch folders');
      const folders: NoteFolder[] = await res.json();
      set({ folders, foldersScope: { projectId } });
    } catch (error) {
      console.error('Failed to fetch folders:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  createFolder: async (data) => {
    try {
      const res = await fetch(api('/api/folders'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to create folder' }));
        throw new Error(err.error || 'Failed to create folder');
      }
      const newFolder: NoteFolder = await res.json();
      set((state) => ({ folders: [...state.folders, newFolder] }));
    } catch (error) {
      console.error('Failed to create folder:', error);
      throw error;
    }
  },

  updateFolder: async (id, data) => {
    try {
      const res = await fetch(api(`/api/folders/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to update folder' }));
        throw new Error(err.error || 'Failed to update folder');
      }
      const updatedFolder: NoteFolder = await res.json();
      set((state) => ({
        folders: state.folders.map((f) => (f.id === id ? updatedFolder : f)),
      }));
    } catch (error) {
      console.error('Failed to update folder:', error);
      throw error;
    }
  },

  deleteFolder: async (id) => {
    try {
      const res = await fetch(api(`/api/folders/${id}`), { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to delete folder' }));
        throw new Error(err.error || 'Failed to delete folder');
      }
      set((state) => {
        const removedIds = new Set(collectFolderIds(id, state.folders));
        return {
          folders: state.folders.filter((f) => !removedIds.has(f.id)),
          notes: state.notes.filter((n) => !removedIds.has(n.folderId ?? '')),
          selectedFolderId: state.selectedFolderId && removedIds.has(state.selectedFolderId) ? null : state.selectedFolderId,
        };
      });
    } catch (error) {
      console.error('Failed to delete folder:', error);
      throw error;
    }
  },

  // CRUD Releases
  fetchReleases: async (projectId?: string) => {
    try {
      const url = projectId ? api(`/api/releases?projectId=${projectId}`) : api('/api/releases');
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch releases');
      const releases: Release[] = await res.json();
      set((state) => ({
        releases,
        selectedReleaseId: state.selectedReleaseId && releases.some((r) => r.id === state.selectedReleaseId)
          ? state.selectedReleaseId
          : null,
      }));
    } catch (error) {
      console.error('Failed to fetch releases:', error);
    }
  },

  createRelease: async (data) => {
    const res = await fetch(api('/api/releases'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to create release' }));
      throw new Error(err.error || 'Failed to create release');
    }
    const newRelease: Release = await res.json();
    set((state) => ({ releases: [...state.releases, newRelease] }));
    return newRelease;
  },

  updateRelease: async (id, data) => {
    const res = await fetch(api(`/api/releases/${id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to update release' }));
      throw new Error(err.error || 'Failed to update release');
    }
    const updatedRelease: Release = await res.json();
    set((state) => ({
      releases: state.releases.map((r) => (r.id === id ? updatedRelease : r)),
    }));
    return updatedRelease;
  },

  deleteRelease: async (id) => {
    const res = await fetch(api(`/api/releases/${id}`), { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to delete release' }));
      throw new Error(err.error || 'Failed to delete release');
    }
    set((state) => ({
      releases: state.releases.filter((r) => r.id !== id),
      selectedReleaseId: state.selectedReleaseId === id ? null : state.selectedReleaseId,
      // Linked entities lose the relation server-side (SetNull) — drop it locally too
      tasks: state.tasks.map((t) => (t.releaseId === id ? { ...t, releaseId: null, release: undefined } : t)),
      notes: state.notes.map((n) => (n.releaseId === id ? { ...n, releaseId: null, release: undefined } : n)),
      folders: state.folders.map((f) => (f.releaseId === id ? { ...f, releaseId: null, release: undefined } : f)),
    }));
  },

  selectRelease: (id) => set({ selectedReleaseId: id }),

  // CRUD Comments
  createComment: async (data) => {
    try {
      const res = await fetch(api('/api/comments'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create comment');
      const newComment: Comment = await res.json();
      set((state) => ({ comments: [...state.comments, newComment] }));
      return newComment;
    } catch (error) {
      console.error('Failed to create comment:', error);
    }
  },

  updateComment: async (id, data) => {
    try {
      const res = await fetch(api(`/api/comments/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update comment');
      const updatedComment: Comment = await res.json();
      set((state) => ({
        comments: state.comments.map((c) => (c.id === id ? updatedComment : c)),
      }));
    } catch (error) {
      console.error('Failed to update comment:', error);
    }
  },

  deleteComment: async (id) => {
    try {
      const res = await fetch(api(`/api/comments/${id}`), { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete comment');
      const data = await res.json();
      set((state) => {
        if (data.deleted) {
          // Hard delete — remove from list
          return { comments: state.comments.filter((c) => c.id !== id) };
        }
        // Soft delete — update in place
        return {
          comments: state.comments.map((c) =>
            c.id === id ? { ...c, deleted: true, content: '' } : c
          ),
        };
      });
    } catch (error) {
      console.error('Failed to delete comment:', error);
    }
  },

  // CRUD Tags
  createTag: async (data) => {
    try {
      const res = await fetch(api('/api/tags'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create tag');
      const newTag: Tag = await res.json();
      set((state) => ({ tags: [...state.tags, newTag] }));
    } catch (error) {
      console.error('Failed to create tag:', error);
    }
  },

  updateTag: async (id, data) => {
    try {
      const res = await fetch(api(`/api/tags/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update tag');
      const updatedTag: Tag = await res.json();
      set((state) => ({
        tags: state.tags.map((t) => (t.id === id ? updatedTag : t)),
      }));
    } catch (error) {
      console.error('Failed to update tag:', error);
    }
  },

  deleteTag: async (id) => {
    try {
      const res = await fetch(api(`/api/tags/${id}`), { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete tag');
      set((state) => ({
        tags: state.tags.filter((t) => t.id !== id),
      }));
    } catch (error) {
      console.error('Failed to delete tag:', error);
    }
  },

  // CRUD Webhooks
  fetchWebhooks: async () => {
    try {
      const res = await fetch(api('/api/webhooks'));
      if (!res.ok) throw new Error('Failed to fetch webhooks');
      const webhooks: Webhook[] = await res.json();
      set({ webhooks });
    } catch (error) {
      console.error('Failed to fetch webhooks:', error);
    }
  },

  createWebhook: async (data) => {
    try {
      const res = await fetch(api('/api/webhooks'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create webhook');
      }
      const newWebhook: Webhook = await res.json();
      set((state) => ({ webhooks: [...state.webhooks, newWebhook] }));
      return newWebhook;
    } catch (error) {
      console.error('Failed to create webhook:', error);
      throw error;
    }
  },

  updateWebhook: async (id, data) => {
    try {
      const res = await fetch(api(`/api/webhooks/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update webhook');
      const updatedWebhook: Webhook = await res.json();
      set((state) => ({
        webhooks: state.webhooks.map((w) => (w.id === id ? updatedWebhook : w)),
      }));
    } catch (error) {
      console.error('Failed to update webhook:', error);
      throw error;
    }
  },

  deleteWebhook: async (id) => {
    try {
      const res = await fetch(api(`/api/webhooks/${id}`), { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete webhook');
      set((state) => ({
        webhooks: state.webhooks.filter((w) => w.id !== id),
      }));
    } catch (error) {
      console.error('Failed to delete webhook:', error);
    }
  },

  testWebhook: async (id) => {
    try {
      const res = await fetch(api(`/api/webhooks/${id}/test`), { method: 'POST' });
      if (!res.ok) throw new Error('Failed to test webhook');
      return await res.json();
    } catch (error) {
      console.error('Failed to test webhook:', error);
      throw error;
    }
  },

  fetchWebhookDeliveries: async (id) => {
    try {
      const res = await fetch(api(`/api/webhooks/${id}/deliveries`));
      if (!res.ok) throw new Error('Failed to fetch deliveries');
      return await res.json();
    } catch (error) {
      console.error('Failed to fetch deliveries:', error);
      return [];
    }
  },

  createWebhookTrigger: async (data) => {
    try {
      const res = await fetch(api('/api/webhooks/triggers'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create trigger');
      }
      const trigger: WebhookTrigger = await res.json();
      set((state) => ({
        webhooks: state.webhooks.map((w) =>
          w.id === data.webhookId
            ? { ...w, triggers: [...(w.triggers ?? []), trigger] }
            : w
        ),
      }));
      return trigger;
    } catch (error) {
      console.error('Failed to create trigger:', error);
      throw error;
    }
  },

  updateWebhookTrigger: async (id, data) => {
    try {
      const res = await fetch(api(`/api/webhooks/triggers/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update trigger');
      }
      const updated: WebhookTrigger = await res.json();
      set((state) => ({
        webhooks: state.webhooks.map((w) =>
          w.triggers?.some((t) => t.id === id)
            ? { ...w, triggers: w.triggers!.map((t) => (t.id === id ? updated : t)) }
            : w
        ),
      }));
      return updated;
    } catch (error) {
      console.error('Failed to update trigger:', error);
      throw error;
    }
  },

  deleteWebhookTrigger: async (id) => {
    try {
      const res = await fetch(api(`/api/webhooks/triggers/${id}`), { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete trigger');
      set((state) => ({
        webhooks: state.webhooks.map((w) =>
          w.triggers?.some((t) => t.id === id)
            ? { ...w, triggers: w.triggers!.filter((t) => t.id !== id) }
            : w
        ),
      }));
    } catch (error) {
      console.error('Failed to delete trigger:', error);
      throw error;
    }
  },

  // API tokens
  fetchApiTokens: async () => {
    try {
      const res = await fetch(api('/api/user/tokens'));
      if (!res.ok) throw new Error('Failed to fetch API tokens');
      const tokens: ApiToken[] = await res.json();
      set({ apiTokens: tokens });
    } catch (error) {
      console.error('Failed to fetch API tokens:', error);
    }
  },

  createApiToken: async (data) => {
    const res = await fetch(api('/api/user/tokens'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create API token');
    }
    const { token, record } = await res.json() as { token: string; record: ApiToken };
    set((state) => ({ apiTokens: [record, ...state.apiTokens] }));
    return { token, record };
  },

  revokeApiToken: async (id) => {
    const res = await fetch(api(`/api/user/tokens/${id}/revoke`), { method: 'POST' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to revoke API token');
    }
    set((state) => ({
      apiTokens: state.apiTokens.map((t) =>
        t.id === id ? { ...t, revokedAt: new Date().toISOString() } : t
      ),
    }));
  },

  deleteApiToken: async (id) => {
    const res = await fetch(api(`/api/user/tokens/${id}`), { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to delete API token');
    }
    set((state) => ({
      apiTokens: state.apiTokens.filter((t) => t.id !== id),
    }));
  },

  // Attachments
  fetchAttachmentConfig: async () => {
    try {
      const res = await fetch(api('/api/attachments/config'));
      if (!res.ok) throw new Error('Failed to fetch attachment config');
      const config: AttachmentConfig = await res.json();
      set({ attachmentConfig: config });
    } catch (error) {
      console.error('Failed to fetch attachment config:', error);
    }
  },

  fetchAttachments: async (entityId, entityType) => {
    try {
      const res = await fetch(api(`/api/attachments?entityId=${entityId}&entityType=${entityType}`));
      if (!res.ok) throw new Error('Failed to fetch attachments');
      const attachments: Attachment[] = await res.json();
      set({ attachments });
    } catch (error) {
      console.error('Failed to fetch attachments:', error);
    }
  },

  uploadAttachment: async (file, entityId, entityType, hash) => {
    try {
      // Step 1: check hash
      const checkRes = await fetch(api('/api/attachments/check'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash, fileName: file.name, size: file.size, entityId, entityType }),
      });
      if (!checkRes.ok) {
        const err = await checkRes.json().catch(() => ({ error: 'Check failed' }));
        throw new Error(err.error || 'Check failed');
      }
      const checkData = await checkRes.json();

      let attachment: Attachment;

      if (checkData.status === 'deduplicated' || checkData.status === 'already_attached') {
        attachment = checkData.attachment;
      } else if (checkData.status === 'upload_needed') {
        // Step 2: upload file
        const formData = new FormData();
        formData.append('file', file);
        formData.append('entityId', entityId);
        formData.append('entityType', entityType);
        const uploadRes = await fetch(api('/api/attachments/upload'), {
          method: 'POST',
          body: formData,
        });
        if (!uploadRes.ok) {
          const err = await uploadRes.json().catch(() => ({ error: 'Upload failed' }));
          throw new Error(err.error || 'Upload failed');
        }
        attachment = await uploadRes.json();
      } else {
        throw new Error('Unexpected check response');
      }

      set((state) => {
        const updates: Partial<AppState> = { attachments: [...state.attachments, attachment] };

        // Update _count.attachments on the entity in store
        if (entityType === 'task') {
          updates.tasks = state.tasks.map(t =>
            t.id === entityId
              ? { ...t, _count: { ...t._count, subtasks: t._count?.subtasks ?? 0, attachments: (t._count?.attachments ?? 0) + 1 } }
              : t
          );
        } else if (entityType === 'note') {
          updates.notes = state.notes.map(n =>
            n.id === entityId
              ? { ...n, _count: { ...n._count, attachments: (n._count?.attachments ?? 0) + 1 } }
              : n
          );
        }

        return updates;
      });
      return attachment;
    } catch (error) {
      console.error('Failed to upload attachment:', error);
      throw error;
    }
  },

  deleteAttachment: async (id) => {
    try {
      const res = await fetch(api(`/api/attachments?id=${id}`), { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete attachment');
      set((state) => {
        const deleted = state.attachments.find(a => a.id === id);
        const updates: Partial<AppState> = {
          attachments: state.attachments.filter((a) => a.id !== id),
        };

        if (deleted) {
          if (deleted.entityType === 'task') {
            updates.tasks = state.tasks.map(t =>
              t.id === deleted.entityId
                ? { ...t, _count: { ...t._count, subtasks: t._count?.subtasks ?? 0, attachments: Math.max(0, (t._count?.attachments ?? 1) - 1) } }
                : t
            );
          } else if (deleted.entityType === 'note') {
            updates.notes = state.notes.map(n =>
              n.id === deleted.entityId
                ? { ...n, _count: { ...n._count, attachments: Math.max(0, (n._count?.attachments ?? 1) - 1) } }
                : n
            );
          }
        }

        return updates;
      });
    } catch (error) {
      console.error('Failed to delete attachment:', error);
      throw error;
    }
  },

  // Kanban Columns
  fetchStatuses: async () => {
    try {
      const serverRes = await fetch(api('/api/settings'));
      if (serverRes.ok) {
        const serverData = await serverRes.json();
        const serverCols: StatusConfig[] = serverData.statuses || DEFAULT_STATUSES;
        set({ serverStatuses: serverCols });
        const userPrefs = get().userPreferences;
        const resolved = resolveStatuses(userPrefs.customStatuses, serverCols);
        set({ statuses: resolved });
      }
    } catch (error) {
      console.error('Failed to fetch statuses:', error);
    }
  },

  updateCustomStatuses: async (columns) => {
    const current = get().userPreferences;
    try {
      const res = await fetch(api('/api/user/preferences'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customStatuses: columns }),
      });
      if (!res.ok) throw new Error('Failed to update statuses');
      const serverPrefs: UserPreferences = await res.json();
      set({ userPreferences: serverPrefs });
      const resolved = resolveStatuses(serverPrefs.customStatuses, get().serverStatuses);
      set({ statuses: resolved });
    } catch (error) {
      console.error('Failed to update custom statuses:', error);
      set({ userPreferences: current });
    }
  },

  resetCustomStatuses: async () => {
    await get().updateCustomStatuses(null);
  },

  // User Preferences
  fetchUserPreferences: async () => {
    try {
      const res = await fetch(api('/api/user/preferences'));
      if (!res.ok) throw new Error('Failed to fetch preferences');
      const preferences: UserPreferences = await res.json();
      const serverStatuses = get().serverStatuses;
      if (serverStatuses) {
        const resolved = resolveStatuses(preferences.customStatuses, serverStatuses);
        set({ userPreferences: preferences, preferencesLoaded: true, statuses: resolved });
      } else {
        set({ userPreferences: preferences, preferencesLoaded: true });
      }
    } catch (error) {
      console.error('Failed to fetch preferences:', error);
      set({ preferencesLoaded: true });
    }
  },

  updateUserPreference: async (key, value) => {
    const current = get().userPreferences;
    const updated = { ...current, [key]: value };
    set({ userPreferences: updated });
    try {
      const res = await fetch(api('/api/user/preferences'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) throw new Error('Failed to update preference');
      const serverPreferences: UserPreferences = await res.json();
      set({ userPreferences: serverPreferences });
    } catch (error) {
      console.error('Failed to update preference:', error);
      set({ userPreferences: current });
    }
  },

  // ─── External-change sync ───

  forceFullRefetch: async () => {
    const s = get();
    set({ lastSyncedAt: null });
    await Promise.all([
      s.fetchAreas(),
      s.fetchProjects(s.projectsScope?.areaId),
      s.fetchTasks(s.tasksScope?.projectId, s.tasksScope?.search),
      s.fetchNotes(s.notesScope?.projectId),
      s.fetchFolders(s.foldersScope?.projectId),
      s.fetchReleases(),
      s.fetchTags(),
    ]);
  },

  syncChanges: async () => {
    const s0 = get();
    const since = s0.lastSyncedAt ?? new Date(Date.now() - 60_000).toISOString();
    const params = new URLSearchParams({ since });
    if (s0.selectedTaskId) params.set('commentTaskId', s0.selectedTaskId);
    if (s0.tasksScope?.projectId) params.set('taskProjectId', s0.tasksScope.projectId);
    if (s0.tasksScope?.search) params.set('taskSearch', s0.tasksScope.search);
    if (s0.notesScope?.projectId) params.set('noteProjectId', s0.notesScope.projectId);
    if (s0.foldersScope?.projectId) params.set('folderProjectId', s0.foldersScope.projectId);
    if (s0.projectsScope?.areaId) params.set('projectAreaId', s0.projectsScope.areaId);

    const res = await fetch(api(`/api/sync/changes?${params.toString()}`));
    if (res.status === 401 || res.status === 403) {
      set({ syncPaused: true });
      return;
    }
    if (res.status === 400) {
      // stale-since: the watermark is unusable — rebuild everything from full fetches
      await get().forceFullRefetch();
      return;
    }
    if (!res.ok) throw new Error(`Sync failed: ${res.status}`);
    const payload: SyncChangesPayload = await res.json();
    set({ lastSyncedAt: payload.serverTime, syncPaused: false });

    if (payload.truncated) {
      // Too many changes to merge safely — a full refetch re-establishes the watermark too
      await get().forceFullRefetch();
      return;
    }

    const cur = get();
    const dismissed = { ...cur.dismissedConflicts };
    const conflicts: SyncConflict[] = cur.pendingConflicts.map((c) => ({ ...c }));

    const openTaskId = cur.selectedTaskId;
    const openTaskRow = openTaskId ? cur.tasks.find((t) => t.id === openTaskId) : undefined;
    const isTaskProtected = (id: string): boolean => {
      if (id === cur.draggedTaskId) return true;
      if (!openTaskId || !cur.taskDialogDirty) return false;
      if (id === openTaskId) return true;
      return !!openTaskRow?.subtasks?.some((st) => st.id === id);
    };
    const isNoteProtected = (id: string): boolean => cur.noteEditor.noteId === id && cur.noteEditor.dirty;

    // Comments of the open task always refresh silently (never a conflict)
    const openTaskChangedExternally = (payload.changed.tasks as Array<{ id: string }>).some((t) => t.id === openTaskId);
    if (openTaskId && (payload.openTask?.commentsChanged || openTaskChangedExternally)) {
      get().fetchComments(openTaskId);
    }

    if (payload.changed.users.length) {
      const incoming = payload.changed.users;
      set((s) => ({
        users: [
          ...s.users.map((u) => incoming.find((x) => x.id === u.id) ?? u),
          ...incoming.filter((x) => !s.users.some((u) => u.id === x.id)),
        ],
      }));
    }

    const unscopedTasks = !cur.tasksScope?.projectId && !cur.tasksScope?.search;

    const areaMerge = mergeSyncedEntities({
      entityType: 'area',
      current: cur.areas,
      changed: payload.changed.areas as unknown as Array<{ id: string; updatedAt: string }>,
      allIds: payload.allIds.areas,
      allowAdditions: true,
      isProtected: () => false,
      dismissed,
      conflicts,
    });
    const projectMerge = mergeSyncedEntities({
      entityType: 'project',
      current: cur.projects,
      changed: payload.changed.projects as unknown as Array<{ id: string; updatedAt: string }>,
      allIds: payload.allIds.projects,
      allowAdditions: true,
      isProtected: () => false,
      dismissed,
      conflicts,
    });
    const tagMerge = mergeSyncedEntities({
      entityType: 'tag',
      current: cur.tags,
      changed: payload.changed.tags as unknown as Array<{ id: string; updatedAt: string }>,
      allIds: payload.allIds.tags,
      allowAdditions: true,
      isProtected: () => false,
      dismissed,
      conflicts,
    });
    const releaseMerge = mergeSyncedEntities({
      entityType: 'release',
      current: cur.releases,
      changed: payload.changed.releases as unknown as Array<{ id: string; updatedAt: string }>,
      allIds: payload.allIds.releases,
      allowAdditions: true,
      isProtected: () => false,
      dismissed,
      conflicts,
    });
    const folderMerge = mergeSyncedEntities({
      entityType: 'folder',
      current: cur.folders,
      changed: payload.changed.folders as unknown as Array<{ id: string; updatedAt: string }>,
      allIds: payload.allIds.folders,
      allowAdditions: true,
      isProtected: () => false,
      dismissed,
      conflicts,
    });
    const noteMerge = mergeSyncedEntities(
      {
        entityType: 'note',
        current: cur.notes,
        changed: payload.changed.notes as unknown as Array<{ id: string; updatedAt: string }>,
        allIds: payload.allIds.notes,
        allowAdditions: true,
        isProtected: isNoteProtected,
        dismissed,
        conflicts,
      },
      cur.selectedNoteId ? [cur.selectedNoteId] : [],
    );
    const taskMerge = mergeSyncedEntities(
      {
        entityType: 'task',
        current: cur.tasks,
        changed: payload.changed.tasks as unknown as Task[],
        allIds: payload.allIds.tasks,
        allowAdditions: unscopedTasks,
        isProtected: isTaskProtected,
        dismissed,
        conflicts,
      },
      openTaskId ? [openTaskId] : [],
    );

    // Mirror applied/deleted subtask rows into their parents' denormalized
    // `subtasks` arrays, same shape as updateTask/deleteTask.
    let tasks = taskMerge.rows;
    if (taskMerge.touched) {
      tasks = tasks.map((row) => {
        if (!row.subtasks?.length) return row;
        const changed = row.subtasks.some(
          (st) => taskMerge.applied.has(st.id) || taskMerge.deletedIds.has(st.id),
        );
        if (!changed) return row;
        const subtasks = row.subtasks
          .map((st) => taskMerge.applied.get(st.id) ?? st)
          .filter((st) => !taskMerge.deletedIds.has(st.id));
        return { ...row, subtasks, ...recomputeSubtaskAggregates({ ...row, subtasks }) };
      });
    }

    const patches: Partial<AppState> = {
      areas: areaMerge.rows as Area[],
      projects: projectMerge.rows as Project[],
      tags: tagMerge.rows as Tag[],
      folders: folderMerge.rows as NoteFolder[],
      releases: releaseMerge.rows as Release[],
      notes: noteMerge.rows as Note[],
      tasks,
      pendingConflicts: conflicts,
      dismissedConflicts: dismissed,
    };
    if (taskMerge.touched && !cur.taskSearchQuery) {
      Object.assign(patches, computeTaskCounts(tasks));
    }
    if (taskMerge.mergedWatched.length) patches.taskDialogRefreshTick = cur.taskDialogRefreshTick + 1;
    if (noteMerge.mergedWatched.length) patches.noteEditorReloadTick = cur.noteEditorReloadTick + 1;
    if (noteMerge.deletedIds.has(cur.selectedNoteId ?? '')) patches.selectedNoteId = null;
    if (folderMerge.deletedIds.has(cur.selectedFolderId ?? '')) patches.selectedFolderId = null;
    if (projectMerge.deletedIds.has(cur.selectedProjectId ?? '')) patches.selectedProjectId = null;
    if (areaMerge.deletedIds.has(cur.selectedAreaId ?? '')) patches.selectedAreaId = null;
    if (releaseMerge.deletedIds.has(cur.selectedReleaseId ?? '')) patches.selectedReleaseId = null;
    set(patches);

    // Scoped views: search/project filters are server-side, so restore the exact
    // view with one refetch — but only when the merge actually touched rows.
    const s2 = get();
    if (taskMerge.touched && (s2.tasksScope?.projectId || s2.tasksScope?.search)) {
      get().fetchTasks(s2.tasksScope?.projectId, s2.tasksScope?.search);
    }
    // Release rows carry the badge text/status shown on task/note/folder cards —
    // refresh the entity lists so the denormalized `release` selects stay fresh.
    if (releaseMerge.touched) {
      get().fetchTasks(s2.tasksScope?.projectId, s2.tasksScope?.search);
      get().fetchNotes(s2.notesScope?.projectId);
      get().fetchFolders(s2.foldersScope?.projectId);
    }
    if (noteMerge.touched && s2.notesScope?.projectId) {
      get().fetchNotes(s2.notesScope.projectId);
    }
    if (folderMerge.touched && s2.foldersScope?.projectId) {
      get().fetchFolders(s2.foldersScope.projectId);
    }
    if ((projectMerge.touched || areaMerge.touched) && s2.projectsScope?.areaId) {
      get().fetchProjects(s2.projectsScope.areaId);
    }
  },

  resolveConflict: (entityId, entityType, choice) => {
    const conflict = get().pendingConflicts.find((c) => c.entityType === entityType && c.id === entityId);
    if (!conflict) return;

    // Drop stale update-conflicts: the store row is already at least as fresh as
    // the conflicted revision (e.g. our own drag mutation's response beat the poll).
    // Deletion conflicts keep the equality case — serverUpdatedAt IS the row's revision.
    if (conflict.kind === 'updated') {
      const pool: Array<{ id: string; updatedAt: string }> =
        entityType === 'task' ? get().tasks
        : entityType === 'note' ? get().notes
        : entityType === 'folder' ? get().folders
        : entityType === 'project' ? get().projects
        : entityType === 'area' ? get().areas
        : entityType === 'release' ? get().releases
        : get().tags;
      const curRow = pool.find((r) => r.id === entityId);
      if (curRow && new Date(curRow.updatedAt).getTime() >= new Date(conflict.serverUpdatedAt).getTime()) {
        set((s) => ({
          pendingConflicts: s.pendingConflicts.filter((c) => !(c.entityType === entityType && c.id === entityId)),
        }));
        return;
      }
    }

    if (choice === 'keep') {
      set((s) => ({
        pendingConflicts: s.pendingConflicts.filter((c) => !(c.entityType === entityType && c.id === entityId)),
        dismissedConflicts: { ...s.dismissedConflicts, [entityId]: conflict.serverUpdatedAt },
      }));
      return;
    }

    set((s) => {
      const dismissedConflicts = { ...s.dismissedConflicts };
      delete dismissedConflicts[entityId];
      const next: Partial<AppState> = {
        pendingConflicts: s.pendingConflicts.filter((c) => !(c.entityType === entityType && c.id === entityId)),
        dismissedConflicts,
      };

      if (conflict.kind === 'deleted') {
        if (entityType === 'task') {
          const remainingTasks = s.tasks
            .filter((t) => t.id !== entityId)
            .map((t) => {
              if (!t.subtasks?.some((st) => st.id === entityId)) return t;
              const subtasks = t.subtasks.filter((st) => st.id !== entityId);
              return { ...t, subtasks, ...recomputeSubtaskAggregates({ ...t, subtasks }) };
            });
          next.tasks = remainingTasks;
          if (!s.taskSearchQuery) Object.assign(next, computeTaskCounts(remainingTasks));
          next.selectedTaskId = s.selectedTaskId === entityId ? null : s.selectedTaskId;
          next.taskDialogDirty = false;
        } else if (entityType === 'note') {
          next.notes = s.notes.filter((n) => n.id !== entityId);
          next.selectedNoteId = s.selectedNoteId === entityId ? null : s.selectedNoteId;
        } else if (entityType === 'folder') {
          const removedIds = new Set(collectFolderIds(entityId, s.folders));
          next.folders = s.folders.filter((f) => !removedIds.has(f.id));
          next.notes = s.notes.filter((n) => !removedIds.has(n.folderId ?? ''));
          next.selectedFolderId = s.selectedFolderId && removedIds.has(s.selectedFolderId) ? null : s.selectedFolderId;
        } else if (entityType === 'project') {
          next.projects = s.projects.filter((p) => p.id !== entityId);
        } else if (entityType === 'area') {
          next.areas = s.areas.filter((a) => a.id !== entityId);
        } else if (entityType === 'tag') {
          next.tags = s.tags.filter((t) => t.id !== entityId);
        } else if (entityType === 'release') {
          next.releases = s.releases.filter((r) => r.id !== entityId);
        }
        return next;
      }

      const serverEntity = conflict.serverEntity;
      if (entityType === 'task' && serverEntity) {
        const t = serverEntity as Task;
        const mergedTasks = s.tasks.map((row) => {
          if (row.id === t.id) {
            return { ...t, subtasks: t.subtasks ?? row.subtasks, completedSubtasks: t.completedSubtasks ?? row.completedSubtasks };
          }
          if (t.parentId && row.id === t.parentId && row.subtasks?.some((st) => st.id === t.id)) {
            const subtasks = row.subtasks.map((st) => (st.id === t.id ? { ...st, ...t } : st));
            return { ...row, subtasks, ...recomputeSubtaskAggregates({ ...row, subtasks }) };
          }
          return row;
        });
        next.tasks = mergedTasks;
        if (!s.taskSearchQuery) Object.assign(next, computeTaskCounts(mergedTasks));
        if (s.selectedTaskId === t.id) {
          next.taskDialogRefreshTick = s.taskDialogRefreshTick + 1;
          next.taskDialogDirty = false;
        }
      } else if (entityType === 'note' && serverEntity) {
        const n = serverEntity as Note;
        next.notes = s.notes.map((row) => (row.id === n.id ? n : row));
        if (s.selectedNoteId === n.id) next.noteEditorReloadTick = s.noteEditorReloadTick + 1;
      } else if (entityType === 'folder' && serverEntity) {
        const f = serverEntity as NoteFolder;
        next.folders = s.folders.map((row) => (row.id === f.id ? f : row));
      } else if (entityType === 'project' && serverEntity) {
        const p = serverEntity as Project;
        next.projects = s.projects.map((row) => (row.id === p.id ? p : row));
      } else if (entityType === 'area' && serverEntity) {
        const a = serverEntity as Area;
        next.areas = s.areas.map((row) => (row.id === a.id ? a : row));
      } else if (entityType === 'tag' && serverEntity) {
        const tg = serverEntity as Tag;
        next.tags = s.tags.map((row) => (row.id === tg.id ? tg : row));
      } else if (entityType === 'release' && serverEntity) {
        const r = serverEntity as Release;
        next.releases = s.releases.map((row) => (row.id === r.id ? r : row));
      }
      return next;
    });
  },

  setNoteEditorState: (noteId, dirty) => set({ noteEditor: { noteId, dirty } }),
  setTaskDialogDirty: (dirty) => set({ taskDialogDirty: dirty }),
  setDraggedTask: (id) => set({ draggedTaskId: id }),
}));

/** True in PUBLIC_READONLY mode when the current visitor has no session (guest). */
export function useIsGuest(): boolean {
  return useAppStore((s) => s.publicReadonly && !s.currentUserId);
}
