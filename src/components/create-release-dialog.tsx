'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/app-store';
import {
  RELEASE_STATUSES,
  RELEASE_STATUS_LABELS,
  RELEASE_STATUS_COLORS,
} from '@/lib/constants';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { TagPicker } from '@/components/tag-picker';
import { VisibilitySelect } from '@/components/visibility-select';
import { useConfirmClose } from '@/hooks/use-confirm-close';
import { toast } from 'sonner';
import type { Release } from '@/lib/types';

interface CreateReleaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Required in create mode unless the project is chosen inside the dialog. */
  projectId?: string;
  /** Pass an existing release to switch the dialog into edit mode. */
  release?: Release;
  onSaved?: (release: Release) => void;
}

/** ISO date string → 'YYYY-MM-DD' for <input type="date"> */
function toDateInputValue(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}

export function CreateReleaseDialog({
  open,
  onOpenChange,
  projectId,
  release,
  onSaved,
}: CreateReleaseDialogProps) {
  const {
    createRelease,
    updateRelease,
    projects,
    currentUserId,
  } = useAppStore();

  const [title, setTitle] = useState('');
  const [version, setVersion] = useState('');
  const [status, setStatus] = useState<string>('planned');
  const [plannedStartDate, setPlannedStartDate] = useState('');
  const [plannedEndDate, setPlannedEndDate] = useState('');
  const [actualReleaseDate, setActualReleaseDate] = useState('');
  const [description, setDescription] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<string | null>(null);
  const [visibleUserIds, setVisibleUserIds] = useState<string[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  const isEditMode = !!release;

  const resetForm = () => {
    setTitle(release?.title ?? '');
    setVersion(release?.version ?? '');
    setStatus(release?.status ?? 'planned');
    setPlannedStartDate(toDateInputValue(release?.plannedStartDate));
    setPlannedEndDate(toDateInputValue(release?.plannedEndDate));
    setActualReleaseDate(toDateInputValue(release?.actualReleaseDate));
    setDescription(release?.description ?? '');
    setTagIds(release?.tagIds ? [...release.tagIds] : []);
    setVisibility(release?.visibility ?? null);
    setVisibleUserIds(release?.visibleUserIds ? [...release.visibleUserIds] : []);
    setSelectedProjectId(release?.projectId ?? projectId ?? '');
    setIsSaving(false);
  };

  useEffect(() => {
    if (open) resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, release, projectId]);

  const isDirty = !!(
    title.trim() ||
    version.trim() ||
    description.trim() ||
    plannedStartDate ||
    plannedEndDate ||
    actualReleaseDate ||
    tagIds.length > 0
  );

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const { handleOpenChange: confirmOpenChange, showConfirm, handleConfirmDiscard, handleCancelDiscard } = useConfirmClose({
    isDirty,
    onClose: handleClose,
  });

  const effectiveProjectId = isEditMode ? release!.projectId : projectId ?? selectedProjectId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (!isEditMode && !effectiveProjectId) return;

    setIsSaving(true);
    try {
      const payload = {
        title: title.trim(),
        version: version.trim() || null,
        status,
        plannedStartDate: plannedStartDate || null,
        plannedEndDate: plannedEndDate || null,
        actualReleaseDate: actualReleaseDate || null,
        description: description.trim() || null,
        tagIds,
        visibility,
        visibleUserIds,
        ...(!isEditMode ? { projectId: effectiveProjectId } : {}),
      };

      const saved = isEditMode
        ? await updateRelease(release!.id, payload)
        : await createRelease(payload);

      if (!saved) throw new Error(isEditMode ? 'Failed to update release' : 'Failed to create release');

      toast.success(isEditMode ? 'Release updated' : 'Release created');
      onOpenChange(false);
      resetForm();
      onSaved?.(saved);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={confirmOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{isEditMode ? 'Edit Release' : 'New Release'}</DialogTitle>
              <DialogDescription>
                {isEditMode
                  ? 'Update the release details.'
                  : 'Create a release to group tasks, notes and folders for delivery.'}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-3">
              {/* Project (create mode only, when not fixed by prop) */}
              {!isEditMode && !projectId && (
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                    Project *
                  </Label>
                  <Select
                    value={selectedProjectId || undefined}
                    onValueChange={setSelectedProjectId}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select project..." />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                  Title *
                </Label>
                <Input
                  placeholder="Release title..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                    Version
                  </Label>
                  <Input
                    placeholder="e.g. 1.2.0"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                    Status
                  </Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RELEASE_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          <span className="flex items-center gap-1.5">
                            <span
                              className="size-2 rounded-full shrink-0"
                              style={{ backgroundColor: RELEASE_STATUS_COLORS[s] }}
                            />
                            {RELEASE_STATUS_LABELS[s]}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                    Planned Start
                  </Label>
                  <Input
                    type="date"
                    value={plannedStartDate}
                    onChange={(e) => setPlannedStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                    Planned End
                  </Label>
                  <Input
                    type="date"
                    value={plannedEndDate}
                    onChange={(e) => setPlannedEndDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                  Actual Release Date
                </Label>
                <Input
                  type="date"
                  value={actualReleaseDate}
                  onChange={(e) => setActualReleaseDate(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                  Description
                </Label>
                <Textarea
                  placeholder="What is this release about?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                  Tags
                </Label>
                <TagPicker selectedTagIds={tagIds} onTagIdsChange={setTagIds} />
              </div>

              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                  Visibility
                </Label>
                <VisibilitySelect
                  value={visibility}
                  visibleUserIds={visibleUserIds}
                  onChange={(v, ids) => {
                    setVisibility(v);
                    setVisibleUserIds(ids);
                  }}
                  ownerId={release?.ownerId ?? currentUserId ?? ''}
                  currentUserId={currentUserId}
                />
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => confirmOpenChange(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!title.trim() || (!isEditMode && !effectiveProjectId) || isSaving}
              >
                {isSaving
                  ? isEditMode
                    ? 'Saving...'
                    : 'Creating...'
                  : isEditMode
                    ? 'Save Changes'
                    : 'Create Release'}
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
