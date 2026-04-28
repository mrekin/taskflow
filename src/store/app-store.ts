import { create } from 'zustand';
import type { Area, Project, Task, Note, Comment, Tag } from '@/lib/types';

type ViewType = 'areas' | 'projects' | 'tasks' | 'kanban' | 'notes' | 'note-editor' | 'settings' | 'quick-create';

interface AppState {
  // Navigation
  currentView: ViewType;
  selectedAreaId: string | null;
  selectedProjectId: string | null;
  selectedTaskId: string | null;
  selectedNoteId: string | null;

  // Data
  areas: Area[];
  projects: Project[];
  tasks: Task[];
  notes: Note[];
  tags: Tag[];
  comments: Comment[];

  // UI State
  sidebarOpen: boolean;
  isLoading: boolean;
  taskStatusFilter: string;
  tagFilter: string[];

  // Actions - Navigation
  setCurrentView: (view: ViewType) => void;
  selectArea: (id: string | null) => void;
  selectProject: (id: string | null) => void;
  selectTask: (id: string | null) => void;
  selectNote: (id: string | null) => void;
  toggleSidebar: () => void;
  setTaskStatusFilter: (filter: string) => void;
  setTagFilter: (tagIds: string[]) => void;

  // Actions - Data Fetching
  fetchAreas: () => Promise<void>;
  fetchProjects: (areaId?: string) => Promise<void>;
  fetchTasks: (projectId?: string) => Promise<void>;
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

  // Actions - CRUD Comments
  createComment: (data: { content: string; taskId: string }) => Promise<void>;
  updateComment: (id: string, data: { content: string }) => Promise<void>;
  deleteComment: (id: string) => Promise<void>;

  // Actions - CRUD Tags
  createTag: (data: { name: string; color?: string }) => Promise<void>;
  updateTag: (id: string, data: Partial<Tag>) => Promise<void>;
  deleteTag: (id: string) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Navigation initial state
  currentView: 'areas',
  selectedAreaId: null,
  selectedProjectId: null,
  selectedTaskId: null,
  selectedNoteId: null,

  // Data initial state
  areas: [],
  projects: [],
  tasks: [],
  notes: [],
  tags: [],
  comments: [],

  // UI initial state
  sidebarOpen: true,
  isLoading: false,
  taskStatusFilter: 'all',
  tagFilter: [],

  // Navigation actions
  setCurrentView: (view) => set({ currentView: view }),
  selectArea: (id) => set({ selectedAreaId: id }),
  selectProject: (id) => set({ selectedProjectId: id }),
  selectTask: (id) => set({ selectedTaskId: id }),
  selectNote: (id) => set({ selectedNoteId: id }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setTaskStatusFilter: (filter) => set({ taskStatusFilter: filter }),
  setTagFilter: (tagIds) => set({ tagFilter: tagIds }),

  // Data Fetching
  fetchAreas: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch('/api/areas');
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
      const url = areaId ? `/api/projects?areaId=${areaId}` : '/api/projects';
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

  fetchTasks: async (projectId?: string) => {
    set({ isLoading: true });
    try {
      const url = projectId ? `/api/tasks?projectId=${projectId}` : '/api/tasks';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch tasks');
      const tasks: Task[] = await res.json();
      set({ tasks });
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  fetchNotes: async (projectId?: string) => {
    set({ isLoading: true });
    try {
      const url = projectId ? `/api/notes?projectId=${projectId}` : '/api/notes';
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
      const res = await fetch('/api/tags');
      if (!res.ok) throw new Error('Failed to fetch tags');
      const tags: Tag[] = await res.json();
      set({ tags });
    } catch (error) {
      console.error('Failed to fetch tags:', error);
    }
  },

  fetchComments: async (taskId: string) => {
    try {
      const res = await fetch(`/api/comments?taskId=${taskId}`);
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
      const res = await fetch('/api/areas', {
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
      const res = await fetch(`/api/areas/${id}`, {
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
      const res = await fetch(`/api/areas/${id}`, { method: 'DELETE' });
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
      const res = await fetch('/api/projects', {
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
      const res = await fetch(`/api/projects/${id}`, {
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
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
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
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create task');
      const newTask: Task = await res.json();
      set((state) => ({ tasks: [...state.tasks, newTask] }));
    } catch (error) {
      console.error('Failed to create task:', error);
    }
  },

  updateTask: async (id, data) => {
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update task');
      const updatedTask: Task = await res.json();
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === id ? updatedTask : t)),
      }));
    } catch (error) {
      console.error('Failed to update task:', error);
    }
  },

  deleteTask: async (id) => {
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
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
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create note');
      const newNote: Note = await res.json();
      set((state) => ({ notes: [...state.notes, newNote] }));
    } catch (error) {
      console.error('Failed to create note:', error);
    }
  },

  updateNote: async (id, data) => {
    try {
      const res = await fetch(`/api/notes/${id}`, {
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
      const res = await fetch(`/api/notes/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete note');
      set((state) => ({
        notes: state.notes.filter((n) => n.id !== id),
        selectedNoteId: state.selectedNoteId === id ? null : state.selectedNoteId,
      }));
    } catch (error) {
      console.error('Failed to delete note:', error);
    }
  },

  // CRUD Comments
  createComment: async (data) => {
    try {
      const res = await fetch('/api/comments', {
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
      const res = await fetch(`/api/comments/${id}`, {
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
      const res = await fetch(`/api/comments/${id}`, { method: 'DELETE' });
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
      const res = await fetch('/api/tags', {
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
      const res = await fetch(`/api/tags/${id}`, {
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
      const res = await fetch(`/api/tags/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete tag');
      set((state) => ({
        tags: state.tags.filter((t) => t.id !== id),
      }));
    } catch (error) {
      console.error('Failed to delete tag:', error);
    }
  },
}));
