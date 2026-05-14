export const STORAGE_LOCAL_PATH_DEFAULT = '/app/uploads';

export interface AttachmentConfig {
  maxSize: number;
  maxPerEntity: number;
  allowedPatterns: string[];
  totalSize: number;
  userMaxSize: number;
}

const DEFAULT_CONFIG: Omit<AttachmentConfig, 'totalSize' | 'userMaxSize'> = {
  maxSize: 10 * 1024 * 1024, // 10 MB
  maxPerEntity: 10,
  allowedPatterns: ['*'],
};

const DEFAULT_USER_MAX_SIZE_MB = 512; // 512 MB

function parseMb(envValue: string | undefined, defaultMb: number): number {
  const mb = parseInt(envValue || String(defaultMb), 10);
  return mb * 1024 * 1024;
}

export function getAttachmentConfig(): AttachmentConfig {
  return {
    maxSize: parseInt(process.env.ATTACHMENT_MAX_SIZE || String(DEFAULT_CONFIG.maxSize), 10),
    maxPerEntity: parseInt(process.env.ATTACHMENT_MAX_PER_ENTITY || String(DEFAULT_CONFIG.maxPerEntity), 10),
    allowedPatterns: process.env.ATTACHMENT_ALLOWED_PATTERNS?.split(',').map(p => p.trim()) || DEFAULT_CONFIG.allowedPatterns,
    totalSize: parseMb(process.env.ATTACHMENT_TOTAL_SIZE, 0),
    userMaxSize: parseMb(process.env.ATTACHMENT_USER_MAX_SIZE, DEFAULT_USER_MAX_SIZE_MB),
  };
}
