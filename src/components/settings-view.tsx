'use client';

import { useSyncExternalStore } from 'react';
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
  Settings,
  Save,
  FileText,
  List,
  Zap,
  LayoutGrid,
  StickyNote,
  ListChecks,
  Tags,
  Link2,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WebhooksSection } from '@/components/webhooks-section';
import { StatusColumnsSettings } from '@/components/status-columns-settings';
import { TagsManagementSection } from '@/components/tags-management-section';
import { useAppStore } from '@/store/app-store';
import { DEFAULT_PAGE_OPTIONS, DEFAULT_PREFERENCES } from '@/lib/constants';

const emptySubscribe = () => () => {};
function useIsMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

const iconMap: Record<string, React.ElementType> = {
  'quick-create': Zap,
  'tasks': List,
  'kanban': LayoutGrid,
  'notes': StickyNote,
};

export function SettingsView() {
  const { theme, setTheme } = useTheme();
  const { data: session } = useSession();
  const { userPreferences, updateUserPreference } = useAppStore();
  const mounted = useIsMounted();

  const prefs = userPreferences;
  const email = session?.user?.email || '';
  const displayName = session?.user?.name || '';
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || 'unknown';
  const buildType = process.env.NEXT_PUBLIC_BUILD_TYPE || 'test';

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
      <div className="flex items-center gap-3 pb-4 border-b">
        <Settings className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      </div>

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
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Theme</Label>
              <Select value={mounted ? (theme ?? 'system') : undefined} onValueChange={setTheme}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">
                    <Sun className="size-3.5" />
                    Light
                  </SelectItem>
                  <SelectItem value="dark">
                    <Moon className="size-3.5" />
                    Dark
                  </SelectItem>
                  <SelectItem value="system">
                    <Monitor className="size-3.5" />
                    System
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <Label>Default Page</Label>
              <Select value={prefs.defaultPage} onValueChange={(v) => updateUserPreference('defaultPage', v as typeof prefs.defaultPage)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEFAULT_PAGE_OPTIONS.map((opt) => {
                    const Icon = iconMap[opt.value];
                    return (
                      <SelectItem key={opt.value} value={opt.value}>
                        {Icon && <Icon className="size-3.5" />}
                        {opt.label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <Label htmlFor="entity-short-links">Short entity links</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {prefs.entityShortLinks
                    ? 'Entity links are shortened (#T-3) — portable if server changes'
                    : 'Entity links keep full URL — portable when exporting to files'}
                </p>
              </div>
              <Switch
                id="entity-short-links"
                checked={prefs.entityShortLinks}
                onCheckedChange={(v) => updateUserPreference('entityShortLinks', v)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Tasks Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks className="h-4 w-4 text-primary" />
              Tasks
            </CardTitle>
            <CardDescription>Configure task display and status columns</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
                  <Label htmlFor="show-subtasks">Show subtasks inline</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {prefs.showSubtasks
                    ? 'Subtasks are shown nested under parent tasks in list and kanban views'
                    : 'Subtasks are hidden from list and kanban views'}
                </p>
              </div>
              <Switch
                id="show-subtasks"
                checked={prefs.showSubtasks}
                onCheckedChange={(v) => updateUserPreference('showSubtasks', v)}
              />
            </div>

            <Separator />

            <StatusColumnsSettings />
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
                  {prefs.noteAutoSave
                    ? 'Notes are saved automatically after a short delay'
                    : 'Notes must be saved manually using the Save button'}
                </p>
              </div>
              <Switch
                id="note-autosave"
                checked={prefs.noteAutoSave}
                onCheckedChange={(v) => updateUserPreference('noteAutoSave', v)}
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
                  {prefs.notesTree
                    ? 'Notes and folders are shown in a tree view in the sidebar'
                    : 'Notes tree is hidden from the sidebar'}
                </p>
              </div>
              <Switch
                id="notes-tree"
                checked={prefs.notesTree}
                onCheckedChange={(v) => {
                  updateUserPreference('notesTree', v);
                  window.dispatchEvent(new CustomEvent('notes-tree-toggle', { detail: v }));
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Tags Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Tags className="h-4 w-4 text-primary" />
              Tags
            </CardTitle>
            <CardDescription>Manage tags used across tasks, notes, projects, and areas</CardDescription>
          </CardHeader>
          <CardContent>
            <TagsManagementSection />
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
                <span className="text-sm font-medium font-mono">{appVersion} - {buildType}</span>
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
