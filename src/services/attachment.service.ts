import crypto from "crypto";
import { db } from "@/lib/db";
import { canReadEntity, canWriteEntity, resolveEffectiveVisibility } from "@/lib/visibility";
import { getAttachmentConfig } from "@/lib/attachment-config";
import { isFilenameAllowed } from "@/lib/attachment-utils";
import { getServerStorageUsed, getUserStorageUsed } from "@/lib/attachment-storage";
import { getEntity, parseVisibility, formatAttachment } from "@/lib/attachment-api-utils";
import type { ServiceResult } from "./types";

export interface CheckAttachmentData {
  hash: string;
  fileName: string;
  size: number;
  entityId: string;
  entityType: string;
}

export const AttachmentService = {
  async listAttachments(userId: string | null, entityId: string, entityType: string): Promise<ServiceResult<Record<string, unknown>[]>> {
    if (!userId) return { ok: false, status: 401, error: "Authentication required" };
    if (!entityId || !entityType || !['task', 'note', 'comment'].includes(entityType)) {
      return { ok: false, status: 400, error: "entityId and entityType (task|note|comment) are required" };
    }

    const entity = await getEntity(entityId, entityType, { includeVisibility: true });
    if (!entity) {
      return { ok: false, status: 404, error: "Entity not found" };
    }

    const vis = parseVisibility(entity);
    const effectiveVis = resolveEffectiveVisibility(vis.visibility, []);
    if (!canReadEntity(userId, entity.ownerId, effectiveVis, vis.visibleUserIds, true)) {
      return { ok: false, status: 403, error: "Access denied" };
    }

    const attachments = await db.attachment.findMany({
      where: { entityId, entityType },
      include: { blob: true },
      orderBy: { createdAt: 'desc' },
    });

    const result = attachments.map(a => formatAttachment(a, a.blob));
    return { ok: true, data: result };
  },

  async checkAttachment(userId: string, data: CheckAttachmentData): Promise<ServiceResult<Record<string, unknown>>> {
    if (!data.hash || !data.fileName || !data.entityId || !data.entityType || data.size === undefined) {
      return { ok: false, status: 400, error: "hash, fileName, size, entityId, entityType are required" };
    }

    if (!['task', 'note', 'comment'].includes(data.entityType)) {
      return { ok: false, status: 400, error: "entityType must be task, note, or comment" };
    }

    const config = getAttachmentConfig();

    if (data.size > config.maxSize) {
      return { ok: false, status: 400, error: `File size exceeds maximum (${config.maxSize} bytes)` };
    }

    if (!isFilenameAllowed(data.fileName, config.allowedPatterns)) {
      return { ok: false, status: 400, error: `File type not allowed: ${data.fileName}` };
    }

    const entity = await getEntity(data.entityId, data.entityType);
    if (!entity) {
      return { ok: false, status: 404, error: "Entity not found" };
    }

    if (!canWriteEntity(userId, entity.ownerId)) {
      return { ok: false, status: 403, error: "Access denied" };
    }

    const maxAllowed = data.entityType === 'comment' ? config.maxPerComment : config.maxPerEntity;
    const currentCount = await db.attachment.count({
      where: { entityId: data.entityId, entityType: data.entityType },
    });
    if (currentCount >= maxAllowed) {
      return { ok: false, status: 400, error: `Maximum ${maxAllowed} attachments per ${data.entityType}` };
    }

    const existingBlob = await db.fileBlob.findUnique({ where: { hash: data.hash } });

    if (existingBlob) {
      const existingAttachment = await db.attachment.findUnique({
        where: { entityId_entityType_displayName: { entityId: data.entityId, entityType: data.entityType, displayName: data.fileName } },
      });

      if (existingAttachment) {
        return {
          ok: true,
          data: {
            status: 'already_attached',
            attachment: formatAttachment(existingAttachment, existingBlob),
          },
        };
      }

      const attachment = await db.attachment.create({
        data: {
          entityId: data.entityId,
          entityType: data.entityType,
          blobId: existingBlob.id,
          displayName: data.fileName,
        },
        include: { blob: true },
      });

      return {
        ok: true,
        data: {
          status: 'deduplicated',
          attachment: formatAttachment(attachment, attachment.blob),
        },
      };
    }

    return { ok: true, data: { status: 'upload_needed' } };
  },

  /** Multipart binary upload. Restores the handler lost in commit 4b7744b (logic from 6057ecf). */
  async uploadAttachment(userId: string, formData: FormData): Promise<ServiceResult<Record<string, unknown>>> {
    const file = formData.get('file');
    const entityId = formData.get('entityId');
    const entityType = formData.get('entityType');

    if (!(file instanceof File) || !entityId || !entityType) {
      return { ok: false, status: 400, error: "file, entityId, entityType are required" };
    }
    if (typeof entityId !== 'string' || typeof entityType !== 'string') {
      return { ok: false, status: 400, error: "file, entityId, entityType are required" };
    }
    if (!['task', 'note', 'comment'].includes(entityType)) {
      return { ok: false, status: 400, error: "entityType must be task, note, or comment" };
    }

    // Check entity exists and user can write
    const entity = await getEntity(entityId, entityType);
    if (!entity) {
      return { ok: false, status: 404, error: "Entity not found" };
    }
    if (!canWriteEntity(userId, entity.ownerId)) {
      return { ok: false, status: 403, error: "Access denied" };
    }

    const config = getAttachmentConfig();

    // Validate size
    if (file.size > config.maxSize) {
      return { ok: false, status: 400, error: `File size exceeds maximum (${config.maxSize} bytes)` };
    }

    // Validate filename pattern
    if (!isFilenameAllowed(file.name, config.allowedPatterns)) {
      return { ok: false, status: 400, error: `File type not allowed: ${file.name}` };
    }

    // Check attachment limit
    const maxAllowed = entityType === 'comment' ? config.maxPerComment : config.maxPerEntity;
    const currentCount = await db.attachment.count({
      where: { entityId, entityType },
    });
    if (currentCount >= maxAllowed) {
      return { ok: false, status: 400, error: `Maximum ${maxAllowed} attachments per ${entityType}` };
    }

    // Check server-wide storage limit
    if (config.totalSize > 0) {
      const serverUsed = await getServerStorageUsed();
      if (serverUsed + file.size > config.totalSize) {
        return { ok: false, status: 400, error: `Server storage limit exceeded (${config.totalSize / 1024 / 1024} MB). Contact your administrator to increase the limit.` };
      }
    }

    // Check per-user storage limit
    if (config.userMaxSize > 0) {
      const userUsed = await getUserStorageUsed(userId);
      if (userUsed + file.size > config.userMaxSize) {
        return { ok: false, status: 400, error: `Your storage limit is ${config.userMaxSize / 1024 / 1024} MB. Contact your administrator to increase the limit.` };
      }
    }

    // Read file buffer and compute hash
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const actualHash = crypto.createHash('sha256').update(buffer).digest('hex');

    // Generate storage key: {hash[0:2]}/{hash[2:4]}/{hash}.{ext}
    const ext = file.name.includes('.')
      ? file.name.slice(file.name.lastIndexOf('.') + 1)
      : 'bin';
    const storageKey = `${actualHash.slice(0, 2)}/${actualHash.slice(2, 4)}/${actualHash}.${ext}`;

    // Store file (idempotent — same hash produces same key, overwrites are safe)
    const { getStorageAdapter } = await import('@/lib/storage');
    const storage = getStorageAdapter();
    await storage.put(storageKey, buffer, file.type || 'application/octet-stream');

    // Upsert blob — single atomic operation, eliminates race condition on duplicate hash
    const blob = await db.fileBlob.upsert({
      where: { hash: actualHash },
      update: {},
      create: {
        hash: actualHash,
        size: buffer.length,
        mimeType: file.type || 'application/octet-stream',
        originalName: file.name,
        storageKey,
        ownerId: userId,
      },
    });

    // Create attachment (check unique constraint)
    try {
      const attachment = await db.attachment.create({
        data: {
          entityId,
          entityType,
          blobId: blob.id,
          displayName: file.name,
        },
        include: { blob: true },
      });
      return { ok: true, data: formatAttachment(attachment, attachment.blob) };
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        return { ok: false, status: 409, error: `File "${file.name}" already exists` };
      }
      throw error;
    }
  },

  async deleteAttachment(userId: string, id: string): Promise<ServiceResult<{ success: boolean }>> {
    if (!id) {
      return { ok: false, status: 400, error: "Attachment id is required" };
    }

    const attachment = await db.attachment.findUnique({
      where: { id },
      include: { blob: true },
    });

    if (!attachment) {
      return { ok: false, status: 404, error: "Attachment not found" };
    }

    const entity = await getEntity(attachment.entityId, attachment.entityType);
    if (entity) {
      if (!canWriteEntity(userId, entity.ownerId)) {
        return { ok: false, status: 403, error: "Access denied" };
      }
    } else {
      if (attachment.blob.ownerId !== userId) {
        return { ok: false, status: 403, error: "Access denied" };
      }
    }

    const blobId = attachment.blobId;
    await db.attachment.delete({ where: { id } });

    const remainingCount = await db.attachment.count({ where: { blobId } });
    if (remainingCount === 0) {
      const { getStorageAdapter } = await import('@/lib/storage');
      const storage = getStorageAdapter();
      await storage.delete(attachment.blob.storageKey);
      await db.fileBlob.delete({ where: { id: blobId } }).catch(() => {});
    }

    return { ok: true, data: { success: true } };
  },

  async serveFile(userId: string | null, blobId: string): Promise<ServiceResult<{ data: Uint8Array; mimeType: string; originalName: string }>> {
    const blob = await db.fileBlob.findUnique({
      where: { id: blobId },
      include: { attachments: { take: 1, include: { blob: true } } },
    });

    if (!blob || blob.attachments.length === 0) {
      return { ok: false, status: 404, error: "File not found" };
    }

    const att = blob.attachments[0];
    const entity = await getEntity(att.entityId, att.entityType, { includeVisibility: true });
    if (!entity) {
      return { ok: false, status: 404, error: "Entity not found" };
    }

    const vis = parseVisibility(entity);
    const effectiveVis = resolveEffectiveVisibility(vis.visibility, []);
    if (!canReadEntity(userId, entity.ownerId, effectiveVis, vis.visibleUserIds, !!userId)) {
      return { ok: false, status: 403, error: "Access denied" };
    }

    const { getStorageAdapter } = await import('@/lib/storage');
    const storage = getStorageAdapter();
    const data = await storage.get(blob.storageKey);
    if (!data) {
      return { ok: false, status: 404, error: "File data not found" };
    }

    return {
      ok: true,
      data: {
        data: new Uint8Array(data),
        mimeType: blob.mimeType,
        originalName: blob.originalName,
      },
    };
  },
};
