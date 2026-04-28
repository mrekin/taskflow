'use client';

import { useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { useTheme } from 'next-themes';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import Image from 'next/image';
import {
  ListTodo,
  Columns3,
  FileText,
  Sun,
  Moon,
  Plus,
  ChevronRight,
  Settings,
} from 'lucide-react';
import { CreateAreaDialog } from '@/components/create-area-dialog';
import { CreateProjectDialog } from '@/components/create-project-dialog';

export function SidebarNav() {
  const {
    currentView,
    setCurrentView,
    selectedAreaId,
    selectedProjectId,
    selectArea,
    selectProject,
    areas,
    projects,
  } = useAppStore();

  const { theme, setTheme } = useTheme();
  const [createAreaOpen, setCreateAreaOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());

  const toggleAreaExpand = (areaId: string) => {
    setExpandedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(areaId)) {
        next.delete(areaId);
      } else {
        next.add(areaId);
      }
      return next;
    });
  };

  const handleNavClick = (view: 'tasks' | 'kanban' | 'notes') => {
    setCurrentView(view);
    selectArea(null);
    selectProject(null);
  };

  const handleAreaClick = (areaId: string) => {
    selectArea(areaId);
    selectProject(null);
    setCurrentView('areas');
    // Also expand the area in sidebar
    if (!expandedAreas.has(areaId)) {
      toggleAreaExpand(areaId);
    }
  };

  const handleProjectClick = (projectId: string, areaId: string) => {
    selectArea(areaId);
    selectProject(projectId);
    setCurrentView('projects');
  };

  const getProjectsForArea = (areaId: string) => {
    return projects.filter((p) => p.areaId === areaId);
  };

  return (
    <Sidebar>
      {/* Header - Branding */}
      <SidebarHeader className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg overflow-hidden">
            <Image
              src={`${process.env.NEXT_BASE_PATH || ''}/logo.png`}
              alt="TaskFlow"
              width={32}
              height={32}
              className="size-8 rounded-lg object-cover"
              unoptimized
            />
          </div>
          <span className="text-lg font-bold tracking-tight text-foreground">
            TaskFlow
          </span>
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      {/* Main Navigation */}
      <SidebarContent className="custom-scrollbar">
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={currentView === 'tasks' && !selectedAreaId}
                  onClick={() => handleNavClick('tasks')}
                  tooltip="My Tasks"
                >
                  <ListTodo className="size-4" />
                  <span>My Tasks</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={currentView === 'kanban' && !selectedAreaId}
                  onClick={() => handleNavClick('kanban')}
                  tooltip="Kanban Board"
                >
                  <Columns3 className="size-4" />
                  <span>Kanban Board</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={currentView === 'notes' && !selectedProjectId}
                  onClick={() => handleNavClick('notes')}
                  tooltip="Notes"
                >
                  <FileText className="size-4" />
                  <span>Notes</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Areas Section */}
        <SidebarGroup>
          <SidebarGroupLabel>Areas</SidebarGroupLabel>
          <SidebarGroupAction onClick={() => setCreateAreaOpen(true)} title="Add Area">
            <Plus className="size-4" />
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              {areas.map((area) => {
                const isExpanded = expandedAreas.has(area.id);
                const areaProjects = getProjectsForArea(area.id);
                const isActive = selectedAreaId === area.id && currentView === 'areas';

                return (
                  <Collapsible
                    key={area.id}
                    open={isExpanded}
                    onOpenChange={() => toggleAreaExpand(area.id)}
                    asChild
                  >
                    <SidebarMenuItem>
                      <div className="flex items-center">
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton
                            isActive={isActive}
                            tooltip={area.name}
                            onClick={() => handleAreaClick(area.id)}
                          >
                            <span
                              className="size-3 shrink-0 rounded-full"
                              style={{ backgroundColor: area.color }}
                            />
                            <span className="truncate">{area.name}</span>
                            <ChevronRight className="ml-auto size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                      </div>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {areaProjects.map((project) => (
                            <SidebarMenuSubItem key={project.id}>
                              <SidebarMenuSubButton
                                isActive={
                                  selectedProjectId === project.id &&
                                  currentView === 'projects'
                                }
                                onClick={() =>
                                  handleProjectClick(project.id, area.id)
                                }
                              >
                                <span
                                  className="size-2.5 shrink-0 rounded-sm"
                                  style={{ backgroundColor: project.color }}
                                />
                                <span className="truncate">{project.name}</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton
                              onClick={() => setCreateProjectOpen(true)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Plus className="size-3.5" />
                              <span>Add Project</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                );
              })}

              {areas.length === 0 && (
                <div className="px-2 py-4 text-center">
                  <p className="text-xs text-muted-foreground">
                    No areas yet
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-7 text-xs"
                    onClick={() => setCreateAreaOpen(true)}
                  >
                    <Plus className="mr-1 size-3" />
                    Create Area
                  </Button>
                </div>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer - User & Theme */}
      <SidebarFooter>
        <SidebarSeparator />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={currentView === 'settings'}
              onClick={() => setCurrentView('settings')}
              tooltip="Settings"
            >
              <Settings className="size-4" />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              tooltip="Toggle Theme"
            >
              {theme === 'dark' ? (
                <Sun className="size-4" />
              ) : (
                <Moon className="size-4" />
              )}
              <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="User">
              <Avatar className="size-5">
                <AvatarFallback className="bg-primary/10 text-[10px] text-primary">
                  D
                </AvatarFallback>
              </Avatar>
              <span>Demo User</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      {/* Dialogs */}
      <CreateAreaDialog
        open={createAreaOpen}
        onOpenChange={setCreateAreaOpen}
      />
      <CreateProjectDialog
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
      />
    </Sidebar>
  );
}
