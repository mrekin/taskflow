import { db } from './db';

export async function getServerStorageUsed(): Promise<number> {
  const result = await db.fileBlob.aggregate({ _sum: { size: true } });
  return result._sum.size ?? 0;
}

export async function getUserStorageUsed(userId: string): Promise<number> {
  const result = await db.fileBlob.aggregate({
    _sum: { size: true },
    where: { ownerId: userId },
  });
  return result._sum.size ?? 0;
}
