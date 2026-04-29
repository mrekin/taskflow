'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Edit2, Plus, Trash2, FolderOpen } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { useAppStore } from '@/store/app-store';
import { DEFAULT_COLORS, STATUS_LABELS } from '@/lib/constants';
import { TagBadges } from '@/components/tag-badges';
import { TagPicker } from '@/components/tag-picker';
import { EntityIdBadge } from '@/components/entity-id-badge';
import { CreateProjectDialog } from '@/components/create-project-dialog';

export function AreaDetail() {
  const {
    areas,
    selectedAreaId,
    projects,
    tasks,
    selectArea,
    selectProject,
    setCurrentView,
    updateArea,
    deleteArea,
  } = useAppStore();

  const area = areas.find((a) => a.id === selectedAreaId);
  const areaProjects = projects.filter((p) => p.areaId === selectedAreaId);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editColor, setEditColor] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [editTagIds, setEditTagIds] = useState<string[]>([]);

  const handleEdit = () => {
    if (!area) return;
    setEditName(area.name);
    setEditDescription(area.description || '');
    setEditColor(area.color);
    setEditTagIds(area.tagIds || []);
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!area || !editName.trim()) return;
    await updateArea(area.id, {
      name: editName.trim(),
      description: editDescription.trim() || null,
      color: editColor,
      tagIds: editTagIds,
    });
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!area) return;
    await deleteArea(area.id);
    selectArea(null);
    setCurrentView('areas');
    setShowDeleteDialog(false);
  };

  const handleProjectClick = (projectId: string) => {
    selectProject(projectId);
    setCurrentView('projects');
  };

  if (!area) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>Select an area to view details</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Area header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-4 h-4 rounded-full shrink-0"
            style={{ backgroundColor: area.color }}
          />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{area.name}</h1>
              <EntityIdBadge id={area.id} shortId={area.shortId || 'A-?'} type="area" />
            </div>
            {area.description && (
              <p className="text-sm text-muted-foreground mt-1">{area.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {area.tagIds && area.tagIds.length > 0 && (
            <TagBadges tagIds={area.tagIds} max={3} size="sm" />
          )}
          <Button variant="outline" size="sm" onClick={handleEdit}>
            <Edit2 className="size-4 mr-1" /> Edit
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setShowDeleteDialog(true)}>
            <Trash2 className="size-4 mr-1" /> Delete
          </Button>
        </div>
      </div>

      {/* Projects section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Projects ({areaProjects.length})</h2>
          <Button size="sm" onClick={() => setShowCreateProject(true)}>
            <Plus className="size-4 mr-1" /> Add Project
          </Button>
        </div>

        {areaProjects.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {areaProjects.map((project) => (
                <motion.div
                  key={project.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                >
                  <Card
                    className="cursor-pointer hover:shadow-md transition-all border-l-4 py-3"
                    style={{ borderLeftColor: project.color }}
                    onClick={() => handleProjectClick(project.id)}
                  >
                    <CardHeader className="pb-2 pt-0 px-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{project.name}</CardTitle>
                        <Badge variant="outline" className="text-[10px] h-5">
                          {STATUS_LABELS[project.status] || project.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-2">
                      {project.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                          {project.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <FolderOpen className="size-3" />
                          {project._count?.topLevelTasks ?? tasks.filter((t) => t.projectId === project.id && !t.parentId).length} tasks
                        </span>
                        {project.tagIds && project.tagIds.length > 0 && (
                          <TagBadges tagIds={project.tagIds} max={2} size="sm" />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="py-12 text-center text-muted-foreground border rounded-lg border-dashed">
            <FolderOpen className="size-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No projects in this area</p>
            <p className="text-xs mt-1">Create a project to get started</p>
          </div>
        )}
      </div>

      {/* Edit Area Dialog */}
      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Area</DialogTitle>
            <DialogDescription>Update the area details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Area name"
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
            <AlertDialogTitle>Delete Area</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{area.name}&quot;? All projects in this area
              will be unlinked. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Project Dialog */}
      <CreateProjectDialog
        open={showCreateProject}
        onOpenChange={setShowCreateProject}
        defaultAreaId={selectedAreaId ?? undefined}
      />
    </div>
  );
}
