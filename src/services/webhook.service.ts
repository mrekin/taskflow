import { db } from "@/lib/db";
import { dispatchWebhook } from "@/lib/webhook-engine";
import type { WebhookContext, WebhookEvent } from "@/lib/webhook-engine";
import type { ServiceResult } from "./types";

export interface CreateWebhookData {
  name: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  bodyTemplate?: string | null;
  active?: boolean;
}

export interface UpdateWebhookData {
  name?: string;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  bodyTemplate?: string | null;
  active?: boolean;
}

export interface CreateTriggerData {
  webhookId: string;
  events: string[];
  scopeType?: string | null;
  scopeId?: string | null;
}

export interface UpdateTriggerData {
  events?: string[];
  scopeType?: string | null;
  scopeId?: string | null;
  active?: boolean;
}

const VALID_EVENTS = [
  'task.status_changed',
  'task.priority_changed',
  'task.due_date_reached',
  'task.created',
  'project.status_changed',
  'project.created',
];

function parseWebhook(wh: Record<string, unknown>) {
  return {
    ...wh,
    headers: JSON.parse((wh.headers as string) || '{}'),
    triggers: Array.isArray(wh.triggers)
      ? wh.triggers.map((t: Record<string, unknown>) => ({
          ...t,
          events: JSON.parse((t.events as string) || '[]'),
        }))
      : [],
  };
}

export const WebhookService = {
  async listWebhooks(userId: string | null): Promise<ServiceResult<Record<string, unknown>[]>> {
    if (!userId) return { ok: false, status: 401, error: "Authentication required" };

    const webhooks = await db.webhook.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { deliveries: true, triggers: true } },
        triggers: true,
      },
    });

    const result = webhooks.map((wh) => ({
      ...parseWebhook(wh as unknown as Record<string, unknown>),
      _count: { deliveries: (wh as any)._count.deliveries, triggers: (wh as any)._count.triggers },
    }));

    return { ok: true, data: result };
  },

  async getWebhook(userId: string, id: string): Promise<ServiceResult<Record<string, unknown>>> {
    const webhook = await db.webhook.findFirst({
      where: { id, ownerId: userId },
      include: {
        _count: { select: { deliveries: true, triggers: true } },
        triggers: true,
      },
    });

    if (!webhook) {
      return { ok: false, status: 404, error: "Webhook not found" };
    }

    return {
      ok: true,
      data: {
        ...parseWebhook(webhook as unknown as Record<string, unknown>),
        _count: { deliveries: (webhook as any)._count.deliveries, triggers: (webhook as any)._count.triggers },
      },
    };
  },

  async createWebhook(userId: string, data: CreateWebhookData): Promise<ServiceResult<Record<string, unknown>>> {
    if (!data.url || !data.name) {
      return { ok: false, status: 400, error: "Name and URL are required" };
    }

    const webhook = await db.webhook.create({
      data: {
        name: data.name.trim(),
        url: data.url.trim(),
        method: data.method?.toUpperCase() || 'POST',
        headers: JSON.stringify(data.headers || {}),
        bodyTemplate: data.bodyTemplate || null,
        active: data.active !== false,
        ownerId: userId,
      },
      include: {
        triggers: true,
      },
    });

    return { ok: true, data: parseWebhook(webhook as unknown as Record<string, unknown>) };
  },

  async updateWebhook(userId: string, id: string, data: UpdateWebhookData): Promise<ServiceResult<Record<string, unknown>>> {
    const existing = await db.webhook.findFirst({ where: { id, ownerId: userId } });
    if (!existing) {
      return { ok: false, status: 404, error: "Webhook not found" };
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.url !== undefined) updateData.url = data.url.trim();
    if (data.method !== undefined) updateData.method = data.method.toUpperCase();
    if (data.headers !== undefined) updateData.headers = JSON.stringify(data.headers);
    if (data.bodyTemplate !== undefined) updateData.bodyTemplate = data.bodyTemplate || null;
    if (data.active !== undefined) updateData.active = data.active;

    const webhook = await db.webhook.update({
      where: { id },
      data: updateData,
      include: {
        triggers: true,
      },
    });

    return { ok: true, data: parseWebhook(webhook as unknown as Record<string, unknown>) };
  },

  async deleteWebhook(userId: string, id: string): Promise<ServiceResult<{ success: boolean }>> {
    const existing = await db.webhook.findFirst({ where: { id, ownerId: userId } });
    if (!existing) {
      return { ok: false, status: 404, error: "Webhook not found" };
    }

    await db.webhook.delete({ where: { id } });
    return { ok: true, data: { success: true } };
  },

  async testWebhook(userId: string, id: string): Promise<ServiceResult<Record<string, unknown>>> {
    const webhook = await db.webhook.findFirst({
      where: { id, ownerId: userId },
      include: { triggers: { where: { active: true } } },
    });
    if (!webhook) {
      return { ok: false, status: 404, error: "Webhook not found" };
    }

    const allEvents = webhook.triggers.flatMap((t) => JSON.parse(t.events || '[]') as string[]);
    const testEvent = (allEvents[0] || 'task.status_changed') as WebhookEvent;

    const entityType = testEvent.startsWith('task.') ? 'task' as const : 'project' as const;

    const ctx: WebhookContext = {
      event: testEvent,
      entityType,
      entityId: 'test-entity-id',
      entityTitle: `Test ${entityType}`,
      entityShortId: entityType === 'task' ? 'T-0' : 'P-0',
      changes: { status: { from: 'todo', to: 'in_progress' } },
      ownerId: userId,
    };

    const result = await dispatchWebhook(
      {
        id: webhook.id,
        url: webhook.url,
        method: webhook.method,
        headers: webhook.headers,
        bodyTemplate: webhook.bodyTemplate,
        active: webhook.active,
        ownerId: webhook.ownerId,
        triggers: [],
      },
      ctx
    );

    return { ok: true, data: result as unknown as Record<string, unknown> };
  },

  async getDeliveries(userId: string, id: string): Promise<ServiceResult<Record<string, unknown>[]>> {
    const webhook = await db.webhook.findFirst({ where: { id, ownerId: userId } });
    if (!webhook) {
      return { ok: false, status: 404, error: "Webhook not found" };
    }

    const deliveries = await db.webhookDelivery.findMany({
      where: { webhookId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return { ok: true, data: deliveries as unknown as Record<string, unknown>[] };
  },

  async createTrigger(userId: string, data: CreateTriggerData): Promise<ServiceResult<Record<string, unknown>>> {
    if (!data.webhookId) {
      return { ok: false, status: 400, error: "webhookId is required" };
    }

    if (!data.events || !Array.isArray(data.events) || data.events.length === 0) {
      return { ok: false, status: 400, error: "At least one event is required" };
    }

    const invalidEvents = data.events.filter((e: string) => !VALID_EVENTS.includes(e));
    if (invalidEvents.length > 0) {
      return { ok: false, status: 400, error: `Invalid events: ${invalidEvents.join(', ')}` };
    }

    const webhook = await db.webhook.findFirst({
      where: { id: data.webhookId, ownerId: userId },
    });
    if (!webhook) {
      return { ok: false, status: 404, error: "Webhook not found" };
    }

    const trigger = await db.webhookTrigger.create({
      data: {
        webhookId: data.webhookId,
        events: JSON.stringify(data.events),
        scopeType: data.scopeType || null,
        scopeId: data.scopeId || null,
        active: true,
      },
    });

    return { ok: true, data: { ...trigger, events: JSON.parse(trigger.events) } };
  },

  async updateTrigger(userId: string, triggerId: string, data: UpdateTriggerData): Promise<ServiceResult<Record<string, unknown>>> {
    const trigger = await db.webhookTrigger.findUnique({
      where: { id: triggerId },
      include: { webhook: { select: { ownerId: true } } },
    });

    if (!trigger || trigger.webhook.ownerId !== userId) {
      return { ok: false, status: 404, error: "Trigger not found" };
    }

    const updateData: Record<string, unknown> = {};
    if (data.events !== undefined) {
      if (!Array.isArray(data.events) || data.events.length === 0) {
        return { ok: false, status: 400, error: "At least one event is required" };
      }
      const invalidEvents = data.events.filter((e: string) => !VALID_EVENTS.includes(e));
      if (invalidEvents.length > 0) {
        return { ok: false, status: 400, error: `Invalid events: ${invalidEvents.join(', ')}` };
      }
      updateData.events = JSON.stringify(data.events);
    }
    if (data.scopeType !== undefined) updateData.scopeType = data.scopeType || null;
    if (data.scopeId !== undefined) updateData.scopeId = data.scopeId || null;
    if (data.active !== undefined) updateData.active = data.active;

    const updated = await db.webhookTrigger.update({
      where: { id: triggerId },
      data: updateData,
    });

    return { ok: true, data: { ...updated, events: JSON.parse(updated.events) } };
  },

  async deleteTrigger(userId: string, triggerId: string): Promise<ServiceResult<{ success: boolean }>> {
    const trigger = await db.webhookTrigger.findUnique({
      where: { id: triggerId },
      include: { webhook: { select: { ownerId: true } } },
    });

    if (!trigger || trigger.webhook.ownerId !== userId) {
      return { ok: false, status: 404, error: "Trigger not found" };
    }

    await db.webhookTrigger.delete({ where: { id: triggerId } });
    return { ok: true, data: { success: true } };
  },
};
