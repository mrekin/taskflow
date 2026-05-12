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

interface CreateAreaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateAreaDialog({ open, onOpenChange }: CreateAreaDialogProps) {
  const { createArea, areas, currentUserId } = useAppStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(() => getRandomColor());
  const [visibility, setVisibility] = useState<string | null>(null);
  const [visibleUserIds, setVisibleUserIds] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  const isDirty = !!(name.trim() || description.trim());

  const handleClose = () => {
    setName('');
    setDescription('');
    setColor(getRandomColor());
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
      await createArea({
        name: name.trim(),
        description: description.trim() || null,
        color,
        visibility,
        visibleUserIds,
      });
      // Reset form
      setName('');
      setDescription('');
      setColor(getRandomColor());
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
            <DialogTitle>Create Area</DialogTitle>
            <DialogDescription>
              Organize your projects into areas. An area represents a domain of
              responsibility like Work, Personal, or Health.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex flex-col gap-4">
            {/* Name */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="area-name">Name *</Label>
              <Input
                id="area-name"
                placeholder="e.g., Work, Personal, Health"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="area-description">Description</Label>
              <Textarea
                id="area-description"
                placeholder="What is this area about?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

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
              {isCreating ? 'Creating...' : 'Create Area'}
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
