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
  visibility: string | null;
  visibleUserIds: string[];
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
  visibility: string | null;
  visibleUserIds: string[];
  createdAt: string;
  updatedAt: string;
  area?: Area;
  tasks?: Task[];
  notes?: Note[];
  folders?: NoteFolder[];
  _count?: { tasks: number; topLevelTasks: number; notes: number; folders: number };
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
  visibility: string | null;
  visibleUserIds: string[];
  createdAt: string;
  updatedAt: string;
  assignee?: { id: string; name: string | null; email: string; image: string | null } | null;
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

export interface WebhookTrigger {
  id: string;
  webhookId: string;
  events: string[];
  scopeType: string | null;
  scopeId: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Webhook {
  id: string;
  name: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  bodyTemplate: string | null;
  active: boolean;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  triggers?: WebhookTrigger[];
  _count?: { deliveries: number; triggers: number };
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
  folderId: string | null;
  metadata: Record<string, unknown>;
  tagIds: string[];
  shortIdNum: number;
  shortId: string;
  ownerId: string;
  sortOrder: number;
  visibility: string | null;
  visibleUserIds: string[];
  createdAt: string;
  updatedAt: string;
  project?: Project;
  folder?: NoteFolder;
}

export interface NoteFolder {
  id: string;
  name: string;
  projectId: string | null;
  parentId: string | null;
  metadata: Record<string, unknown>;
  shortIdNum: number;
  shortId: string;
  ownerId: string;
  sortOrder: number;
  visibility: string | null;
  visibleUserIds: string[];
  createdAt: string;
  updatedAt: string;
  parent?: NoteFolder;
  children?: NoteFolder[];
  notes?: Note[];
  _count?: { children: number; notes: number };
}
