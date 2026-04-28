'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Edit2,
  Plus,
  Trash2,
  LayoutGrid,
  List,
  FileText,
  StickyNote,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TaskList } from '@/components/task-list';
import { KanbanBoard } from '@/components/kanban-board';
import { CreateTaskDialog } from '@/components/create-task-dialog';
import { useAppStore } from '@/store/app-store';
import {
  DEFAULT_COLORS,
  STATUS_LABELS,
  PROJECT_STATUSES,
} from '@/lib/constants';
import { TagPicker } from '@/components/tag-picker';
import { TagBadges } from '@/components/tag-badges';
import { EntityIdBadge } from '@/components/entity-id-badge';

export function ProjectDetail() {
  const {
    projects,
    selectedProjectId,
    areas,
    selectProject,
    setCurrentView,
    selectArea,
    updateProject,
    deleteProject,
    createNote,
    notes,
    fetchNotes,
    tasks,
  } = useAppStore();

  const project = projects.find((p) => p.id === selectedProjectId);
  const area = project?.areaId ? areas.find((a) => a.id === project.areaId) : null;
  const projectNotes = notes.filter((n) => n.projectId === selectedProjectId);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCreateNote, setShowCreateNote] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [editTagIds, setEditTagIds] = useState<string[]>([]);

  // Fetch notes for this project
  useEffect(() => {
    if (selectedProjectId) {
      fetchNotes(selectedProjectId);
    }
  }, [selectedProjectId, fetchNotes]);

  const handleEdit = () => {
    if (!project) return;
    setEditName(project.name);
    setEditDescription(project.description || '');
    setEditColor(project.color);
    setEditStatus(project.status);
    setEditTagIds(project.tagIds || []);
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!project || !editName.trim()) return;
    await updateProject(project.id, {
      name: editName.trim(),
      description: editDescription.trim() || null,
      color: editColor,
      status: editStatus,
      tagIds: editTagIds,
    });
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!project) return;
    await deleteProject(project.id);
    selectProject(null);
    setCurrentView('areas');
    setShowDeleteDialog(false);
  };

  const handleCreateNote = async () => {
    if (!selectedProjectId || !newNoteTitle.trim()) return;
    await createNote({
      title: newNoteTitle.trim(),
      content: newNoteContent,
      projectId: selectedProjectId,
    });
    setShowCreateNote(false);
    setNewNoteTitle('');
    setNewNoteContent('');
  };

  const handleAreaClick = () => {
    if (area) {
      selectArea(area.id);
      setCurrentView('areas');
    }
  };

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>Select a project to view details</p>
      </div>
    );
  }

  const taskCount = tasks.filter((t) => t.projectId === selectedProjectId && !t.parentId).length;

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      {area && (
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink
                className="cursor-pointer"
                onClick={handleAreaClick}
              >
                {area.name}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{project.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      )}

      {/* Project header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-4 h-4 rounded-full shrink-0"
            style={{ backgroundColor: project.color }}
          />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{project.name}</h1>
              <EntityIdBadge id={project.id} shortId={project.shortId || 'P-?'} type="project" />
            </div>
            {project.description && (
              <p className="text-sm text-muted-foreground mt-1">{project.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {STATUS_LABELS[project.status] || project.status}
          </Badge>
          {project.tagIds && project.tagIds.length > 0 && (
            <TagBadges tagIds={project.tagIds} max={3} size="sm" />
          )}
          <Button variant="outline" size="sm" onClick={handleEdit}>
            <Edit2 className="size-4 mr-1" /> Edit
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setShowDeleteDialog(true)}>
            <Trash2 className="size-4 mr-1" /> Delete
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="py-3">
          <CardContent className="text-center px-4 py-0">
            <div className="text-2xl font-bold">{taskCount}</div>
            <div className="text-xs text-muted-foreground">Tasks</div>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="text-center px-4 py-0">
            <div className="text-2xl font-bold">{projectNotes.length}</div>
            <div className="text-xs text-muted-foreground">Notes</div>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="text-center px-4 py-0">
            <div className="text-2xl font-bold">
              {tasks.filter((t) => t.projectId === selectedProjectId && !t.parentId && t.status === 'done').length}
            </div>
            <div className="text-xs text-muted-foreground">Completed</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="tasks" className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="tasks" className="gap-1.5">
              <List className="size-3.5" /> Tasks
            </TabsTrigger>
            <TabsTrigger value="kanban" className="gap-1.5">
              <LayoutGrid className="size-3.5" /> Kanban
            </TabsTrigger>
            <TabsTrigger value="notes" className="gap-1.5">
              <StickyNote className="size-3.5" /> Notes
            </TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setShowCreateTask(true)}>
              <Plus className="size-4 mr-1" /> Add Task
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowCreateNote(true)}>
              <Plus className="size-4 mr-1" /> Add Note
            </Button>
          </div>
        </div>

        <TabsContent value="tasks">
          <TaskList />
        </TabsContent>

        <TabsContent value="kanban">
          <KanbanBoard />
        </TabsContent>

        <TabsContent value="notes">
          {projectNotes.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <AnimatePresence mode="popLayout">
                {projectNotes.map((note) => (
                  <motion.div
                    key={note.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Card className="cursor-pointer hover:shadow-md transition-all">
                      <CardHeader className="pb-2 pt-0 px-4">
                        <div className="flex items-center gap-2">
                          <FileText className="size-4 text-muted-foreground" />
                          <CardTitle className="text-sm">{note.title}</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 pb-3">
                        <div className="text-xs text-muted-foreground line-clamp-3 [&_*]:text-xs [&_h1]:text-xs [&_h2]:text-xs [&_h3]:text-xs [&_p]:m-0 [&_ul]:m-0 [&_ol]:m-0 [&_li]:m-0 [&_blockquote]:m-0 [&_pre]:m-0">
                          <MarkdownRenderer content={note.content || 'No content'} compact />
                        </div>
                        {note.tagIds && note.tagIds.length > 0 && (
                          <div className="mt-2">
                            <TagBadges tagIds={note.tagIds} max={2} size="sm" />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground border rounded-lg border-dashed">
              <StickyNote className="size-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No notes yet</p>
              <p className="text-xs mt-1">Create a note to get started</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Project Dialog */}
      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
            <DialogDescription>Update the project details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Project name"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Description"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_COLORS.map((color) => (
                  <button
                    key={color}
                    className={cn(
                      'w-7 h-7 rounded-full transition-all',
                      editColor === color && 'ring-2 ring-offset-2 ring-primary scale-110',
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => setEditColor(color)}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tags</Label>
              <TagPicker
                selectedTagIds={editTagIds}
                onTagIdsChange={setEditTagIds}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={!editName.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{project.name}&quot;? All tasks and notes in
              this project will also be deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Note Dialog */}
      <Dialog open={showCreateNote} onOpenChange={setShowCreateNote}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Note</DialogTitle>
            <DialogDescription>Add a new note to this project.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={newNoteTitle}
                onChange={(e) => setNewNoteTitle(e.target.value)}
                placeholder="Note title"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Content</Label>
              <Textarea
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                placeholder="Write your note..."
                rows={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateNote(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateNote} disabled={!newNoteTitle.trim()}>
              Create Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Task Dialog */}
      <CreateTaskDialog
        open={showCreateTask}
        onOpenChange={setShowCreateTask}
        defaultProjectId={selectedProjectId || undefined}
      />
    </div>
  );
}
