import { promises as fs } from 'fs';
import path from 'path';
import type { StorageAdapter } from './adapter';
import { api } from '@/lib/api-utils';
import { STORAGE_LOCAL_PATH_DEFAULT } from '@/lib/attachment-config';

export class LocalStorageAdapter implements StorageAdapter {
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath || process.env.STORAGE_LOCAL_PATH || STORAGE_LOCAL_PATH_DEFAULT;
  }

  private resolveKey(key: string): string {
    return path.join(this.basePath, key);
  }

  async put(key: string, data: Buffer, _mimeType: string): Promise<void> {
    const filePath = this.resolveKey(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const filePath = this.resolveKey(key);
      return await fs.readFile(filePath);
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const filePath = this.resolveKey(key);
      await fs.unlink(filePath);
    } catch {
      // File already deleted or doesn't exist
    }
  }

  getUrl(blobId: string): string {
    return api(`/api/attachments/file/${blobId}`);
  }
}
