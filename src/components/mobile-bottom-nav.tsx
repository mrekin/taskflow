'use client';

import { List, LayoutGrid, Plus, StickyNote, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';

export function MobileBottomNav() {
  const currentView = useAppStore((s) => s.currentView);
  const setCurrentView = useAppStore((s) => s.setCurrentView);
  const fetchTasks = useAppStore((s) => s.fetchTasks);
  const fetchNotes = useAppStore((s) => s.fetchNotes);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);

  const items = [
    { icon: List, label: 'Tasks', view: 'tasks' as const, action: () => { setCurrentView('tasks'); fetchTasks(); } },
    { icon: LayoutGrid, label: 'Kanban', view: 'kanban' as const, action: () => { setCurrentView('kanban'); fetchTasks(); } },
    { icon: Plus, label: 'Create', view: 'quick-create' as const, action: () => setCurrentView('quick-create'), highlight: true },
    { icon: StickyNote, label: 'Notes', view: 'notes' as const, action: () => { setCurrentView('notes'); fetchNotes(); } },
  ];

  const isActive = (view: string) => {
    if (view === 'notes') return currentView === 'notes' || currentView === 'note-editor';
    return currentView === view;
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:hidden">
      <div className="flex items-center justify-around h-14" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {items.map((item) => (
          <button
            key={item.view}
            type="button"
            onClick={item.action}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors',
              item.highlight ? '' : isActive(item.view) ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            {item.highlight ? (
              <div className="flex items-center justify-center size-10 rounded-full bg-primary text-primary-foreground -mt-5 shadow-lg active:scale-95 transition-transform">
                <item.icon className="size-5" />
              </div>
            ) : (
              <item.icon className="size-5" />
            )}
            <span className={cn('text-[10px]', item.highlight && 'mt-0.5')}>{item.label}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={toggleSidebar}
          className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors text-muted-foreground"
        >
          <Menu className="size-5" />
          <span className="text-[10px]">More</span>
        </button>
      </div>
    </nav>
  );
}
