import { db } from '@/lib/db';
import { getStorageAdapter } from '@/lib/storage';

interface EntityRef {
  id: string;
  type: 'task' | 'note' | 'comment';
}

export async function cleanupAttachments(entities: EntityRef[]): Promise<void> {
  if (entities.length === 0) return;

  // Collect all attachments to delete, grouped by blobId
  const attachments = await db.attachment.findMany({
    where: {
      OR: entities.map((e) => ({ entityId: e.id, entityType: e.type })),
    },
    select: { id: true, blobId: true, blob: { select: { storageKey: true } } },
  });

  if (attachments.length === 0) return;

  const blobIds = [...new Set(attachments.map((a) => a.blobId))];
  const attachmentIds = attachments.map((a) => a.id);

  await db.attachment.deleteMany({
    where: { id: { in: attachmentIds } },
  });

  // Clean up blobs that have no remaining attachments
  for (const blobId of blobIds) {
    const remaining = await db.attachment.count({ where: { blobId } });
    if (remaining === 0) {
      const blob = attachments.find((a) => a.blobId === blobId)?.blob;
      if (blob) {
        const storage = getStorageAdapter();
        await storage.delete(blob.storageKey).catch(() => {});
      }
      await db.fileBlob.delete({ where: { id: blobId } }).catch(() => {});
    }
  }
}
