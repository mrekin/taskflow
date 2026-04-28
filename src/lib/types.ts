export interface Area {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string | null;
  metadata: Record<string, unknown>;
  tagIds: string[];
  shortIdNum: number;
  shortId: string;
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
  shortIdNum: number;
  shortId: string;
  areaId: string | null;
  ownerId: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  area?: Area;
  tasks?: Task[];
  notes?: Note[];
  _count?: { tasks: number; topLevelTasks: number; notes: number };
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
  shortIdNum: number;
  shortId: string;
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

export interface Webhook {
  id: string;
  name: string;
  url: string;
  method: string;
  events: string[];
  scopeType: string | null;
  scopeId: string | null;
  headers: Record<string, string>;
  bodyTemplate: string | null;
  active: boolean;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  _count?: { deliveries: number };
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  payload: string;
  statusCode: number | null;
  response: string | null;
  success: boolean;
  createdAt: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  projectId: string | null;
  metadata: Record<string, unknown>;
  tagIds: string[];
  shortIdNum: number;
  shortId: string;
  ownerId: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  project?: Project;
}
