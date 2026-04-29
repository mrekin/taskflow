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
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

interface CreateAreaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateAreaDialog({ open, onOpenChange }: CreateAreaDialogProps) {
  const { createArea, areas } = useAppStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(() => getRandomColor());
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsCreating(true);
    try {
      await createArea({
        name: name.trim(),
        description: description.trim() || null,
        color,
      });
      // Reset form
      setName('');
      setDescription('');
      setColor(getRandomColor());
      onOpenChange(false);
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset form on close
      setName('');
      setDescription('');
      setColor(getRandomColor());
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
              {isCreating ? 'Creating...' : 'Create Area'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
