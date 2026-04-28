'use client';

import { useEffect, useState, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from 'next-themes';
import Image from 'next/image';
import {
  LayoutGrid,
  List,
  Layers,
  FolderOpen,
  Plus,
  Menu,
  X,
  ChevronRight,
  StickyNote,
  Settings,
  CheckCircle2,
  Circle,
  Clock,
  Ban,
  Sun,
  Moon,
  Zap,
  Tag,
  GripVertical,
  XCircle,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { KanbanBoard } from '@/components/kanban-board';
import { TaskList } from '@/components/task-list';
import { AreaDetail } from '@/components/area-detail';
import { ProjectDetail } from '@/components/project-detail';
import { TaskDetailDialog } from '@/components/task-detail-dialog';
import { NotesList } from '@/components/notes-list';
import { NoteEditor } from '@/components/note-editor';
import { SettingsView } from '@/components/settings-view';
import { QuickCreate } from '@/components/quick-create';
import { TagBadges } from '@/components/tag-badges';
import { useAppStore } from '@/store/app-store';
import {
  STATUS_LABELS,
  STATUS_COLORS,
  DEFAULT_COLORS,
  getNextColor,
} from '@/lib/constants';
import { shortId } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Sub-Components ─────────────────────────────────────────────────────

function AllAreasView({
  areas,
  onCreateArea,
  onAreaClick,
}: {
  areas: ReturnType<typeof useAppStore.getState>['areas'];
  onCreateArea: () => void;
  onAreaClick: (id: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Layers className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Areas</h1>
        </div>
        <Button size="sm" onClick={onCreateArea}>
          <Plus className="size-4 mr-1" /> New Area
        </Button>
      </div>
      {areas.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {areas.map((area) => (
              <motion.div
                key={area.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.15 }}
              >
                <Card
                  className="cursor-pointer hover:shadow-md transition-all border-l-4 py-3 group"
                  style={{ borderLeftColor: area.color }}
                  onClick={() => onAreaClick(area.id)}
                >
                  <CardHeader className="pb-2 pt-0 px-4">
                    <CardTitle className="text-base group-hover:text-primary transition-colors">{area.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-2">
                    {area.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                        {area.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span>{area._count?.projects ?? 0} projects</span>
                      {area.tagIds && area.tagIds.length > 0 && (
                        <TagBadges tagIds={area.tagIds} max={2} size="sm" />
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="py-16 text-center text-muted-foreground border rounded-lg border-dashed">
          <Layers className="size-12 mx-auto mb-4 opacity-30" />
          <p className="text-sm font-medium">No areas yet</p>
          <p className="text-xs mt-1 mb-4">Create an area to organize your projects</p>
          <Button size="sm" variant="outline" onClick={onCreateArea}>
            <Plus className="size-4 mr-1" /> Create First Area
          </Button>
        </div>
      )}
    </div>
  );
}

function AllProjectsView({
  projects,
  onProjectClick,
}: {
  projects: ReturnType<typeof useAppStore.getState>['projects'];
  onProjectClick: (id: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FolderOpen className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">All Projects</h1>
      </div>
      {projects.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {projects.map((project) => (
              <motion.div
                key={project.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.15 }}
              >
                <Card
                  className="cursor-pointer hover:shadow-md transition-all border-l-4 py-3 group"
                  style={{ borderLeftColor: project.color }}
                  onClick={() => onProjectClick(project.id)}
                >
                  <CardHeader className="pb-2 pt-0 px-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base group-hover:text-primary transition-colors">{project.name}</CardTitle>
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
                        {project._count?.tasks ?? 0} tasks
                      </span>
                      <span className="flex items-center gap-1">
                        <StickyNote className="size-3" />
                        {project._count?.notes ?? 0} notes
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
        <div className="py-16 text-center text-muted-foreground border rounded-lg border-dashed">
          <FolderOpen className="size-12 mx-auto mb-4 opacity-30" />
          <p className="text-sm font-medium">No projects yet</p>
          <p className="text-xs mt-1">Create a project from an area or add one directly</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────

function HomeContent() {
  const {
    currentView,
    selectedAreaId,
    selectedProjectId,
    selectedNoteId,
    areas,
    projects,
    tasks,
    notes,
    tags,
    sidebarOpen,
    isLoading,
    tagFilter,
    setCurrentView,
    selectArea,
    selectProject,
    selectTask,
    selectNote,
    toggleSidebar,
    setTaskStatusFilter,
    setTagFilter,
    fetchAreas,
    fetchProjects,
    fetchTasks,
    fetchNotes,
    fetchTags,
    createArea,
    updateProject,
  } = useAppStore();

  const { setTheme } = useTheme();
  const [showCreateArea, setShowCreateArea] = useState(false);
  const [newAreaName, setNewAreaName] = useState('');
  const [newAreaDescription, setNewAreaDescription] = useState('');
  const [newAreaColor, setNewAreaColor] = useState(() => getNextColor(0));

  // Drag-and-drop state
  const [dragOverAreaId, setDragOverAreaId] = useState<string | null>(null);
  const [isDraggingProject, setIsDraggingProject] = useState(false);
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);

  // Drag handlers
  const handleProjectDragStart = (e: React.DragEvent, projectId: string) => {
    e.dataTransfer.setData('text/plain', projectId);
    e.dataTransfer.effectAllowed = 'move';
    setIsDraggingProject(true);
    setDraggedProjectId(projectId);
  };

  const handleProjectDragEnd = () => {
    setIsDraggingProject(false);
    setDraggedProjectId(null);
    setDragOverAreaId(null);
  };

  const handleAreaDragOver = (e: React.DragEvent, areaId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverAreaId(areaId);
  };

  const handleAreaDragLeave = () => {
    setDragOverAreaId(null);
  };

  const handleAreaDrop = async (e: React.DragEvent, areaId: string) => {
    e.preventDefault();
    const projectId = e.dataTransfer.getData('text/plain');
    if (projectId) {
      await updateProject(projectId, { areaId });
    }
    setDragOverAreaId(null);
    setIsDraggingProject(false);
    setDraggedProjectId(null);
  };

  const handleRemoveFromArea = async (projectId: string) => {
    await updateProject(projectId, { areaId: null });
  };

  // Initial data load
  useEffect(() => {
    fetchAreas();
    fetchProjects();
    fetchTasks();
    fetchNotes();
    fetchTags();
  }, [fetchAreas, fetchProjects, fetchTasks, fetchNotes, fetchTags]);

  // Handle deep links from URL query params
  const searchParams = useSearchParams();
  const deepLinkHandledRef = useRef(false);

  useEffect(() => {
    if (deepLinkHandledRef.current || isLoading) return;

    const taskId = searchParams.get('task');
    const projectId = searchParams.get('project');
    const noteId = searchParams.get('note');
    const areaId = searchParams.get('area');

    if (taskId) {
      // Verify the task belongs to current user (exists in our loaded data)
      const task = tasks.find((t) => t.id === taskId);
      if (task) {
        selectTask(taskId);
      } else {
        toast.error('Access denied', { description: 'This task does not exist or you do not have access to it.' });
      }
      deepLinkHandledRef.current = true;
    } else if (noteId) {
      const note = notes.find((n) => n.id === noteId);
      if (note) {
        selectNote(noteId);
        setCurrentView('note-editor');
      } else {
        toast.error('Access denied', { description: 'This note does not exist or you do not have access to it.' });
      }
      deepLinkHandledRef.current = true;
    } else if (projectId) {
      const project = projects.find((p) => p.id === projectId);
      if (project) {
        selectProject(projectId);
        setCurrentView('projects');
        fetchTasks(projectId);
        fetchNotes(projectId);
      } else {
        toast.error('Access denied', { description: 'This project does not exist or you do not have access to it.' });
      }
      deepLinkHandledRef.current = true;
    } else if (areaId) {
      const area = areas.find((a) => a.id === areaId);
      if (area) {
        selectArea(areaId);
        setCurrentView('areas');
      } else {
        toast.error('Access denied', { description: 'This area does not exist or you do not have access to it.' });
      }
      deepLinkHandledRef.current = true;
    }
  }, [searchParams, isLoading, selectTask, selectNote, selectProject, selectArea, setCurrentView, fetchTasks, fetchNotes, tasks, notes, projects, areas]);

  const handleAreaClick = (areaId: string) => {
    selectArea(areaId);
    selectProject(null);
    setCurrentView('areas');
  };

  const handleProjectClick = (projectId: string) => {
    selectProject(projectId);
    setCurrentView('projects');
    fetchTasks(projectId);
    fetchNotes(projectId);
  };

  const handleCreateArea = async () => {
    if (!newAreaName.trim()) return;
    await createArea({
      name: newAreaName.trim(),
      description: newAreaDescription.trim() || null,
      color: newAreaColor,
    });
    setShowCreateArea(false);
    setNewAreaName('');
    setNewAreaDescription('');
    setNewAreaColor(getNextColor(areas.length));
  };

  // Task status counts for sidebar
  const taskStatusCounts = {
    todo: tasks.filter((t) => t.status === 'todo' && !t.parentId).length,
    in_progress: tasks.filter((t) => t.status === 'in_progress' && !t.parentId).length,
    done: tasks.filter((t) => t.status === 'done' && !t.parentId).length,
    cancelled: tasks.filter((t) => t.status === 'cancelled' && !t.parentId).length,
  };

  // Render main content based on current view
  const renderContent = () => {
    switch (currentView) {
      case 'areas':
        if (selectedAreaId) {
          return <AreaDetail />;
        }
        return (
          <AllAreasView
            areas={areas}
            onCreateArea={() => setShowCreateArea(true)}
            onAreaClick={handleAreaClick}
          />
        );
      case 'projects':
        if (selectedProjectId) {
          return <ProjectDetail />;
        }
        return <AllProjectsView projects={projects} onProjectClick={handleProjectClick} />;
      case 'tasks':
        return <TaskList />;
      case 'kanban':
        return <KanbanBoard />;
      case 'quick-create':
        return <QuickCreate />;
      case 'notes':
        return <NotesList />;
      case 'note-editor':
        if (selectedNoteId) {
          return <NoteEditor key={selectedNoteId} noteId={selectedNoteId} initialMode="preview" />;
        }
        return <NotesList />;
      case 'settings':
        return <SettingsView />;
      default:
        return <TaskList />;
    }
  };

  const statusIconMap = {
    todo: Circle,
    in_progress: Clock,
    done: CheckCircle2,
    cancelled: Ban,
  };

  // View title for header
  const getViewTitle = () => {
    switch (currentView) {
      case 'areas': return selectedAreaId ? 'Area Details' : 'Areas';
      case 'projects': return selectedProjectId ? 'Project Details' : 'All Projects';
      case 'tasks': return 'My Tasks';
      case 'kanban': return 'Kanban Board';
      case 'quick-create': return 'Quick Create';
      case 'notes': return 'Notes';
      case 'note-editor': return selectedNoteId ? 'View Note' : 'Notes';
      case 'settings': return 'Settings';
      default: return 'TaskFlow';
    }
  };

  // Loading state
  if (isLoading && areas.length === 0 && projects.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
          <div className="flex items-center justify-center gap-2">
            <Image src="/logo.png" alt="TaskFlow" width={40} height={40} className="h-10 w-10 rounded-xl object-cover" />
            <h1 className="text-3xl font-bold">TaskFlow</h1>
          </div>
          <div className="w-48 h-1 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full"
              animate={{ x: ['-100%', '100%'] }}
              transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
            />
          </div>
          <p className="text-sm text-muted-foreground">Loading your workspace...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          'border-r bg-muted/20 transition-all duration-300 flex flex-col shrink-0 overflow-hidden',
          sidebarOpen ? 'w-64' : 'w-0',
        )}
      >
        {/* Sidebar header */}
        <div className="p-4 flex items-center justify-between border-b shrink-0">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="TaskFlow" width={20} height={20} className="h-5 w-5 rounded object-cover" />
            <h2 className="font-semibold text-lg">TaskFlow</h2>
          </div>
          <Button variant="ghost" size="icon" className="size-7" onClick={toggleSidebar}>
            <X className="size-4" />
          </Button>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-1">
            {/* Quick Create - first */}
            <Button
              variant={currentView === 'quick-create' ? 'secondary' : 'ghost'}
              className="w-full justify-start h-9 text-sm"
              onClick={() => {
                selectArea(null);
                selectProject(null);
                setCurrentView('quick-create');
              }}
            >
              <Zap className="size-4 mr-2" /> Quick Create
            </Button>

            <Separator className="my-2" />

            {/* Tasks & Notes - frequently used, higher priority */}
            <Button
              variant={currentView === 'tasks' ? 'secondary' : 'ghost'}
              className="w-full justify-start h-9 text-sm"
              onClick={() => {
                selectArea(null);
                selectProject(null);
                setTaskStatusFilter('all');
                setCurrentView('tasks');
                fetchTasks();
              }}
            >
              <List className="size-4 mr-2" /> Tasks
              <Badge variant="outline" className="ml-auto text-[10px] h-5">
                {tasks.filter((t) => !t.parentId).length}
              </Badge>
            </Button>
            <Button
              variant={currentView === 'kanban' ? 'secondary' : 'ghost'}
              className="w-full justify-start h-9 text-sm"
              onClick={() => {
                selectArea(null);
                selectProject(null);
                setCurrentView('kanban');
                fetchTasks();
              }}
            >
              <LayoutGrid className="size-4 mr-2" /> Kanban
            </Button>
            <Button
              variant={currentView === 'notes' || currentView === 'note-editor' ? 'secondary' : 'ghost'}
              className="w-full justify-start h-9 text-sm"
              onClick={() => {
                selectArea(null);
                selectProject(null);
                selectNote(null);
                setCurrentView('notes');
                fetchNotes();
              }}
            >
              <StickyNote className="size-4 mr-2" /> Notes
              <Badge variant="outline" className="ml-auto text-[10px] h-5">
                {notes.length}
              </Badge>
            </Button>

            <Separator className="my-2" />

            {/* Task quick filters */}
            <p className="text-xs font-medium text-muted-foreground px-3 mb-1">Quick Filters</p>
            {(['todo', 'in_progress', 'done', 'cancelled'] as const).map((status) => {
              const Icon = statusIconMap[status];
              return (
                <Button
                  key={status}
                  variant="ghost"
                  className="w-full justify-start h-8 text-xs"
                  onClick={() => {
                    setTaskStatusFilter(status);
                    selectArea(null);
                    selectProject(null);
                    setCurrentView('tasks');
                    fetchTasks();
                  }}
                >
                  <Icon
                    className="size-3.5 mr-2"
                    style={{ color: STATUS_COLORS[status] }}
                  />
                  {STATUS_LABELS[status]}
                  <Badge variant="outline" className="ml-auto text-[10px] h-4 px-1">
                    {taskStatusCounts[status]}
                  </Badge>
                </Button>
              );
            })}

            {/* Tags filter section */}
            {tags.length > 0 && (
              <>
                <Separator className="my-2" />
                <div className="flex items-center justify-between px-3 mb-1">
                  <p className="text-xs font-medium text-muted-foreground">Filter by Tags</p>
                  {tagFilter.length > 0 && (
                    <button
                      className="text-[10px] text-muted-foreground hover:text-foreground underline"
                      onClick={() => setTagFilter([])}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 px-3 max-h-28 overflow-y-auto custom-scrollbar">
                  {tags.map((tag) => {
                    const isSelected = tagFilter.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setTagFilter(tagFilter.filter((id) => id !== tag.id));
                          } else {
                            setTagFilter([...tagFilter, tag.id]);
                          }
                        }}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium transition-all border',
                          isSelected
                            ? 'border-foreground/20 shadow-sm'
                            : 'border-transparent opacity-50 hover:opacity-100'
                        )}
                        style={{
                          backgroundColor: isSelected ? `${tag.color}20` : `${tag.color}10`,
                          color: tag.color,
                        }}
                      >
                        <span
                          className="size-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: tag.color }}
                        />
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <Separator className="my-2" />

            {/* Areas section */}
            <div className="flex items-center justify-between px-3 mb-1">
              <p className="text-xs font-medium text-muted-foreground">Areas</p>
              <Button
                variant="ghost"
                size="icon"
                className="size-5"
                onClick={() => setShowCreateArea(true)}
              >
                <Plus className="size-3" />
              </Button>
            </div>
            {areas.map((area) => {
              const areaProjects = projects.filter((p) => p.areaId === area.id);
              const isActive = selectedAreaId === area.id;
              const isExpanded = isActive || areaProjects.length > 0;
              const isDropTarget = dragOverAreaId === area.id;

              return (
                <div
                  key={area.id}
                  onDragOver={(e) => handleAreaDragOver(e, area.id)}
                  onDragLeave={handleAreaDragLeave}
                  onDrop={(e) => handleAreaDrop(e, area.id)}
                  className={cn(
                    'rounded-md transition-all',
                    isDropTarget && isDraggingProject && 'bg-primary/10 ring-1 ring-primary/30',
                  )}
                >
                  <Button
                    variant={isActive ? 'secondary' : 'ghost'}
                    className="w-full justify-start h-8 text-xs"
                    onClick={() => handleAreaClick(area.id)}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full mr-2 shrink-0"
                      style={{ backgroundColor: area.color }}
                    />
                    <span className="truncate">{area.name}</span>
                    {isDropTarget && isDraggingProject && (
                      <span className="ml-auto text-[10px] text-primary font-medium">Drop here</span>
                    )}
                  </Button>

                  {/* Projects under area */}
                  {isExpanded && areaProjects.length > 0 && (
                    <div className="ml-4 space-y-0.5">
                      {areaProjects.map((project) => (
                        <div
                          key={project.id}
                          draggable
                          onDragStart={(e) => handleProjectDragStart(e, project.id)}
                          onDragEnd={handleProjectDragEnd}
                          className={cn(
                            'group/item relative flex items-center',
                            draggedProjectId === project.id && 'opacity-40',
                          )}
                        >
                          <Button
                            variant={selectedProjectId === project.id ? 'secondary' : 'ghost'}
                            className="w-full justify-start h-7 text-xs pr-7"
                            onClick={() => handleProjectClick(project.id)}
                          >
                            <GripVertical className="size-3 mr-0.5 text-muted-foreground/40 cursor-grab" />
                            <span
                              className="w-2 h-2 rounded-full mr-1.5 shrink-0"
                              style={{ backgroundColor: project.color }}
                            />
                            <span className="truncate">{project.name}</span>
                          </Button>
                          <button
                            type="button"
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 size-4 rounded flex items-center justify-center text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover/item:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveFromArea(project.id);
                            }}
                            title="Remove from area"
                          >
                            <XCircle className="size-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Unassigned projects */}
            {projects.filter((p) => !p.areaId).length > 0 && (
              <>
                <Separator className="my-2" />
                <p className="text-xs font-medium text-muted-foreground px-3 mb-1">
                  Unassigned Projects
                  {isDraggingProject && (
                    <span className="ml-1 text-primary">— drag to an area</span>
                  )}
                </p>
                {projects
                  .filter((p) => !p.areaId)
                  .map((project) => (
                    <div
                      key={project.id}
                      draggable
                      onDragStart={(e) => handleProjectDragStart(e, project.id)}
                      onDragEnd={handleProjectDragEnd}
                      className={cn(
                        'cursor-grab active:cursor-grabbing',
                        draggedProjectId === project.id && 'opacity-40',
                      )}
                    >
                      <Button
                        variant={selectedProjectId === project.id ? 'secondary' : 'ghost'}
                        className="w-full justify-start h-8 text-xs"
                        onClick={() => handleProjectClick(project.id)}
                      >
                        <GripVertical className="size-3 mr-1 text-muted-foreground/40" />
                        <span
                          className="w-2.5 h-2.5 rounded-full mr-2 shrink-0"
                          style={{ backgroundColor: project.color }}
                        />
                        <span className="truncate">{project.name}</span>
                      </Button>
                    </div>
                  ))}
              </>
            )}
          </div>
        </ScrollArea>

        {/* Sidebar footer */}
        <div className="p-3 border-t shrink-0 space-y-1">
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
              D
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">Demo User</p>
              <p className="text-[10px] text-muted-foreground truncate">demo@taskflow.app</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark')}
            >
              <Sun className="size-3.5 hidden dark:block" />
              <Moon className="size-3.5 block dark:hidden" />
            </Button>
          </div>
          <Button
            variant={currentView === 'settings' ? 'secondary' : 'ghost'}
            className="w-full justify-start h-8 text-xs"
            onClick={() => setCurrentView('settings')}
          >
            <Settings className="size-3.5 mr-2" /> Settings
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="border-b px-6 py-3 flex items-center gap-4 shrink-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          {!sidebarOpen && (
            <Button variant="ghost" size="icon" className="size-8" onClick={toggleSidebar}>
              <Menu className="size-4" />
            </Button>
          )}
          <div className="flex-1">
            <h2 className="text-sm font-medium">{getViewTitle()}</h2>
          </div>
          <div className="flex items-center gap-2">
            {currentView === 'kanban' && (
              <Button variant="outline" size="sm" onClick={() => setCurrentView('tasks')}>
                <List className="size-3.5 mr-1.5" /> List View
              </Button>
            )}
            {currentView === 'tasks' && (
              <Button variant="outline" size="sm" onClick={() => setCurrentView('kanban')}>
                <LayoutGrid className="size-3.5 mr-1.5" /> Kanban View
              </Button>
            )}
          </div>
        </header>

        {/* Content area */}
        <div className="flex-1 overflow-auto p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView + (selectedAreaId || '') + (selectedProjectId || '') + (selectedNoteId || '')}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Task Detail Dialog (global) */}
      <TaskDetailDialog />

      {/* Create Area Dialog */}
      <Dialog open={showCreateArea} onOpenChange={setShowCreateArea}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Area</DialogTitle>
            <DialogDescription>Organize your projects into areas.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={newAreaName}
                onChange={(e) => setNewAreaName(e.target.value)}
                placeholder="Area name"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={newAreaDescription}
                onChange={(e) => setNewAreaDescription(e.target.value)}
                placeholder="Description (optional)"
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
                      newAreaColor === color && 'ring-2 ring-offset-2 ring-primary scale-110',
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewAreaColor(color)}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateArea(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateArea} disabled={!newAreaName.trim()}>
              Create Area
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-background">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="TaskFlow" width={32} height={32} className="h-8 w-8 rounded-lg object-cover animate-pulse" />
            <h1 className="text-3xl font-bold">TaskFlow</h1>
          </div>
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
