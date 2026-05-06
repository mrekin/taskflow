'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Webhook as WebhookIcon,
  Plus,
  Trash2,
  TestTube,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Copy,
  Pencil,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import type { Webhook, WebhookDelivery } from '@/lib/types';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const WEBHOOK_EVENTS = [
  { value: 'task.status_changed', label: 'Task Status Changed', description: 'When a task status is updated' },
  { value: 'task.priority_changed', label: 'Task Priority Changed', description: 'When a task priority is updated' },
  { value: 'task.due_date_reached', label: 'Task Due Date Reached', description: 'When a task reaches its due date' },
  { value: 'task.created', label: 'Task Created', description: 'When a new task is created' },
  { value: 'project.status_changed', label: 'Project Status Changed', description: 'When a project status is updated' },
  { value: 'project.created', label: 'Project Created', description: 'When a new project is created' },
] as const;

const PLACEHOLDERS = [
  { value: '{entityId}', description: 'Entity short ID (e.g., T-7, P-3)' },
  { value: '{taskId}', description: 'Task short ID (same as entityId for tasks)' },
  { value: '{projectId}', description: 'Project short ID (same as entityId for projects)' },
  { value: '{title}', description: 'Task or project title' },
  { value: '{entityTitle}', description: 'Entity title (same as {title})' },
  { value: '{event}', description: 'Event name (e.g., task.status_changed)' },
  { value: '{status}', description: 'New status value (when status changed)' },
];

interface WebhookFormData {
  name: string;
  url: string;
  method: 'GET' | 'POST';
  events: string[];
  scopeType: string;
  scopeId: string;
  headers: Record<string, string>;
  bodyTemplate: string;
  active: boolean;
}

const defaultFormData: WebhookFormData = {
  name: '',
  url: '',
  method: 'POST',
  events: [],
  scopeType: '',
  scopeId: '',
  headers: {},
  bodyTemplate: '',
  active: true,
};

export function WebhooksSection() {
  const {
    webhooks, fetchWebhooks, createWebhook, updateWebhook, deleteWebhook,
    testWebhook, fetchWebhookDeliveries, createWebhookTrigger, updateWebhookTrigger,
    tasks, projects, areas,
  } = useAppStore();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [formData, setFormData] = useState<WebhookFormData>(defaultFormData);
  const [expandedWebhookId, setExpandedWebhookId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const urlCursorRef = useRef<number | null>(null);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  const basePath = process.env.NEXT_BASE_PATH || '';

  const getTaskInfo = (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return null;
    return { id: task.id, shortId: task.shortId, title: task.title };
  };

  const getScopeLabel = (scopeType: string | null, scopeId: string | null) => {
    if (!scopeType) return 'Global';
    if (scopeType === 'project') {
      const project = projects.find((p) => p.id === scopeId);
      return project ? `Project: ${project.name}` : 'Project scope';
    }
    if (scopeType === 'area') {
      const area = areas.find((a) => a.id === scopeId);
      return area ? `Area: ${area.name}` : 'Area scope';
    }
    return scopeType;
  };

  const getAllEvents = (webhook: Webhook) => {
    const eventSet = new Set<string>();
    for (const trigger of webhook.triggers ?? []) {
      if (trigger.scopeType === 'task') continue;
      for (const ev of trigger.events) {
        eventSet.add(ev);
      }
    }
    return Array.from(eventSet);
  };

  const getLinkedTasks = (webhook: Webhook) => {
    const linked: { taskId: string; shortId: string; title: string }[] = [];
    for (const trigger of webhook.triggers ?? []) {
      if (trigger.scopeType === 'task' && trigger.scopeId) {
        const info = getTaskInfo(trigger.scopeId);
        if (info) {
          linked.push({ taskId: info.id, shortId: info.shortId, title: info.title });
        }
      }
    }
    return linked;
  };

  const handleCreate = () => {
    setFormData(defaultFormData);
    setEditingWebhook(null);
    setShowCreateDialog(true);
  };

  const handleEdit = (webhook: Webhook) => {
    const primaryTrigger = webhook.triggers?.[0];
    setFormData({
      name: webhook.name,
      url: webhook.url,
      method: webhook.method as 'GET' | 'POST',
      events: primaryTrigger?.events ?? [],
      scopeType: primaryTrigger?.scopeType ?? '',
      scopeId: primaryTrigger?.scopeId ?? '',
      headers: webhook.headers || {},
      bodyTemplate: webhook.bodyTemplate || '',
      active: webhook.active,
    });
    setEditingWebhook(webhook);
    setShowCreateDialog(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.url.trim()) {
      toast.error('Name and URL are required');
      return;
    }
    if (formData.events.length === 0) {
      toast.error('Select at least one event');
      return;
    }

    setSaving(true);
    try {
      const data = {
        name: formData.name.trim(),
        url: formData.url.trim(),
        method: formData.method,
        headers: formData.headers,
        bodyTemplate: formData.bodyTemplate || null,
        active: formData.active,
      };

      if (editingWebhook) {
        await updateWebhook(editingWebhook.id, data);
        const existingTriggers = editingWebhook.triggers ?? [];
        if (existingTriggers.length > 0) {
          await updateWebhookTrigger(existingTriggers[0].id, {
            events: formData.events,
            scopeType: formData.scopeType || undefined,
            scopeId: formData.scopeId || undefined,
          });
        } else {
          await createWebhookTrigger({
            webhookId: editingWebhook.id,
            events: formData.events,
            scopeType: formData.scopeType || undefined,
            scopeId: formData.scopeId || undefined,
          });
        }
        toast.success('Webhook updated');
      } else {
        const newWebhook = await createWebhook(data);
        if (newWebhook && formData.events.length > 0) {
          await createWebhookTrigger({
            webhookId: newWebhook.id,
            events: formData.events,
            scopeType: formData.scopeType || undefined,
            scopeId: formData.scopeId || undefined,
          });
        }
        toast.success('Webhook created');
      }
      await fetchWebhooks();
      setShowCreateDialog(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save webhook');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this webhook?')) return;
    await deleteWebhook(id);
    toast.success('Webhook deleted');
    if (expandedWebhookId === id) setExpandedWebhookId(null);
  };

  const handleToggleActive = async (webhook: Webhook) => {
    try {
      await updateWebhook(webhook.id, { active: !webhook.active });
      toast.success(webhook.active ? 'Webhook disabled' : 'Webhook enabled');
    } catch {
      toast.error('Failed to toggle webhook');
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const result = await testWebhook(id);
      if (result.success) {
        toast.success(`Test successful (${result.statusCode}) — ${result.elapsed}ms`);
      } else {
        toast.error(`Test failed (${result.statusCode ?? 'no response'}) — ${result.elapsed}ms`);
      }
      if (expandedWebhookId === id) {
        const dels = await fetchWebhookDeliveries(id);
        setDeliveries(dels);
      }
    } catch {
      toast.error('Test request failed');
    } finally {
      setTestingId(null);
    }
  };

  const handleToggleExpand = async (id: string) => {
    if (expandedWebhookId === id) {
      setExpandedWebhookId(null);
      setDeliveries([]);
    } else {
      setExpandedWebhookId(id);
      const dels = await fetchWebhookDeliveries(id);
      setDeliveries(dels);
    }
  };

  const insertPlaceholder = (placeholder: string) => {
    const input = urlInputRef.current;
    const pos = urlCursorRef.current ?? input?.selectionStart ?? formData.url.length;
    const before = formData.url.slice(0, pos);
    const after = formData.url.slice(pos);
    const newUrl = before + placeholder + after;
    const newPos = pos + placeholder.length;
    setFormData((prev) => ({ ...prev, url: newUrl }));
    urlCursorRef.current = newPos;
    requestAnimationFrame(() => {
      input?.setSelectionRange(newPos, newPos);
      input?.focus();
    });
  };

  const getEventLabel = (eventValue: string) => {
    return WEBHOOK_EVENTS.find((e) => e.value === eventValue)?.label || eventValue;
  };

  const toggleEvent = (eventValue: string) => {
    setFormData((prev) => ({
      ...prev,
      events: prev.events.includes(eventValue)
        ? prev.events.filter((e) => e !== eventValue)
        : [...prev.events, eventValue],
    }));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <WebhookIcon className="h-4 w-4 text-primary" />
              Webhooks
            </CardTitle>
            <CardDescription>Send HTTP requests when events occur</CardDescription>
          </div>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="size-4 mr-1" /> Add Webhook
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {webhooks.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground border rounded-lg border-dashed">
            <WebhookIcon className="size-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No webhooks configured</p>
            <p className="text-xs mt-1 mb-3">Create a webhook to receive notifications when events happen</p>
            <Button size="sm" variant="outline" onClick={handleCreate}>
              <Plus className="size-4 mr-1" /> Create First Webhook
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {webhooks.map((webhook) => {
                const triggers = webhook.triggers ?? [];
                const linkedTasks = getLinkedTasks(webhook);
                const allEvents = getAllEvents(webhook);
                const triggerCount = triggers.length;

                const scopeLabels: string[] = [];
                const hasGlobal = triggers.some((t) => !t.scopeType);
                const hasTaskScope = linkedTasks.length > 0;
                if (hasGlobal) scopeLabels.push('Global');
                for (const t of triggers) {
                  if (t.scopeType === 'project') scopeLabels.push(getScopeLabel(t.scopeType, t.scopeId));
                  if (t.scopeType === 'area') scopeLabels.push(getScopeLabel(t.scopeType, t.scopeId));
                }
                const scopeSummary = scopeLabels.length > 0 ? scopeLabels.join(', ') : (hasTaskScope ? `${triggerCount} trigger${triggerCount !== 1 ? 's' : ''}` : 'No scope');

                return (
                  <motion.div
                    key={webhook.id}
                    layout
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.15 }}
                  >
                    <div className={cn(
                      'rounded-lg border transition-colors',
                      !webhook.active && 'opacity-60',
                      expandedWebhookId === webhook.id && 'ring-1 ring-primary/20'
                    )}>
                      <div
                        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => handleToggleExpand(webhook.id)}
                      >
                        <button className="shrink-0 text-muted-foreground">
                          {expandedWebhookId === webhook.id ? (
                            <ChevronDown className="size-4" />
                          ) : (
                            <ChevronRight className="size-4" />
                          )}
                        </button>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{webhook.name}</span>
                            <Badge variant={webhook.method === 'GET' ? 'secondary' : 'default'} className="text-[10px] h-5 px-1.5 font-mono">
                              {webhook.method}
                            </Badge>
                            <Badge variant={webhook.active ? 'default' : 'outline'} className="text-[10px] h-5">
                              {webhook.active ? 'Active' : 'Disabled'}
                            </Badge>
                            {linkedTasks.length > 0 && (
                              <Badge variant="outline" className="text-[10px] h-5">
                                {linkedTasks.length} task{linkedTasks.length !== 1 ? 's' : ''}
                              </Badge>
                            )}
                            {allEvents.length > 0 && (
                              <Badge variant="outline" className="text-[10px] h-5">
                                {scopeSummary} · {allEvents.length} event{allEvents.length !== 1 ? 's' : ''}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-0.5 font-mono">
                            {webhook.url}
                          </p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={() => handleToggleActive(webhook)}
                            title={webhook.active ? 'Disable' : 'Enable'}
                          >
                            {webhook.active ? (
                              <ToggleRight className="size-4 text-green-500" />
                            ) : (
                              <ToggleLeft className="size-4 text-muted-foreground" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={() => handleTest(webhook.id)}
                            disabled={testingId === webhook.id}
                            title="Test webhook"
                          >
                            <TestTube className={cn("size-4", testingId === webhook.id && "animate-pulse")} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={() => handleEdit(webhook)}
                            title="Edit webhook"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(webhook.id)}
                            title="Delete webhook"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>

                      <AnimatePresence>
                        {expandedWebhookId === webhook.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="overflow-hidden"
                          >
                            <div className="border-t px-3 pb-3 pt-2 space-y-3">
                              {/* Events */}
                              {allEvents.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {allEvents.map((ev) => (
                                    <span
                                      key={ev}
                                      className="inline-flex rounded px-1.5 py-0.5 text-[10px] border border-primary/30 bg-primary/5"
                                    >
                                      {getEventLabel(ev)}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* Linked tasks */}
                              {linkedTasks.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  <span className="text-[10px] text-muted-foreground mr-0.5">Tasks:</span>
                                  {linkedTasks.map((lt) => (
                                    <a
                                      key={lt.taskId}
                                      href={`${basePath}/?task=${lt.shortId}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title={lt.title}
                                      className="inline-flex items-center rounded-md bg-muted/60 border border-border/50 text-[10px] font-mono text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors px-1.5 py-0.5"
                                    >
                                      {lt.shortId}
                                    </a>
                                  ))}
                                </div>
                              )}

                              {/* Delivery History */}
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-xs font-medium text-muted-foreground">
                                    Delivery History
                                    {webhook._count && ` (${webhook._count.deliveries})`}
                                  </p>
                                </div>
                                {deliveries.length === 0 ? (
                                  <p className="text-xs text-muted-foreground text-center py-4">
                                    No deliveries yet. Test the webhook to see results here.
                                  </p>
                                ) : (
                                  <ScrollArea className="max-h-64">
                                    <div className="space-y-1.5">
                                      {deliveries.map((delivery) => (
                                        <div
                                          key={delivery.id}
                                          className={cn(
                                            'flex items-center gap-2 p-2 rounded-md text-xs',
                                            delivery.success ? 'bg-green-500/5' : 'bg-red-500/5'
                                          )}
                                        >
                                          {delivery.success ? (
                                            <CheckCircle2 className="size-3.5 text-green-500 shrink-0" />
                                          ) : (
                                            <XCircle className="size-3.5 text-red-500 shrink-0" />
                                          )}
                                          <span className="font-mono text-muted-foreground">
                                            {delivery.statusCode ?? 'ERR'}
                                          </span>
                                          <Badge variant="outline" className="text-[10px] h-4 px-1">
                                            {delivery.event}
                                          </Badge>
                                          <span className="text-muted-foreground ml-auto">
                                            {new Date(delivery.createdAt).toLocaleString()}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </ScrollArea>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {/* Create/Edit Webhook Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingWebhook ? 'Edit Webhook' : 'Create Webhook'}</DialogTitle>
              <DialogDescription>
                Configure an HTTP request that fires when events occur in TaskFlow.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="My webhook"
                />
              </div>

              <div className="space-y-2">
                <Label>Request URL</Label>
                <div className="flex gap-2">
                  <Select
                    value={formData.method}
                    onValueChange={(val) => setFormData((prev) => ({ ...prev, method: val as 'GET' | 'POST' }))}
                  >
                    <SelectTrigger className="w-24 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GET">GET</SelectItem>
                      <SelectItem value="POST">POST</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    ref={urlInputRef}
                    value={formData.url}
                    onChange={(e) => {
                      setFormData((prev) => ({ ...prev, url: e.target.value }));
                      urlCursorRef.current = e.target.selectionStart;
                    }}
                    onSelect={(e) => {
                      urlCursorRef.current = (e.target as HTMLInputElement).selectionStart;
                    }}
                    placeholder="https://example.com/webhook?text=Task {entityId} status changed"
                    className="font-mono text-sm"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Use placeholders like {'{entityId}'}, {'{title}'}, {'{status}'} in the URL — they will be replaced at runtime.
                </p>
                <div className="flex flex-wrap gap-1">
                  {PLACEHOLDERS.map((ph) => (
                    <button
                      key={ph.value}
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-mono bg-muted hover:bg-muted/80 transition-colors border"
                      onClick={() => insertPlaceholder(ph.value)}
                      title={ph.description}
                    >
                      <Copy className="size-2.5" />
                      {ph.value}
                    </button>
                  ))}
                </div>
              </div>

              {formData.method === 'POST' && (
                <div className="space-y-2">
                  <Label>Body Template <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Textarea
                    value={formData.bodyTemplate}
                    onChange={(e) => setFormData((prev) => ({ ...prev, bodyTemplate: e.target.value }))}
                    placeholder={'{\n  "text": "Task {entityId} status changed to {status}",\n  "title": "{title}"\n}'}
                    rows={4}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Custom JSON body template. Placeholders are replaced at runtime. Leave empty for default payload.
                  </p>
                </div>
              )}

              <Separator />

              <div className="space-y-3">
                <Label>Events</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {WEBHOOK_EVENTS.map((event) => (
                    <button
                      key={event.value}
                      type="button"
                      className={cn(
                        'flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition-all',
                        formData.events.includes(event.value)
                          ? 'border-primary/40 bg-primary/5 shadow-sm'
                          : 'border-border hover:border-primary/20'
                      )}
                      onClick={() => toggleEvent(event.value)}
                    >
                      <div className={cn(
                        'mt-0.5 size-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                        formData.events.includes(event.value)
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-muted-foreground/30'
                      )}>
                        {formData.events.includes(event.value) && (
                          <CheckCircle2 className="size-3" />
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-medium">{event.label}</p>
                        <p className="text-[11px] text-muted-foreground">{event.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label>Scope <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <p className="text-xs text-muted-foreground">
                  Limit this webhook to a specific area or project. Leave empty for global scope (all entities).
                </p>
                <div className="flex gap-2">
                  <Select
                    value={formData.scopeType || '_none'}
                    onValueChange={(val) => setFormData((prev) => ({
                      ...prev,
                      scopeType: val === '_none' ? '' : val,
                      scopeId: '',
                    }))}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue placeholder="No scope" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Global</SelectItem>
                      <SelectItem value="area">Area</SelectItem>
                      <SelectItem value="project">Project</SelectItem>
                    </SelectContent>
                  </Select>

                  {formData.scopeType === 'area' && (
                    <Select
                      value={formData.scopeId || '_none'}
                      onValueChange={(val) => setFormData((prev) => ({
                        ...prev,
                        scopeId: val === '_none' ? '' : val,
                      }))}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select area" />
                      </SelectTrigger>
                      <SelectContent>
                        {areas.map((area) => (
                          <SelectItem key={area.id} value={area.id}>
                            <span className="flex items-center gap-2">
                              <span className="size-2 rounded-full" style={{ backgroundColor: area.color }} />
                              {area.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {formData.scopeType === 'project' && (
                    <Select
                      value={formData.scopeId || '_none'}
                      onValueChange={(val) => setFormData((prev) => ({
                        ...prev,
                        scopeId: val === '_none' ? '' : val,
                      }))}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select project" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            <span className="flex items-center gap-2">
                              <span className="size-2 rounded-full" style={{ backgroundColor: project.color }} />
                              {project.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Active</Label>
                  <p className="text-xs text-muted-foreground">
                    {formData.active ? 'Webhook will fire when events occur' : 'Webhook is paused and will not fire'}
                  </p>
                </div>
                <Switch
                  checked={formData.active}
                  onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, active: checked }))}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editingWebhook ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
