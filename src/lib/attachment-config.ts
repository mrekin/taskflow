export const STORAGE_LOCAL_PATH_DEFAULT = '/app/uploads';

export interface AttachmentConfig {
  maxSize: number;
  maxPerEntity: number;
  maxPerComment: number;
  allowedPatterns: string[];
  totalSize: number;
  userMaxSize: number;
}

const DEFAULT_MAX_PER_COMMENT = 3;

let cachedConfig: AttachmentConfig | null = null;

export function getAttachmentConfig(): AttachmentConfig {
  if (cachedConfig) return cachedConfig;
  cachedConfig = {
    maxSize: parseInt(process.env.ATTACHMENT_MAX_SIZE || String(10 * 1024 * 1024), 10),
    maxPerEntity: parseInt(process.env.ATTACHMENT_MAX_PER_ENTITY || '10', 10),
    maxPerComment: parseInt(process.env.ATTACHMENT_MAX_PER_COMMENT || String(DEFAULT_MAX_PER_COMMENT), 10),
    allowedPatterns: process.env.ATTACHMENT_ALLOWED_PATTERNS?.split(',').map(p => p.trim()) || ['*'],
    totalSize: parseMb(process.env.ATTACHMENT_TOTAL_SIZE, 0),
    userMaxSize: parseMb(process.env.ATTACHMENT_USER_MAX_SIZE, DEFAULT_USER_MAX_SIZE_MB),
  };
  return cachedConfig;
}

const DEFAULT_USER_MAX_SIZE_MB = 512; // 512 MB

function parseMb(envValue: string | undefined, defaultMb: number): number {
  const mb = parseInt(envValue || String(defaultMb), 10);
  return mb * 1024 * 1024;
}
