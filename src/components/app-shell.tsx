'use client';

import { useAppStore } from '@/store/app-store';
import { SidebarNav } from '@/components/sidebar-nav';
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { motion, AnimatePresence } from 'framer-motion';
import { AreaDetail } from '@/components/area-detail';
import { ProjectDetail } from '@/components/project-detail';
import { TaskList } from '@/components/task-list';
import { KanbanBoard } from '@/components/kanban-board';
import { NotesList } from '@/components/notes-list';
import { NoteEditor } from '@/components/note-editor';
import { SettingsView } from '@/components/settings-view';

const VIEW_TITLES: Record<string, string> = {
  areas: 'Area Detail',
  projects: 'Project',
  tasks: 'My Tasks',
  kanban: 'Kanban Board',
  notes: 'Notes',
  'note-editor': 'Edit Note',
  settings: 'Settings',
};

function BreadcrumbContent() {
  const {
    currentView,
    selectedAreaId,
    selectedProjectId,
    selectedNoteId,
    areas,
    projects,
    notes,
  } = useAppStore();

  const selectedArea = areas.find((a) => a.id === selectedAreaId);
  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const selectedNote = notes.find((n) => n.id === selectedNoteId);

  const items: { label: string }[] = [];

  // Build breadcrumb based on context
  if (currentView === 'tasks' || currentView === 'kanban') {
    if (selectedArea) {
      items.push({ label: selectedArea.name });
    }
    if (selectedProject) {
      items.push({ label: selectedProject.name });
    }
    items.push({ label: VIEW_TITLES[currentView] });
  } else if (currentView === 'note-editor' && selectedNote) {
    if (selectedArea) {
      items.push({ label: selectedArea.name });
    }
    if (selectedProject) {
      items.push({ label: selectedProject.name });
    }
    items.push({ label: 'Notes' });
    items.push({ label: selectedNote.title || 'Untitled' });
  } else {
    items.push({ label: VIEW_TITLES[currentView] || 'TaskFlow' });
  }

  return (
    <BreadcrumbList>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={index} className="contents">
            <BreadcrumbItem>
              {isLast ? (
                <BreadcrumbPage>{item.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink>{item.label}</BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {!isLast && <BreadcrumbSeparator />}
          </span>
        );
      })}
    </BreadcrumbList>
  );
}

export function AppShell() {
  const { currentView } = useAppStore();

  const renderContent = () => {
    switch (currentView) {
      case 'areas':
        return <AreaDetail />;
      case 'projects':
        return <ProjectDetail />;
      case 'tasks':
        return <TaskList />;
      case 'kanban':
        return <KanbanBoard />;
      case 'notes':
        return <NotesList />;
      case 'note-editor':
        return <NoteEditor />;
      case 'settings':
        return <SettingsView />;
      default:
        return <TaskList />;
    }
  };

  return (
    <SidebarProvider>
      <SidebarNav />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbContent />
          </Breadcrumb>
        </header>
        <div className="flex-1 overflow-auto p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
