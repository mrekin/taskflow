'use client';

import { useState, useEffect } from 'react';
import {
  KeyRound,
  Plus,
  Trash2,
  Ban,
  Check,
  Copy,
  CircleAlert,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAppStore } from '@/store/app-store';
import type { ApiToken, TokenAction, TokenEntity, TokenPermissions } from '@/lib/types';
import { toast } from 'sonner';
import { cn, copyToClipboard } from '@/lib/utils';
import { DeleteDialog } from '@/components/delete-dialog';
import { EmptyState } from '@/components/empty-state';

const ENTITIES: { key: TokenEntity; label: string }[] = [
  { key: 'tasks', label: 'Tasks' },
  { key: 'notes', label: 'Notes' },
  { key: 'comments', label: 'Comments' },
];

const ACTIONS: { key: TokenAction; label: string; short: string }[] = [
  { key: 'read', label: 'Read', short: 'R' },
  { key: 'create', label: 'Create', short: 'C' },
  { key: 'update', label: 'Update', short: 'U' },
  { key: 'delete', label: 'Delete', short: 'D' },
];

function emptyPermissions(): TokenPermissions {
  return {
    tasks: { read: false, create: false, update: false, delete: false },
    notes: { read: false, create: false, update: false, delete: false },
    comments: { read: false, create: false, update: false, delete: false },
  };
}

function tokenStatus(token: ApiToken): { label: string; className: string } {
  if (token.revokedAt) return { label: 'Revoked', className: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20' };
  if (token.expiresAt && new Date(token.expiresAt) <= new Date()) {
    return { label: 'Expired', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' };
  }
  return { label: 'Active', className: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20' };
}

function permissionsSummary(permissions: TokenPermissions): string {
  return ENTITIES.map(({ key, label }) => {
    const enabled = ACTIONS.filter((a) => permissions[key]?.[a.key]).map((a) => a.short);
    return enabled.length ? `${label}: ${enabled.join('')}` : null;
  })
    .filter(Boolean)
    .join(' · ');
}

function formatDate(value: string | null): string {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

export function ApiTokensSection() {
  const apiTokens = useAppStore((s) => s.apiTokens);
  const projects = useAppStore((s) => s.projects);
  const fetchApiTokens = useAppStore((s) => s.fetchApiTokens);
  const fetchProjects = useAppStore((s) => s.fetchProjects);
  const createApiToken = useAppStore((s) => s.createApiToken);
  const revokeApiToken = useAppStore((s) => s.revokeApiToken);
  const deleteApiToken = useAppStore((s) => s.deleteApiToken);

  const [createOpen, setCreateOpen] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiToken | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiToken | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchApiTokens();
    if (projects.length === 0) fetchProjects();
  }, [fetchApiTokens, fetchProjects, projects.length]);

  const handleCopy = async () => {
    if (!createdToken) return;
    await copyToClipboard(createdToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await revokeApiToken(revokeTarget.id);
      toast.success(`Token "${revokeTarget.name}" revoked`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to revoke token');
    }
    setRevokeTarget(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteApiToken(deleteTarget.id);
      toast.success(`Token "${deleteTarget.name}" deleted`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete token');
    }
    setDeleteTarget(null);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4 text-primary" />
              API Tokens
            </CardTitle>
            <CardDescription>Personal tokens for REST API access (Authorization: Bearer)</CardDescription>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4 mr-1" /> Add Token
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {apiTokens.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="No API tokens"
            description="Create a token to access your tasks and notes programmatically"
            action={{ label: 'Create First Token', onClick: () => setCreateOpen(true), icon: Plus }}
          />
        ) : (
          <div className="space-y-2">
            {apiTokens.map((token) => {
              const status = tokenStatus(token);
              return (
                <div
                  key={token.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{token.name}</span>
                      <code className="rounded bg-muted/60 border border-border/50 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                        {token.tokenPrefix}…
                      </code>
                      <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', status.className)}>
                        {status.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      <span>
                        Scope: {token.scopeType === 'all'
                          ? 'All accessible projects'
                          : `${token.projectIds.length} project${token.projectIds.length === 1 ? '' : 's'}`}
                      </span>
                      {token.expiresAt && <span>Expires: {formatDate(token.expiresAt)}</span>}
                      <span>Last used: {formatDate(token.lastUsedAt)}</span>
                    </div>
                    <p className="truncate text-xs font-mono text-muted-foreground/80">
                      {permissionsSummary(token.permissions) || 'No permissions'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!token.revokedAt && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-muted-foreground hover:text-foreground"
                        onClick={() => setRevokeTarget(token)}
                        title="Revoke token"
                      >
                        <Ban className="size-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget(token)}
                      title="Delete token"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <CreateTokenDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        isSubmitting={isSubmitting}
        setIsSubmitting={setIsSubmitting}
        onCreated={(raw) => {
          setCreateOpen(false);
          setCreatedToken(raw);
        }}
      />

      {/* One-time token display */}
      <Dialog open={!!createdToken} onOpenChange={(open) => !open && setCreatedToken(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CircleAlert className="h-4 w-4 text-amber-500" />
              Copy your token now
            </DialogTitle>
            <DialogDescription>
              This is the only time the full token is shown. Store it somewhere safe — it cannot be recovered.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-md border border-border/50 bg-muted/60 px-3 py-2 font-mono text-xs">
              {createdToken}
            </code>
            <Button variant="outline" size="icon" onClick={handleCopy} title="Copy token">
              {copied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setCreatedToken(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteDialog
        open={!!revokeTarget}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
        title="Revoke API token"
        description={`Revoke "${revokeTarget?.name}"? Requests using this token will immediately stop working. The token stays in the list until deleted.`}
        onConfirm={handleRevoke}
      />
      <DeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete API token"
        description={`Delete "${deleteTarget?.name}" from the list? This cannot be undone.`}
        onConfirm={handleDelete}
      />
    </Card>
  );
}

function CreateTokenDialog({
  open,
  onOpenChange,
  isSubmitting,
  setIsSubmitting,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSubmitting: boolean;
  setIsSubmitting: (v: boolean) => void;
  onCreated: (rawToken: string) => void;
}) {
  const projects = useAppStore((s) => s.projects);

  const [name, setName] = useState('');
  const [scopeType, setScopeType] = useState<'all' | 'projects'>('all');
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<TokenPermissions>(emptyPermissions());
  const [expiryMode, setExpiryMode] = useState<'never' | 'date'>('never');
  const [expiryDate, setExpiryDate] = useState('');

  const resetForm = () => {
    setName('');
    setScopeType('all');
    setSelectedProjectIds([]);
    setPermissions(emptyPermissions());
    setExpiryMode('never');
    setExpiryDate('');
  };

  const toggleEntityAction = (entity: TokenEntity, action: TokenAction) => {
    setPermissions((prev) => ({
      ...prev,
      [entity]: { ...prev[entity], [action]: !prev[entity][action] },
    }));
  };

  const toggleRow = (entity: TokenEntity) => {
    const allOn = ACTIONS.every((a) => permissions[entity][a.key]);
    setPermissions((prev) => ({
      ...prev,
      [entity]: Object.fromEntries(ACTIONS.map((a) => [a.key, !allOn])) as Record<TokenAction, boolean>,
    }));
  };

  const toggleColumn = (action: TokenAction) => {
    const allOn = ENTITIES.every((e) => permissions[e.key][action]);
    setPermissions((prev) => ({
      tasks: { ...prev.tasks, [action]: !allOn },
      notes: { ...prev.notes, [action]: !allOn },
      comments: { ...prev.comments, [action]: !allOn },
    }));
  };

  const canSubmit =
    name.trim().length > 0 &&
    name.trim().length <= 64 &&
    (scopeType === 'all' || selectedProjectIds.length > 0) &&
    ENTITIES.some((e) => ACTIONS.some((a) => permissions[e.key][a.key]));

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const expiresAt =
        expiryMode === 'date' && expiryDate
          ? new Date(`${expiryDate}T23:59:59`).toISOString()
          : null;
      const { token } = await useAppStore.getState().createApiToken({
        name: name.trim(),
        scopeType,
        projectIds: scopeType === 'projects' ? selectedProjectIds : undefined,
        permissions,
        expiresAt,
      });
      toast.success('API token created');
      resetForm();
      onCreated(token);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create token');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create API token</DialogTitle>
          <DialogDescription>
            Configure what the token can access. The token is shown only once after creation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="api-token-name">Name</Label>
            <Input
              id="api-token-name"
              placeholder="e.g. MCP integration"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Project scope</Label>
            <RadioGroup value={scopeType} onValueChange={(v) => setScopeType(v as 'all' | 'projects')} className="gap-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="all" id="scope-all" />
                <Label htmlFor="scope-all" className="font-normal cursor-pointer">
                  All projects accessible to me
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="projects" id="scope-projects" />
                <Label htmlFor="scope-projects" className="font-normal cursor-pointer">
                  Specific projects
                </Label>
              </div>
            </RadioGroup>
            {scopeType === 'projects' && (
              <ScrollArea className="mt-2 max-h-36 rounded-md border border-border/50 p-2">
                {projects.length === 0 ? (
                  <p className="p-2 text-xs text-muted-foreground">No projects available</p>
                ) : (
                  <div className="space-y-1.5">
                    {projects.map((project) => (
                      <div key={project.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`project-${project.id}`}
                          checked={selectedProjectIds.includes(project.id)}
                          onCheckedChange={(checked) =>
                            setSelectedProjectIds((prev) =>
                              checked ? [...prev, project.id] : prev.filter((id) => id !== project.id)
                            )
                          }
                        />
                        <Label
                          htmlFor={`project-${project.id}`}
                          className="font-normal cursor-pointer text-xs"
                          style={{ color: project.color }}
                        >
                          {project.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Permissions</Label>
            <div className="rounded-md border border-border/50 p-2">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="w-24" />
                    {ACTIONS.map((a) => (
                      <th key={a.key} className="px-1 py-1 text-center font-medium text-muted-foreground">
                        <button
                          type="button"
                          className="hover:text-foreground cursor-pointer"
                          onClick={() => toggleColumn(a.key)}
                          title={`Toggle all "${a.label}" permissions`}
                        >
                          {a.label}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ENTITIES.map((e) => (
                    <tr key={e.key}>
                      <td className="py-1">
                        <button
                          type="button"
                          className="font-medium hover:text-foreground cursor-pointer"
                          onClick={() => toggleRow(e.key)}
                          title={`Toggle all permissions for ${e.label}`}
                        >
                          {e.label}
                        </button>
                      </td>
                      {ACTIONS.map((a) => (
                        <td key={a.key} className="px-1 py-1 text-center">
                          <Checkbox
                            checked={permissions[e.key][a.key]}
                            onCheckedChange={() => toggleEntityAction(e.key, a.key)}
                            aria-label={`${e.label} ${a.label}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Expiration</Label>
            <RadioGroup value={expiryMode} onValueChange={(v) => setExpiryMode(v as 'never' | 'date')} className="gap-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="never" id="expiry-never" />
                <Label htmlFor="expiry-never" className="font-normal cursor-pointer">Never expires</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="date" id="expiry-date" />
                <Label htmlFor="expiry-date" className="font-normal cursor-pointer">Expires on</Label>
                {expiryMode === 'date' && (
                  <Input
                    type="date"
                    value={expiryDate}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="h-8 w-40 text-xs"
                  />
                )}
              </div>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || isSubmitting}>
            {isSubmitting ? 'Creating…' : 'Create Token'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
