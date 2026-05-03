import { create } from 'zustand';
import type { Area, Project, Task, Note, NoteFolder, Comment, Tag, Webhook, WebhookDelivery } from '@/lib/types';
import { DEFAULT_PREFERENCES, type UserPreferences, type StatusConfig, resolveStatuses, DEFAULT_STATUSES } from '@/lib/constants';

const basePath = process.env.NEXT_BASE_PATH || '';
const api = (path: string) => `${basePath}${path}`;

type ViewType = 'areas' | 'projects' | 'tasks' | 'kanban' | 'notes' | 'note-editor' | 'settings' | 'quick-create';

interface AppState {
  // Navigation
  currentView: ViewType;
  selectedAreaId: string | null;
  selectedProjectId: string | null;
  selectedTaskId: string | null;
  selectedNoteId: string | null;
  selectedFolderId: string | null;

  // Data
  areas: Area[];
  projects: Project[];
  tasks: Task[];
  notes: Note[];
  folders: NoteFolder[];
  tags: Tag[];
  comments: Comment[];
  webhooks: Webhook[];

  // UI State
  sidebarOpen: boolean;
  isLoading: boolean;
  taskStatusFilter: string;
  tagFilter: string[];
  projectFilter: string[];
  taskSearchQuery: string;
  noteSearchQuery: string;
  noteSearchResults: Note[];
  folderSearchResults: NoteFolder[];
  totalTaskCount: number;
  totalTaskStatusCounts: Record<string, number>;

  // User Preferences
  userPreferences: UserPreferences;
  preferencesLoaded: boolean;

  // Kanban Columns
  statuses: StatusConfig[];
  serverStatuses: StatusConfig[] | null;

  // Actions - Navigation
  setCurrentView: (view: ViewType) => void;
  selectArea: (id: string | null) => void;
  selectProject: (id: string | null) => void;
  selectTask: (id: string | null) => void;
  selectNote: (id: string | null) => void;
  selectFolder: (id: string | null) => void;
  toggleSidebar: () => void;
  setTaskStatusFilter: (filter: string) => void;
  setTagFilter: (tagIds: string[]) => void;
  setProjectFilter: (projectIds: string[]) => void;
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
  createTask: (data: Partial<Task>) => Promise<void>;
  updateTask: (id: string, data: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;

  // Actions - CRUD Notes
  createNote: (data: Partial<Note>) => Promise<void>;
  updateNote: (id: string, data: Partial<Note>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;

  // Actions - CRUD Folders
  fetchFolders: (projectId?: string) => Promise<void>;
  createFolder: (data: Partial<NoteFolder>) => Promise<void>;
  updateFolder: (id: string, data: Partial<NoteFolder>) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;

  // Actions - CRUD Comments
  createComment: (data: { content: string; taskId: string }) => Promise<void>;
  updateComment: (id: string, data: { content: string }) => Promise<void>;
  deleteComment: (id: string) => Promise<void>;

  // Actions - CRUD Tags
  createTag: (data: { name: string; color?: string }) => Promise<void>;
  updateTag: (id: string, data: Partial<Tag>) => Promise<void>;
  deleteTag: (id: string) => Promise<void>;

  // Actions - CRUD Webhooks
  fetchWebhooks: () => Promise<void>;
  createWebhook: (data: Partial<Webhook>) => Promise<void>;
  updateWebhook: (id: string, data: Partial<Webhook>) => Promise<void>;
  deleteWebhook: (id: string) => Promise<void>;
  testWebhook: (id: string) => Promise<{ success: boolean; statusCode: number | null; response: string | null; elapsed: number }>;
  fetchWebhookDeliveries: (id: string) => Promise<WebhookDelivery[]>;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Navigation initial state
  currentView: 'quick-create',
  selectedAreaId: null,
  selectedProjectId: null,
  selectedTaskId: null,
  selectedNoteId: null,
  selectedFolderId: null,

  // Data initial state
  areas: [],
  projects: [],
  tasks: [],
  notes: [],
  folders: [],
  tags: [],
  comments: [],
  webhooks: [],

  // UI initial state
  sidebarOpen: true,
  isLoading: false,
  taskStatusFilter: 'all',
  tagFilter: [],
  projectFilter: [],
  taskSearchQuery: '',
  noteSearchQuery: '',
  noteSearchResults: [],
  folderSearchResults: [],
  totalTaskCount: 0,
  totalTaskStatusCounts: { todo: 0, in_progress: 0, done: 0, cancelled: 0 },

  // User Preferences initial state
  userPreferences: DEFAULT_PREFERENCES,
  preferencesLoaded: false,

  // Kanban Columns initial state
  statuses: DEFAULT_STATUSES,
  serverStatuses: null,

  // Navigation actions
  setCurrentView: (view) => set({ currentView: view }),
  selectArea: (id) => set({ selectedAreaId: id }),
  selectProject: (id) => set({ selectedProjectId: id }),
  selectTask: (id) => set({ selectedTaskId: id }),
  selectNote: (id) => set({ selectedNoteId: id }),
  selectFolder: (id) => set({ selectedFolderId: id }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setTaskStatusFilter: (filter) => set({ taskStatusFilter: filter }),
  setTagFilter: (tagIds) => set({ tagFilter: tagIds }),
  setProjectFilter: (projectIds) => set({ projectFilter: projectIds }),
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
      set({ projects });
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
      const updates: Partial<AppState> = { tasks };
      if (!actualSearch) {
        const topLevel = tasks.filter((t) => !t.parentId);
        updates.totalTaskCount = topLevel.length;
        updates.totalTaskStatusCounts = {
          todo: topLevel.filter((t) => t.status === 'todo').length,
          in_progress: topLevel.filter((t) => t.status === 'in_progress').length,
          done: topLevel.filter((t) => t.status === 'done').length,
          cancelled: topLevel.filter((t) => t.status === 'cancelled').length,
        };
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
      set({ notes });
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
            parent.subtasks = [...(parent.subtasks ?? []), {
              id: newTask.id,
              title: newTask.title,
              status: newTask.status,
              priority: newTask.priority,
              parentId: newTask.parentId,
              shortIdNum: newTask.shortIdNum,
              shortId: newTask.shortId,
            } as Task];
            parent._count = { subtasks: (parent._count?.subtasks ?? 0) + 1 };
            parent.completedSubtasks = (parent.completedSubtasks ?? 0) + (newTask.status === 'done' ? 1 : 0);
            tasks[parentIdx] = parent;
          }
        }
        return { tasks };
      });
    } catch (error) {
      console.error('Failed to create task:', error);
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
          if (t.id !== id) return t;
          return {
            ...updatedTask,
            subtasks: updatedTask.subtasks ?? t.subtasks,
            completedSubtasks: updatedTask.completedSubtasks ?? t.completedSubtasks,
          };
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
      set((state) => ({
        tasks: state.tasks.filter((t) => t.id !== id),
        selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId,
      }));
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

  // CRUD Folders
  fetchFolders: async (projectId?: string) => {
    set({ isLoading: true });
    try {
      const url = projectId ? api(`/api/folders?projectId=${projectId}`) : api('/api/folders');
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch folders');
      const folders: NoteFolder[] = await res.json();
      set({ folders });
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
      const collectIds = (folderId: string, folders: NoteFolder[]): string[] => {
        const children = folders.filter((f) => f.parentId === folderId);
        return [folderId, ...children.flatMap((c) => collectIds(c.id, folders))];
      };
      set((state) => {
        const removedIds = new Set(collectIds(id, state.folders));
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
      set((state) => ({
        comments: state.comments.filter((c) => c.id !== id),
      }));
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
}));
