'use client';

import { useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { DEFAULT_COLORS, getRandomColor } from '@/lib/constants';
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
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

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
  const { createProject, areas, projects, selectedAreaId } = useAppStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(() => getRandomColor());
  const [areaId, setAreaId] = useState(defaultAreaId ?? selectedAreaId ?? '');
  const [isCreating, setIsCreating] = useState(false);

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
      });
      // Reset form
      setName('');
      setDescription('');
      setColor(getRandomColor());
      setAreaId(defaultAreaId ?? selectedAreaId ?? '');
      onOpenChange(false);
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setName('');
      setDescription('');
      setColor(getRandomColor());
      setAreaId(defaultAreaId ?? selectedAreaId ?? '');
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
                        <div className="flex items-center gap-2">
                          <span
                            className="size-2.5 rounded-full"
                            style={{ backgroundColor: area.color }}
                          />
                          {area.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Color Picker */}
            <div className="flex flex-col gap-2">
              <Label>Color</Label>
              <div className="grid grid-cols-8 gap-2">
                {DEFAULT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={cn(
                      'flex size-8 items-center justify-center rounded-md transition-all hover:scale-110',
                      color === c && 'ring-2 ring-primary ring-offset-2'
                    )}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                  >
                    {color === c && (
                      <Check className="size-4 text-white drop-shadow-sm" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
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
  );
}
