import { db } from '@/lib/db';
import { formatShortId, type EntityType } from './utils';

export type WebhookEvent =
  | 'task.status_changed'
  | 'task.priority_changed'
  | 'task.due_date_reached'
  | 'task.created'
  | 'task.assigned_to_me'
  | 'project.status_changed'
  | 'project.created'
  | 'entity.access_granted'
  | 'entity.access_revoked'
  | 'entity.visibility_changed';

export interface WebhookContext {
  event: WebhookEvent;
  entityType: 'task' | 'project' | 'area' | 'note' | 'folder';
  entityId: string;
  entityTitle: string;
  entityShortId: string;
  changes?: Record<string, { from: unknown; to: unknown } | string[]>;
  projectId?: string | null;
  areaId?: string | null;
  ownerId: string;
  grantedTo?: { id: string; name: string | null; email: string | null };
  visibilityFrom?: string;
  visibilityTo?: string;
}

interface TriggerRecord {
  id: string;
  webhookId: string;
  events: string;
  scopeType: string | null;
  scopeId: string | null;
  active: boolean;
}

interface WebhookRecord {
  id: string;
  url: string;
  method: string;
  headers: string;
  bodyTemplate: string | null;
  active: boolean;
  ownerId: string;
  triggers: TriggerRecord[];
}

export function replacePlaceholders(template: string, ctx: WebhookContext): string {
  const newStatus = (ctx.changes?.status as { from: unknown; to: unknown } | undefined)?.to;
  return template
    .replace(/\{taskId\}/g, ctx.entityShortId)
    .replace(/\{projectId\}/g, ctx.entityShortId)
    .replace(/\{entityId\}/g, ctx.entityShortId)
    .replace(/\{title\}/g, ctx.entityTitle)
    .replace(/\{entityTitle\}/g, ctx.entityTitle)
    .replace(/\{event\}/g, ctx.event)
    .replace(/\{status\}/g, typeof newStatus === 'string' ? newStatus : '')
    .replace(/\{grantedToId\}/g, ctx.grantedTo?.id || '')
    .replace(/\{grantedToName\}/g, ctx.grantedTo?.name || '')
    .replace(/\{grantedToEmail\}/g, ctx.grantedTo?.email || '')
    .replace(/\{visibilityFrom\}/g, ctx.visibilityFrom || '')
    .replace(/\{visibilityTo\}/g, ctx.visibilityTo || '');
}

function triggerMatchesScope(trigger: TriggerRecord, ctx: WebhookContext): boolean {
  if (!trigger.scopeType || !trigger.scopeId) return true;

  if (trigger.scopeType === ctx.entityType && trigger.scopeId === ctx.entityId) return true;

  if (trigger.scopeType === 'project' && ctx.entityType === 'task' && ctx.projectId === trigger.scopeId) return true;

  if (trigger.scopeType === 'project' && ctx.entityType === 'project' && ctx.entityId === trigger.scopeId) return true;

  if (trigger.scopeType === 'area' && ctx.areaId === trigger.scopeId) return true;

  return false;
}

export async function fireWebhookEvent(ctx: WebhookContext): Promise<void> {
  try {
    const webhooks = await db.webhook.findMany({
      where: {
        ownerId: ctx.ownerId,
        active: true,
      },
      include: {
        triggers: {
          where: { active: true },
        },
      },
    });

    const matchingWebhooks: WebhookRecord[] = [];

    for (const webhook of webhooks) {
      const hasMatch = webhook.triggers.some((trigger) => {
        const events: string[] = JSON.parse(trigger.events || '[]');
        if (!events.includes(ctx.event)) return false;
        return triggerMatchesScope(trigger as unknown as TriggerRecord, ctx);
      });

      if (hasMatch) {
        matchingWebhooks.push(webhook as unknown as WebhookRecord);
      }
    }

    await Promise.allSettled(
      matchingWebhooks.map((webhook) => dispatchWebhook(webhook, ctx))
    );
  } catch (error) {
    console.error('[Webhook] Error firing webhook event:', error);
  }
}

export async function dispatchWebhook(webhook: WebhookRecord, ctx: WebhookContext): Promise<{ success: boolean; statusCode: number | null; response: string | null; elapsed: number }> {
  const rawUrl = replacePlaceholders(webhook.url, ctx);
  const url = encodeURI(rawUrl);
  const method = webhook.method.toUpperCase();
  const headers: Record<string, string> = JSON.parse(webhook.headers || '{}');
  const startTime = Date.now();

  let statusCode: number | null = null;
  let responseBody: string | null = null;
  let success = false;

  try {
    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      signal: AbortSignal.timeout(10000),
    };

    if (method === 'POST') {
      const bodyData: Record<string, unknown> = {
        event: ctx.event,
        entityType: ctx.entityType,
        entityId: ctx.entityShortId,
        title: ctx.entityTitle,
        timestamp: new Date().toISOString(),
      };

      if (ctx.changes) {
        bodyData.changes = ctx.changes;
      }

      if (webhook.bodyTemplate) {
        const customBody = replacePlaceholders(webhook.bodyTemplate, ctx);
        try {
          fetchOptions.body = JSON.stringify({
            ...JSON.parse(customBody),
            ...bodyData,
          });
        } catch {
          fetchOptions.body = JSON.stringify({
            ...bodyData,
            customBody,
          });
        }
      } else {
        fetchOptions.body = JSON.stringify(bodyData);
      }
    }

    const response = await fetch(url, fetchOptions);
    statusCode = response.status;
    responseBody = await response.text().catch(() => null);
    success = statusCode >= 200 && statusCode < 300;

    const elapsed = Date.now() - startTime;
    console.log(`[Webhook] ${method} ${url} → ${statusCode} (${elapsed}ms)`);
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const errMsg = error instanceof Error ? error.message : String(error);
    responseBody = errMsg;
    success = false;
    console.error(`[Webhook] ${method} ${url} → ERROR: ${errMsg} (${elapsed}ms)`);
  }

  try {
    await db.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        event: ctx.event,
        payload: JSON.stringify({
          url,
          method,
          entityType: ctx.entityType,
          entityId: ctx.entityShortId,
          title: ctx.entityTitle,
          changes: ctx.changes,
        }),
        statusCode,
        response: responseBody ? responseBody.slice(0, 2000) : null,
        success,
      },
    });
  } catch (logError) {
    console.error('[Webhook] Failed to log delivery:', logError);
  }

  return { success, statusCode, response: responseBody, elapsed: Date.now() - startTime };
}

export async function resolveTaskAreaId(projectId: string | null | undefined): Promise<string | null> {
  if (!projectId) return null;
  try {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { areaId: true },
    });
    return project?.areaId ?? null;
  } catch {
    return null;
  }
}

export function resolveProjectAreaId(areaId: string | null | undefined): string | null {
  return areaId ?? null;
}

export function buildTaskContext(
  task: { id: string; title: string; shortIdNum: number; projectId: string | null; ownerId: string },
  event: WebhookEvent,
  changes?: Record<string, { from: unknown; to: unknown }>,
  areaId?: string | null
): WebhookContext {
  return {
    event,
    entityType: 'task',
    entityId: task.id,
    entityTitle: task.title,
    entityShortId: formatShortId('task', task.shortIdNum),
    changes,
    projectId: task.projectId,
    areaId: areaId ?? null,
    ownerId: task.ownerId,
  };
}

export function buildProjectContext(
  project: { id: string; title?: string; name: string; shortIdNum: number; areaId: string | null; ownerId: string },
  event: WebhookEvent,
  changes?: Record<string, { from: unknown; to: unknown }>
): WebhookContext {
  return {
    event,
    entityType: 'project',
    entityId: project.id,
    entityTitle: project.name,
    entityShortId: formatShortId('project', project.shortIdNum),
    changes,
    projectId: project.id,
    areaId: project.areaId,
    ownerId: project.ownerId,
  };
}

export function computeChanges(
  oldRecord: Record<string, unknown>,
  newRecord: Record<string, unknown>,
  fields: string[]
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of fields) {
    const oldVal = oldRecord[field];
    const newVal = newRecord[field];
    if (oldVal instanceof Date && newVal instanceof Date) {
      if (oldVal.getTime() === newVal.getTime()) continue;
    }
    if (oldVal !== newVal) {
      changes[field] = { from: oldVal, to: newVal };
    }
  }
  return changes;
}

export function buildAccessContext(
  entity: { id: string; title?: string; name?: string; shortIdNum: number; projectId?: string | null; ownerId: string },
  entityType: 'task' | 'project' | 'area' | 'note' | 'folder',
  event: WebhookEvent,
  changes: {
    visibility?: { from: string | null; to: string | null };
    addedUsers?: string[];
    removedUsers?: string[];
  },
  grantedTo?: { id: string; name: string | null; email: string | null },
  areaId?: string | null,
): WebhookContext {
  return {
    event,
    entityType: entityType === 'area' || entityType === 'note' || entityType === 'folder' ? 'task' : entityType,
    entityId: entity.id,
    entityTitle: entity.title || entity.name || '',
    entityShortId: formatShortId('task', entity.shortIdNum),
    changes: {
      ...(changes.visibility ? { visibility: changes.visibility } : {}),
      ...(changes.addedUsers?.length ? { addedUsers: changes.addedUsers } : {}),
      ...(changes.removedUsers?.length ? { removedUsers: changes.removedUsers } : {}),
    },
    projectId: entity.projectId ?? null,
    areaId: areaId ?? null,
    ownerId: entity.ownerId,
    grantedTo,
    visibilityFrom: changes.visibility?.from ?? undefined,
    visibilityTo: changes.visibility?.to ?? undefined,
  };
}
