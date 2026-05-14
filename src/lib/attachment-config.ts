export const STORAGE_LOCAL_PATH_DEFAULT = '/app/uploads';

export interface AttachmentConfig {
  maxSize: number;
  maxPerEntity: number;
  allowedPatterns: string[];
}

const DEFAULT_CONFIG: AttachmentConfig = {
  maxSize: 10 * 1024 * 1024, // 10 MB
  maxPerEntity: 10,
  allowedPatterns: ['*'],
};

export function getAttachmentConfig(): AttachmentConfig {
  return {
    maxSize: parseInt(process.env.ATTACHMENT_MAX_SIZE || String(DEFAULT_CONFIG.maxSize), 10),
    maxPerEntity: parseInt(process.env.ATTACHMENT_MAX_PER_ENTITY || String(DEFAULT_CONFIG.maxPerEntity), 10),
    allowedPatterns: process.env.ATTACHMENT_ALLOWED_PATTERNS?.split(',').map(p => p.trim()) || DEFAULT_CONFIG.allowedPatterns,
  };
}
