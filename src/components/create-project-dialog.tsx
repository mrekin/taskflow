'use client';

import { useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { getRandomColor } from '@/lib/constants';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ColorPicker } from '@/components/color-picker';
import { VisibilityLock } from '@/components/visibility-lock';
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
import { useConfirmClose } from '@/hooks/use-confirm-close';

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultAreaId?: string;
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  defaultAreaId,
}: CreateProjectDialogProps) {
  const { createProject, areas, selectedAreaId, users, currentUserId } = useAppStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(() => getRandomColor());
  const [areaId, setAreaId] = useState(defaultAreaId ?? selectedAreaId ?? '');
  const [visibility, setVisibility] = useState<string | null>(null);
  const [visibleUserIds, setVisibleUserIds] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  const isDirty = !!(name.trim() || description.trim());

  const handleClose = () => {
    setName('');
    setDescription('');
    setColor(getRandomColor());
    setAreaId(defaultAreaId ?? selectedAreaId ?? '');
    onOpenChange(false);
  };

  const { handleOpenChange: confirmOpenChange, showConfirm, handleConfirmDiscard, handleCancelDiscard } = useConfirmClose({
    isDirty,
    onClose: handleClose,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsCreating(true);
    try {
      await createProject({
        name: name.trim(),
        description: description.trim() || null,
        color,
        areaId: areaId || null,
        visibility,
        visibleUserIds,
      });
      // Reset form
      setName('');
      setDescription('');
      setColor(getRandomColor());
      setAreaId(defaultAreaId ?? selectedAreaId ?? '');
      setVisibility(null);
      setVisibleUserIds([]);
      onOpenChange(false);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={confirmOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Project</DialogTitle>
            <DialogDescription>
              Create a project to group related tasks and notes. Projects can
              belong to an area or stand alone.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex flex-col gap-4">
            {/* Name */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="project-name">Name *</Label>
              <Input
                id="project-name"
                placeholder="e.g., Website Redesign, Q1 Planning"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="project-description">Description</Label>
              <Textarea
                id="project-description"
                placeholder="What is this project about?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            {/* Area Selector */}
            {!defaultAreaId && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="project-area">Area</Label>
                <Select value={areaId} onValueChange={setAreaId}>
                  <SelectTrigger id="project-area">
                    <SelectValue placeholder="Select an area (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {areas.map((area) => (
                      <SelectItem key={area.id} value={area.id}>
                        {area.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Color Picker */}
            <div className="flex items-end gap-3">
              <div className="flex flex-col gap-2">
                <Label>Color</Label>
                <ColorPicker value={color} onChange={setColor} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Visibility</Label>
                <div className="flex items-center h-9">
                  <VisibilityLock
                    value={visibility}
                    visibleUserIds={visibleUserIds}
                    onChange={(v, ids) => { setVisibility(v); setVisibleUserIds(ids); }}
                    ownerId={currentUserId ?? ''}
                    currentUserId={currentUserId}
                    size="sm"
                    users={users}
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => confirmOpenChange(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || isCreating}>
              {isCreating ? 'Creating...' : 'Create Project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <AlertDialog open={showConfirm} onOpenChange={(open) => !open && handleCancelDiscard()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard changes?</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes. Are you sure you want to close? All entered data will be lost.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancelDiscard}>Continue editing</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirmDiscard}>Discard</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
