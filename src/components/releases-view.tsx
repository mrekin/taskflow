'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Calendar,
  Edit2,
  FolderOpen,
  Folder as FolderIcon,
  Plus,
  Rocket,
  StickyNote,
  Trash2,
} from 'lucide-react';

import { useAppStore } from '@/store/app-store';
import {
  RELEASE_STATUS_COLORS,
  RELEASE_STATUS_LABELS,
  getColumnLabelAndColor,
} from '@/lib/constants';
import { formatShortId, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TagBadges } from '@/components/tag-badges';
import { EntityIdBadge } from '@/components/entity-id-badge';
import { OwnerIndicator } from '@/components/owner-indicator';
import { EmptyState } from '@/components/empty-state';
import { DeleteDialog } from '@/components/delete-dialog';
import { ReleaseCard } from '@/components/release-card';
import { CreateReleaseDialog } from '@/components/create-release-dialog';
import { toast } from 'sonner';
import type { Release, Task } from '@/lib/types';

const NO_PROJECT = '__none__';
const ALL_RELEASES = '__all__';

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString();
}

/** Sort tasks by dueDate ascending, tasks without a due date last. */
function sortByDueDate(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  });
}

function StatusBadge({ status, className }: { status: string; className?: string }) {
  const color = RELEASE_STATUS_COLORS[status] ?? RELEASE_STATUS_COLORS.planned;
  return (
    <Badge
      variant="outline"
      className={cn('text-[10px] h-5 shrink-0', className)}
      style={{ color, borderColor: `${color}66` }}
    >
      <span
        className="size-1.5 rounded-full mr-1 shrink-0"
        style={{ backgroundColor: color }}
      />
      {RELEASE_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

interface ReleaseDetailProps {
  release: Release;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

function ReleaseDetail({ release, onEdit, onDelete, isDeleting }: ReleaseDetailProps) {
  const {
    tasks,
    notes,
    folders,
    statuses,
    currentUserId,
    selectRelease,
    selectTask,
    selectNote,
    selectFolder,
    setCurrentView,
  } = useAppStore();

  const linkedTasks = useMemo(
    () =>
      sortByDueDate(tasks.filter((t) => t.releaseId === release.id && !t.parentId)),
    [tasks, release.id]
  );
  const linkedNotes = useMemo(
    () => notes.filter((n) => n.releaseId === release.id),
    [notes, release.id]
  );
  const linkedFolders = useMemo(
    () => folders.filter((f) => f.releaseId === release.id),
    [folders, release.id]
  );

  const datedTasks = linkedTasks.filter((t) => t.dueDate);
  const undatedTasks = linkedTasks.filter((t) => !t.dueDate);

  const hasLinkedEntities =
    linkedTasks.length > 0 || linkedNotes.length > 0 || linkedFolders.length > 0;

  return (
    <div className="space-y-4">
      {/* Detail header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => selectRelease(null)}
            title="Back to all releases"
          >
            <ArrowLeft className="size-4" />
            All releases
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold truncate">{release.title}</h2>
              <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                {formatShortId('release', release.shortIdNum)}
              </span>
              {release.version && (
                <Badge variant="outline" className="text-[10px] h-5 shrink-0">
                  v{release.version}
                </Badge>
              )}
              <StatusBadge status={release.status} />
              <OwnerIndicator ownerId={release.ownerId} currentUserId={currentUserId} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Edit2 className="size-4 mr-1" /> Edit
          </Button>
          <Button variant="destructive" size="sm" onClick={onDelete} disabled={isDeleting}>
            <Trash2 className="size-4 mr-1" /> Delete
          </Button>
        </div>
      </div>

      {/* Info block */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <Calendar className="size-3" />
              Planned: {formatDate(release.plannedStartDate) ?? '—'} → {formatDate(release.plannedEndDate) ?? '—'}
            </span>
            {release.actualReleaseDate && (
              <span className="flex items-center gap-1">
                <Rocket className="size-3" />
                Released: {formatDate(release.actualReleaseDate)}
              </span>
            )}
            <span className="flex items-center gap-3">
              <span>{release._count?.tasks ?? linkedTasks.length} tasks</span>
              <span>·</span>
              <span>{release._count?.notes ?? linkedNotes.length} notes</span>
              <span>·</span>
              <span>{release._count?.folders ?? linkedFolders.length} folders</span>
            </span>
          </div>
          {release.description && (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {release.description}
            </p>
          )}
          {release.tagIds && release.tagIds.length > 0 && (
            <TagBadges tagIds={release.tagIds} max={5} />
          )}
        </CardContent>
      </Card>

      {/* Timeline */}
      <div className="space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Timeline
        </h3>
        <Card>
          <CardContent className="p-4 space-y-4">
            {datedTasks.length === 0 && undatedTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground">No linked tasks yet.</p>
            ) : (
              <>
                {datedTasks.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Dated</p>
                    <div className="border-l-2 border-border pl-4 space-y-2">
                      {datedTasks.map((t) => {
                        const { label, color } = getColumnLabelAndColor(statuses, t.status);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            className="flex items-center gap-2 w-full text-left text-sm hover:text-primary transition-colors min-w-0"
                            onClick={() => selectTask(t.id)}
                          >
                            <span
                              className="size-2 rounded-full shrink-0 -ml-[21px] mr-[5px] ring-4 ring-background"
                              style={{ backgroundColor: color }}
                            />
                            <span className="truncate min-w-0">{t.title}</span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {formatDate(t.dueDate)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {undatedTasks.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">No due date</p>
                    <div className="space-y-1.5">
                      {undatedTasks.map((t) => {
                        const { label } = getColumnLabelAndColor(statuses, t.status);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            className="flex items-center gap-2 w-full text-left text-sm hover:text-primary transition-colors min-w-0"
                            onClick={() => selectTask(t.id)}
                          >
                            <span className="truncate min-w-0">{t.title}</span>
                            <span className="text-xs text-muted-foreground shrink-0">{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Linked entities */}
      <div className="space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Linked entities
        </h3>
        {!hasLinkedEntities ? (
          <p className="text-xs text-muted-foreground">
            No tasks, notes or folders linked to this release yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Tasks */}
            <Card>
              <CardContent className="p-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
                  <Rocket className="size-3" />
                  Tasks
                  <span className="tabular-nums">({linkedTasks.length})</span>
                </p>
                {linkedTasks.length === 0 ? (
                  <p className="text-xs text-muted-foreground/70">No linked tasks</p>
                ) : (
                  linkedTasks.map((t) => {
                    const { label, color } = getColumnLabelAndColor(statuses, t.status);
                    return (
                      <div
                        key={t.id}
                        role="button"
                        tabIndex={0}
                        className="flex items-center gap-2 w-full text-left text-sm rounded-md px-2 py-1.5 hover:bg-accent transition-colors min-w-0"
                        onClick={() => selectTask(t.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            selectTask(t.id);
                          }
                        }}
                      >
                        <span
                          className="size-2 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                          title={label}
                        />
                        <EntityIdBadge
                          id={t.id}
                          shortId={t.shortId || 'T-?'}
                          type="task"
                          className="shrink-0"
                        />
                        <span className="truncate min-w-0">{t.title}</span>
                        <span className="ml-auto text-xs text-muted-foreground shrink-0">
                          {t.dueDate ? formatDate(t.dueDate) : label}
                        </span>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {/* Notes */}
            <Card>
              <CardContent className="p-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
                  <StickyNote className="size-3" />
                  Notes
                  <span className="tabular-nums">({linkedNotes.length})</span>
                </p>
                {linkedNotes.length === 0 ? (
                  <p className="text-xs text-muted-foreground/70">No linked notes</p>
                ) : (
                  linkedNotes.map((n) => (
                    <div
                      key={n.id}
                      role="button"
                      tabIndex={0}
                      className="flex items-center gap-2 w-full text-left text-sm rounded-md px-2 py-1.5 hover:bg-accent transition-colors min-w-0"
                      onClick={() => {
                        selectNote(n.id);
                        setCurrentView('note-editor');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          selectNote(n.id);
                          setCurrentView('note-editor');
                        }
                      }}
                    >
                      <EntityIdBadge
                        id={n.id}
                        shortId={n.shortId || 'N-?'}
                        type="note"
                        className="shrink-0"
                      />
                      <span className="truncate min-w-0">{n.title}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Folders */}
            <Card>
              <CardContent className="p-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
                  <FolderIcon className="size-3" />
                  Folders
                  <span className="tabular-nums">({linkedFolders.length})</span>
                </p>
                {linkedFolders.length === 0 ? (
                  <p className="text-xs text-muted-foreground/70">No linked folders</p>
                ) : (
                  linkedFolders.map((f) => (
                    <div
                      key={f.id}
                      role="button"
                      tabIndex={0}
                      className="flex items-center gap-2 w-full text-left text-sm rounded-md px-2 py-1.5 hover:bg-accent transition-colors min-w-0"
                      onClick={() => {
                        selectFolder(f.id);
                        setCurrentView('notes');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          selectFolder(f.id);
                          setCurrentView('notes');
                        }
                      }}
                    >
                      <EntityIdBadge
                        id={f.id}
                        shortId={f.shortId || 'F-?'}
                        type="folder"
                        className="shrink-0"
                      />
                      <span className="truncate min-w-0">{f.name}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

export function ReleasesView() {
  const {
    releases,
    projects,
    selectedProjectId,
    selectedReleaseId,
    fetchReleases,
    selectRelease,
    deleteRelease,
  } = useAppStore();

  const [projectId, setProjectId] = useState<string | null>(
    selectedProjectId ?? projects[0]?.id ?? null
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchReleases();
  }, [fetchReleases]);

  const release = useMemo(
    () => releases.find((r) => r.id === selectedReleaseId) ?? null,
    [releases, selectedReleaseId]
  );

  const projectReleases = useMemo(
    () => releases.filter((r) => r.projectId === projectId),
    [releases, projectId]
  );

  const handleProjectChange = (value: string) => {
    const id = value === NO_PROJECT ? null : value;
    setProjectId(id);
    if (release && id !== null && release.projectId !== id) {
      selectRelease(null);
    }
  };

  const handleDelete = async () => {
    if (!release) return;
    setIsDeleting(true);
    try {
      await deleteRelease(release.id);
      selectRelease(null);
      setDeleteOpen(false);
      toast.success('Release deleted');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-4 pb-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Rocket className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Releases</h1>
          </div>
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            disabled={projects.length === 0}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            New Release
          </Button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <Select
            value={projectId ?? NO_PROJECT}
            onValueChange={handleProjectChange}
            disabled={projects.length === 0}
          >
            <SelectTrigger className="w-[220px] h-8 text-xs">
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

          {!release && (
            <Select
              value={selectedReleaseId ?? ALL_RELEASES}
              onValueChange={(v) => selectRelease(v === ALL_RELEASES ? null : v)}
              disabled={projectReleases.length === 0}
            >
              <SelectTrigger className="w-[220px] h-8 text-xs">
                <SelectValue placeholder="All releases" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_RELEASES}>All releases</SelectItem>
                {projectReleases.map((r) => {
                  const color =
                    RELEASE_STATUS_COLORS[r.status] ?? RELEASE_STATUS_COLORS.planned;
                  return (
                    <SelectItem key={r.id} value={r.id}>
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="size-2 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="truncate">
                          {formatShortId('release', r.shortIdNum)} — {r.title}
                          {r.version ? ` (v${r.version})` : ''}
                        </span>
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Content */}
      {projects.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="Create a project first"
          description="Releases belong to projects. Create a project before adding releases."
        />
      ) : release ? (
        <ReleaseDetail
          release={release}
          onEdit={() => setEditOpen(true)}
          onDelete={() => setDeleteOpen(true)}
          isDeleting={isDeleting}
        />
      ) : projectReleases.length === 0 ? (
        <EmptyState
          icon={Rocket}
          title="No releases yet"
          description="Create a release to group tasks, notes and folders for delivery."
          action={{
            label: 'New Release',
            onClick: () => setCreateOpen(true),
            icon: Plus,
          }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projectReleases.map((r) => (
            <ReleaseCard key={r.id} release={r} onClick={() => selectRelease(r.id)} />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <CreateReleaseDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={projectId ?? undefined}
        onSaved={(r) => selectRelease(r.id)}
      />
      {release && (
        <CreateReleaseDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          release={release}
          onSaved={(r) => selectRelease(r.id)}
        />
      )}
      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete release?"
        description={
          release
            ? `This will permanently delete "${release.title}" and unlink its tasks, notes and folders. This action cannot be undone.`
            : ''
        }
        onConfirm={handleDelete}
      />
    </div>
  );
}
