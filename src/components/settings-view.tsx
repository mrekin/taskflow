'use client';

import { useSyncExternalStore, useState, useCallback, useEffect } from 'react';
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
  Indent,
  Tags,
  Link2,
  Loader2,
  Pencil,
  X,
  Check,
  FolderOpen,
  HardDrive,
  ChevronDown,
  File,
  Trash2,
  DollarSign,
} from 'lucide-react';
import { GitHubIcon } from '@/components/github-icon';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { WebhooksSection } from '@/components/webhooks-section';
import { StatusColumnsSettings } from '@/components/status-columns-settings';
import { TagsManagementSection } from '@/components/tags-management-section';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
import { EntityIdBadge } from '@/components/entity-id-badge';
import { useAppStore } from '@/store/app-store';
import { DEFAULT_PAGE_OPTIONS, DEFAULT_PREFERENCES, CURRENCIES } from '@/lib/constants';

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

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function SettingsView() {
  const { theme, setTheme } = useTheme();
  const { data: session, update: updateSession } = useSession();
  const { userPreferences, updateUserPreference } = useAppStore();
  const mounted = useIsMounted();

  const prefs = userPreferences;
  const email = session?.user?.email || '';
  const displayName = session?.user?.name || '';
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || 'unknown';
  const buildType = process.env.NEXT_PUBLIC_BUILD_TYPE || 'test';

  const [nameValue, setNameValue] = useState(displayName);
  const [nameEditing, setNameEditing] = useState(false);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState(false);

  const [storageData, setStorageData] = useState<{
    serverUsed: number;
    serverLimit: number;
    userUsed: number;
    userLimit: number;
  } | null>(null);

  const [userFiles, setUserFiles] = useState<{
    id: string;
    originalName: string;
    size: number;
    mimeType: string;
    createdAt: string;
    attachments: {
      id: string;
      displayName: string;
      entity: { id: string; shortId: string; type: 'task' | 'note' };
    }[];
  }[] | null>(null);
  const [filesOpen, setFilesOpen] = useState(false);
  const [deleteFileTarget, setDeleteFileTarget] = useState<{ id: string; name: string } | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);

  const handleDeleteFile = async () => {
    if (!deleteFileTarget) return;
    setDeletingFileId(deleteFileTarget.id);
    setDeleteFileTarget(null);
    try {
      const basePath = process.env.NEXT_BASE_PATH || '';
      const res = await fetch(`${basePath}/api/attachments/user-files?blobId=${deleteFileTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        setUserFiles((prev) => prev?.filter((x) => x.id !== deleteFileTarget.id) ?? null);
      }
    } catch {
      // ignore
    } finally {
      setDeletingFileId(null);
    }
  };

  useEffect(() => {
    const basePath = process.env.NEXT_BASE_PATH || '';
    fetch(`${basePath}/api/attachments/storage`)
      .then((res) => res.ok ? res.json() : null)
      .then(setStorageData)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!filesOpen || userFiles) return;
    const basePath = process.env.NEXT_BASE_PATH || '';
    fetch(`${basePath}/api/attachments/user-files`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => data?.files && setUserFiles(data.files))
      .catch(() => {});
  }, [filesOpen, userFiles]);

  const handleSaveName = useCallback(async () => {
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed.length < 2) {
      setNameError('Name must be at least 2 characters');
      return;
    }
    if (trimmed === displayName) return;

    setNameSaving(true);
    setNameError(null);
    setNameSuccess(false);

    try {
      const basePath = process.env.NEXT_BASE_PATH || '';
      const res = await fetch(`${basePath}/api/user/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });

      if (res.status === 409) {
        setNameError('This name is already taken');
        return;
      }
      if (!res.ok) {
        setNameError('Failed to update name');
        return;
      }

      setNameSuccess(true);
      setNameEditing(false);
      setTimeout(() => setNameSuccess(false), 2000);

      await updateSession?.();
    } catch {
      setNameError('Failed to update name');
    } finally {
      setNameSaving(false);
    }
  }, [nameValue, displayName, updateSession]);

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
    <div className="flex flex-col">
      <div className="flex items-center gap-3 pb-4 border-b">
        <Settings className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      </div>

      <div className="py-6 space-y-6">
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
              <div className="space-y-1 flex-1 min-w-0">
                {nameEditing ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      id="user-name"
                      value={nameValue}
                      onChange={(e) => {
                        setNameValue(e.target.value);
                        setNameError(null);
                        setNameSuccess(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveName();
                        if (e.key === 'Escape') {
                          setNameValue(displayName);
                          setNameEditing(false);
                          setNameError(null);
                        }
                      }}
                      placeholder="Enter your name"
                      className="h-7 text-sm"
                      autoFocus
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      onClick={handleSaveName}
                      disabled={nameSaving || nameValue.trim() === displayName || nameValue.trim().length < 2}
                    >
                      {nameSaving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      onClick={() => {
                        setNameValue(displayName);
                        setNameEditing(false);
                        setNameError(null);
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium">{displayName}</p>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 shrink-0"
                      onClick={() => setNameEditing(true)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                {nameError && (
                  <p className="text-xs text-destructive">{nameError}</p>
                )}
                <p className="text-xs text-muted-foreground">{email}</p>
              </div>
            </div>

            <Separator />

            <div className="flex items-center gap-4">
              <Label className="text-sm font-medium shrink-0">Visible to others</Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="visibility-name"
                  checked={prefs.profileVisibility.nickname}
                  onCheckedChange={(checked) =>
                    updateUserPreference('profileVisibility', {
                      ...prefs.profileVisibility,
                      nickname: checked === true,
                    })
                  }
                />
                <Label htmlFor="visibility-name" className="text-sm cursor-pointer">
                  Name
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="visibility-email"
                  checked={prefs.profileVisibility.email}
                  onCheckedChange={(checked) =>
                    updateUserPreference('profileVisibility', {
                      ...prefs.profileVisibility,
                      email: checked === true,
                    })
                  }
                />
                <Label htmlFor="visibility-email" className="text-sm cursor-pointer">
                  Email
                </Label>
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

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                  <Label htmlFor="group-tasks-by-project">Group tasks by project</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {prefs.groupTasksByProject
                    ? 'Tasks are grouped under project headers in kanban and list views'
                    : 'Tasks are shown in a flat list'}
                </p>
              </div>
              <Switch
                id="group-tasks-by-project"
                checked={prefs.groupTasksByProject}
                onCheckedChange={(v) => updateUserPreference('groupTasksByProject', v)}
              />
            </div>

            <Separator />

            <StatusColumnsSettings />

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                  <Label>Default Currency</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Currency used for new tasks by default
                </p>
              </div>
              <Select
                value={prefs.defaultCurrency || 'USD'}
                onValueChange={(v) => updateUserPreference('defaultCurrency', v)}
              >
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Indent className="h-3.5 w-3.5 text-muted-foreground" />
                  <Label htmlFor="tab-indent">Use Tab to indent</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {prefs.tabIndent
                    ? 'Tab key inserts 4 spaces in notes, task descriptions, and comments'
                    : 'Tab key moves focus between fields (browser default)'}
                </p>
              </div>
              <Switch
                id="tab-indent"
                checked={prefs.tabIndent}
                onCheckedChange={(v) => updateUserPreference('tabIndent', v)}
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

        {/* Storage Section */}
        {storageData && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <HardDrive className="h-4 w-4 text-primary" />
                Storage
              </CardTitle>
              <CardDescription>Attachment storage usage</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {storageData.serverLimit > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Server</span>
                    <span className="font-medium">{formatBytes(storageData.serverUsed)} / {formatBytes(storageData.serverLimit)}</span>
                  </div>
                  <Progress value={Math.min((storageData.serverUsed / storageData.serverLimit) * 100, 100)} />
                </div>
              )}
              {storageData.userLimit > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Your files</span>
                    <span className="font-medium">{formatBytes(storageData.userUsed)} / {formatBytes(storageData.userLimit)}</span>
                  </div>
                  <Progress value={Math.min((storageData.userUsed / storageData.userLimit) * 100, 100)} />
                </div>
              )}
              <Collapsible open={filesOpen} onOpenChange={setFilesOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-between text-xs text-muted-foreground">
                    <span>{filesOpen ? 'Hide files' : 'Show files'}{userFiles ? ` (${userFiles.length})` : ''}</span>
                    <ChevronDown className={`size-3.5 transition-transform ${filesOpen ? 'rotate-180' : ''}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  {!userFiles ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : userFiles.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No files uploaded</p>
                  ) : (
                    <div className="space-y-1 mt-2">
                      {userFiles.map((f) => (
                        <div key={f.id} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs">
                          <File className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="flex-1 truncate min-w-0">{f.originalName}</span>
                          <span className="text-muted-foreground whitespace-nowrap">{formatBytes(f.size)}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            {f.attachments.length > 0 ? (
                              f.attachments.map((att) => (
                                <EntityIdBadge
                                  key={att.id}
                                  id={att.entity.id}
                                  shortId={att.entity.shortId}
                                  type={att.entity.type}
                                  className="text-[9px]"
                                />
                              ))
                            ) : (
                              <span className="text-muted-foreground italic text-[10px]">unlinked</span>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                              disabled={deletingFileId === f.id}
                              onClick={() => setDeleteFileTarget({ id: f.id, name: f.originalName })}
                            >
                              {deletingFileId === f.id ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <Trash2 className="size-3" />
                              )}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
              <AlertDialog open={!!deleteFileTarget} onOpenChange={(open) => !open && setDeleteFileTarget(null)}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete File</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete &quot;{deleteFileTarget?.name}&quot;? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteFile}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        )}

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
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-muted-foreground">Description</span>
                  <p className="text-sm mt-1">A lightweight task manager and notes application</p>
                </div>
                <a
                  href="https://github.com/mrekin/taskflow"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <GitHubIcon className="size-4" />
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
