'use client';

import { useState, useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  User,
  Palette,
  Database,
  Info,
  Download,
  Upload,
  Sun,
  Moon,
  Monitor,
  PanelLeftClose,
  PanelRightClose,
  Settings,
  Save,
  FileText,

  List,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { WebhooksSection } from '@/components/webhooks-section';

type SidebarPosition = 'left' | 'right';

// useSyncExternalStore to detect client-side rendering
const emptySubscribe = () => () => {};
function useIsMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

// Safe localStorage read with SSR guard
function getLocalStorageItem(key: string, fallback: string): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(key) ?? fallback;
  }
  return fallback;
}

export function SettingsView() {
  const { theme, setTheme } = useTheme();
  const { data: session } = useSession();
  const mounted = useIsMounted();

  const email = session?.user?.email || '';

  const [displayName, setDisplayName] = useState(session?.user?.name || '');
  const [sidebarPosition, setSidebarPosition] = useState<SidebarPosition>(
    () => getLocalStorageItem('taskflow-sidebar-position', 'left') as SidebarPosition
  );
  const [noteAutoSave, setNoteAutoSave] = useState(
    () => getLocalStorageItem('taskflow-note-autosave', 'true') === 'true'
  );
  const [notesTree, setNotesTree] = useState(
    () => getLocalStorageItem('taskflow-notes-tree', 'false') === 'true'
  );
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || 'unknown';

  const handleSidebarPositionChange = (position: SidebarPosition) => {
    setSidebarPosition(position);
    localStorage.setItem('taskflow-sidebar-position', position);
  };

  const handleNoteAutoSaveChange = (enabled: boolean) => {
    setNoteAutoSave(enabled);
    localStorage.setItem('taskflow-note-autosave', String(enabled));
  };

  const handleNotesTreeChange = (enabled: boolean) => {
    setNotesTree(enabled);
    localStorage.setItem('taskflow-notes-tree', String(enabled));
    window.dispatchEvent(new CustomEvent('notes-tree-toggle', { detail: enabled }));
  };

  const handleExportData = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      version: appVersion,
      data: {
        message: 'Export functionality placeholder - will be implemented in a future version',
      },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `taskflow-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            JSON.parse(reader.result as string);
            alert('Import functionality will be implemented in a future version.');
          } catch {
            alert('Invalid JSON file. Please select a valid TaskFlow export file.');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b">
        <Settings className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      </div>

      {/* Settings Content */}
      <div className="flex-1 overflow-y-auto py-6 space-y-6 custom-scrollbar">
        {/* Profile Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4 text-primary" />
              Profile
            </CardTitle>
            <CardDescription>Manage your profile information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="text-lg font-semibold bg-primary/10 text-primary">
                  {displayName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <p className="text-sm font-medium">{displayName}</p>
                <p className="text-xs text-muted-foreground">{email}</p>
              </div>
            </div>

            <Separator />

            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="display-name">Display Name</Label>
                <Input
                  id="display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your display name"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  value={email}
                  readOnly
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">Email is read-only</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Appearance Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Palette className="h-4 w-4 text-primary" />
              Appearance
            </CardTitle>
            <CardDescription>Customize the look and feel</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Theme */}
            <div className="space-y-3">
              <Label>Theme</Label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant={mounted && theme === 'light' ? 'default' : 'outline'}
                  className="flex flex-col gap-1.5 h-auto py-3"
                  onClick={() => setTheme('light')}
                >
                  <Sun className="h-5 w-5" />
                  <span className="text-xs">Light</span>
                </Button>
                <Button
                  variant={mounted && theme === 'dark' ? 'default' : 'outline'}
                  className="flex flex-col gap-1.5 h-auto py-3"
                  onClick={() => setTheme('dark')}
                >
                  <Moon className="h-5 w-5" />
                  <span className="text-xs">Dark</span>
                </Button>
                <Button
                  variant={mounted && theme === 'system' ? 'default' : 'outline'}
                  className="flex flex-col gap-1.5 h-auto py-3"
                  onClick={() => setTheme('system')}
                >
                  <Monitor className="h-5 w-5" />
                  <span className="text-xs">System</span>
                </Button>
              </div>
            </div>

            <Separator />

            {/* Sidebar Position */}
            <div className="space-y-3">
              <Label>Sidebar Position</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={sidebarPosition === 'left' ? 'default' : 'outline'}
                  className="flex items-center gap-2"
                  onClick={() => handleSidebarPositionChange('left')}
                >
                  <PanelLeftClose className="h-4 w-4" />
                  Left
                </Button>
                <Button
                  variant={sidebarPosition === 'right' ? 'default' : 'outline'}
                  className="flex items-center gap-2"
                  onClick={() => handleSidebarPositionChange('right')}
                >
                  <PanelRightClose className="h-4 w-4" />
                  Right
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Sidebar position preference is saved locally
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Notes Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" />
              Notes
            </CardTitle>
            <CardDescription>Configure note editor behavior</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Save className="h-3.5 w-3.5 text-muted-foreground" />
                  <Label htmlFor="note-autosave">Auto-save</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {noteAutoSave
                    ? 'Notes are saved automatically after a short delay'
                    : 'Notes must be saved manually using the Save button'}
                </p>
              </div>
              <Switch
                id="note-autosave"
                checked={noteAutoSave}
                onCheckedChange={handleNoteAutoSaveChange}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <List className="h-3.5 w-3.5 text-muted-foreground" />
                  <Label htmlFor="notes-tree">Show notes tree in sidebar</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {notesTree
                    ? 'Notes and folders are shown in a tree view in the sidebar'
                    : 'Notes tree is hidden from the sidebar'}
                </p>
              </div>
              <Switch
                id="notes-tree"
                checked={notesTree}
                onCheckedChange={handleNotesTreeChange}
              />
            </div>
          </CardContent>
        </Card>

        {/* Webhooks Section */}
        <WebhooksSection />

        {/* Data Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4 text-primary" />
              Data
            </CardTitle>
            <CardDescription>Manage your data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                className="flex items-center gap-2"
                onClick={handleExportData}
              >
                <Download className="h-4 w-4" />
                Export Data
              </Button>
              <Button
                variant="outline"
                className="flex items-center gap-2"
                onClick={handleImportData}
              >
                <Upload className="h-4 w-4" />
                Import Data
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Export downloads all your data as a JSON file. Import restores data from a previously exported file.
            </p>
          </CardContent>
        </Card>

        {/* About Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Info className="h-4 w-4 text-primary" />
              About
            </CardTitle>
            <CardDescription>Application information</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">App Name</span>
                <span className="text-sm font-medium">TaskFlow</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Version</span>
                <span className="text-sm font-medium font-mono">{appVersion}</span>
              </div>
              <Separator />
              <div>
                <span className="text-sm text-muted-foreground">Description</span>
                <p className="text-sm mt-1">A lightweight task manager and notes application</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
