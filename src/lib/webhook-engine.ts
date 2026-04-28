// Webhook trigger engine
// Fires webhooks when events occur (status change, due date reached, etc.)

import { db } from '@/lib/db';
import { formatShortId, type EntityType } from './utils';

export type WebhookEvent =
  | 'task.status_changed'
  | 'task.due_date_reached'
  | 'task.created'
  | 'project.status_changed'
  | 'project.created';

export interface WebhookContext {
  event: WebhookEvent;
  entityType: 'task' | 'project';
  entityId: string;
  entityTitle: string;
  entityShortId: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
  projectId?: string | null;
  areaId?: string | null;
  ownerId: string;
}

interface WebhookRecord {
  id: string;
  url: string;
  method: string;
  events: string;
  scopeType: string | null;
  scopeId: string | null;
  headers: string;
  bodyTemplate: string | null;
  active: boolean;
  ownerId: string;
}

/**
 * Replace placeholders in a template string with context values.
 * Supported placeholders:
 *   {taskId} / {projectId} / {entityId}  → entity shortId (e.g., T-7, P-3)
 *   {title} / {entityTitle}              → entity title
 *   {event}                              → event name (e.g., task.status_changed)
 *   {status}                             → new status value (if available in changes)
 */
export function replacePlaceholders(template: string, ctx: WebhookContext): string {
  const newStatus = ctx.changes?.status?.to;
  return template
    .replace(/\{taskId\}/g, ctx.entityShortId)
    .replace(/\{projectId\}/g, ctx.entityShortId)
    .replace(/\{entityId\}/g, ctx.entityShortId)
    .replace(/\{title\}/g, ctx.entityTitle)
    .replace(/\{entityTitle\}/g, ctx.entityTitle)
    .replace(/\{event\}/g, ctx.event)
    .replace(/\{status\}/g, typeof newStatus === 'string' ? newStatus : '');
}

/**
 * Find matching webhooks for a given event and context.
 * A webhook matches if:
 * 1. It's active
 * 2. It belongs to the same owner
 * 3. Its events list includes the triggered event
 * 4. Its scope matches:
 *    - No scope (global) → always matches
 *    - scopeType='task' + scopeId=entityId → matches this specific task
 *    - scopeType='project' + scopeId=projectId → matches tasks in this project
 *    - scopeType='area' + scopeId=areaId → matches tasks/projects in this area
 */
function webhookMatchesScope(webhook: WebhookRecord, ctx: WebhookContext): boolean {
  // No scope = global webhook, matches everything
  if (!webhook.scopeType || !webhook.scopeId) return true;

  // Direct entity match
  if (webhook.scopeType === ctx.entityType && webhook.scopeId === ctx.entityId) return true;

  // Project scope: matches if entity is a task in this project
  if (webhook.scopeType === 'project' && ctx.entityType === 'task' && ctx.projectId === webhook.scopeId) return true;

  // Project scope: matches if entity IS this project
  if (webhook.scopeType === 'project' && ctx.entityType === 'project' && ctx.entityId === webhook.scopeId) return true;

  // Area scope: matches if entity's project is in this area, or if entity's area is this area
  if (webhook.scopeType === 'area' && ctx.areaId === webhook.scopeId) return true;

  return false;
}

/**
 * Fire a webhook event. Finds all matching webhooks and dispatches them.
 * This is non-blocking — errors are logged but don't affect the caller.
 */
export async function fireWebhookEvent(ctx: WebhookContext): Promise<void> {
  try {
    // Find all active webhooks for this owner
    const webhooks = await db.webhook.findMany({
      where: {
        ownerId: ctx.ownerId,
        active: true,
      },
    });

    const matchingWebhooks = webhooks.filter((wh) => {
      // Check event match
      const events: string[] = JSON.parse(wh.events || '[]');
      if (!events.includes(ctx.event)) return false;

      // Check scope match
      return webhookMatchesScope(wh as unknown as WebhookRecord, ctx);
    });

    // Fire all matching webhooks in parallel (non-blocking)
    await Promise.allSettled(
      matchingWebhooks.map((webhook) => dispatchWebhook(webhook as unknown as WebhookRecord, ctx))
    );
  } catch (error) {
    console.error('[Webhook] Error firing webhook event:', error);
  }
}

/**
 * Dispatch a single webhook: make the HTTP request and log the delivery.
 */
async function dispatchWebhook(webhook: WebhookRecord, ctx: WebhookContext): Promise<void> {
  const url = replacePlaceholders(webhook.url, ctx);
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
      signal: AbortSignal.timeout(10000), // 10s timeout
    };

    // For POST requests, include a JSON body
    if (method === 'POST') {
      const bodyData: Record<string, unknown> = {
        event: ctx.event,
        entityType: ctx.entityType,
        entityId: ctx.entityShortId,
        title: ctx.entityTitle,
        timestamp: new Date().toISOString(),
      };

      // Include changes if available
      if (ctx.changes) {
        bodyData.changes = ctx.changes;
      }

      // If custom body template is provided, use it
      if (webhook.bodyTemplate) {
        const customBody = replacePlaceholders(webhook.bodyTemplate, ctx);
        try {
          // Try to parse as JSON first
          fetchOptions.body = JSON.stringify({
            ...JSON.parse(customBody),
            ...bodyData,
          });
        } catch {
          // If not valid JSON, send as plain text in a wrapper
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

  // Log the delivery
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
}

/**
 * Resolve the areaId for a task by looking up its project.
 * Used when building webhook context for task events.
 */
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

/**
 * Resolve the areaId for a project (direct relation).
 */
export function resolveProjectAreaId(areaId: string | null | undefined): string | null {
  return areaId ?? null;
}

/**
 * Build a webhook context from a task record.
 */
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

/**
 * Build a webhook context from a project record.
 */
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

/**
 * Compute changes between old and new values for specific fields.
 */
export function computeChanges(
  oldRecord: Record<string, unknown>,
  newRecord: Record<string, unknown>,
  fields: string[]
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of fields) {
    const oldVal = oldRecord[field];
    const newVal = newRecord[field];
    if (oldVal !== newVal) {
      changes[field] = { from: oldVal, to: newVal };
    }
  }
  return changes;
}
