import type { StorageAdapter } from './adapter';
import { LocalStorageAdapter } from './local-adapter';

let adapterInstance: StorageAdapter | null = null;

export function getStorageAdapter(): StorageAdapter {
  if (adapterInstance) return adapterInstance;

  const adapterType = process.env.STORAGE_ADAPTER || 'local';

  switch (adapterType) {
    case 'local':
      adapterInstance = new LocalStorageAdapter();
      break;
    default:
      throw new Error(`Unknown storage adapter: ${adapterType}`);
  }

  return adapterInstance;
}
