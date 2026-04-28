export interface Area {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string | null;
  metadata: Record<string, unknown>;
  tagIds: string[];
  ownerId: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  projects?: Project[];
  _count?: { projects: number };
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string | null;
  status: string;
  metadata: Record<string, unknown>;
  tagIds: string[];
  areaId: string | null;
  ownerId: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  area?: Area;
  tasks?: Task[];
  notes?: Note[];
  _count?: { tasks: number; notes: number };
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  assigneeId: string | null;
  projectId: string | null;
  parentId: string | null;
  metadata: Record<string, unknown>;
  tagIds: string[];
  sortOrder: number;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  project?: Project;
  parent?: Task;
  subtasks?: Task[];
  _count?: { subtasks: number };
  completedSubtasks?: number;
}

export interface Comment {
  id: string;
  content: string;
  taskId: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  owner?: { id: string; name: string | null; email: string; image: string | null };
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  projectId: string | null;
  metadata: Record<string, unknown>;
  tagIds: string[];
  ownerId: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  project?: Project;
}
