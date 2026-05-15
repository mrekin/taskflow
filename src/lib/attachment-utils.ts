export async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function isFilenameAllowed(filename: string, patterns: string[]): boolean {
  if (patterns.some(p => p === '*' || p === '*.*')) return true;

  const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.') + 1).toLowerCase() : '';
  const name = filename.toLowerCase();

  return patterns.some(pattern => {
    const p = pattern.toLowerCase().trim();
    // Pattern like *.{pdf,zip,doc}
    const braceMatch = p.match(/^\*\.\{(.+)\}$/);
    if (braceMatch) {
      const extensions = braceMatch[1].split(',').map(e => e.trim());
      return extensions.includes(ext);
    }
    // Pattern like *.exe
    if (p.startsWith('*.')) {
      return ext === p.slice(2);
    }
    // Pattern like image.*
    if (p.endsWith('.*')) {
      const prefix = p.slice(0, -2);
      return name.startsWith(prefix + '.');
    }
    // Exact match
    return name === p;
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileExtension(filename: string): string {
  return filename.includes('.') ? filename.slice(filename.lastIndexOf('.') + 1).toLowerCase() : '';
}

export interface AttachmentConfig {
  maxSize: number;
  maxPerEntity: number;
  maxPerComment: number;
  allowedPatterns: string[];
  userMaxSize: number;
  userStorageUsed: number;
}

export interface ValidationResult {
  validFiles: File[];
  errors: string[];
}

export function validateAttachmentFiles(
  files: File[],
  config: AttachmentConfig,
  currentCount: number,
  maxAllowed: number,
): ValidationResult {
  const validFiles: File[] = [];
  const errors: string[] = [];

  for (const file of files) {
    if (file.size > config.maxSize) {
      errors.push(`${file.name}: size exceeds ${formatFileSize(config.maxSize)}`);
      continue;
    }
    if (!isFilenameAllowed(file.name, config.allowedPatterns)) {
      errors.push(`${file.name}: file type not allowed`);
      continue;
    }
    if (currentCount + validFiles.length >= maxAllowed) {
      errors.push(`Maximum ${maxAllowed} attachments`);
      break;
    }
    if (config.userMaxSize > 0 && config.userStorageUsed + file.size > config.userMaxSize) {
      errors.push(`Storage limit exceeded (${formatFileSize(config.userMaxSize)})`);
      break;
    }
    validFiles.push(file);
  }

  return { validFiles, errors };
}

export function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

export async function uploadFilesConcurrently<T>(
  items: T[],
  uploadFn: (item: T, index: number) => Promise<void>,
  options?: { maxConcurrent?: number },
): Promise<void> {
  const maxConcurrent = options?.maxConcurrent ?? 3;
  let nextIdx = 0;

  const uploadNext = async (): Promise<void> => {
    while (nextIdx < items.length) {
      const i = nextIdx++;
      await uploadFn(items[i], i);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(maxConcurrent, items.length) }, () => uploadNext()),
  );
}

export async function uploadAttachmentApi(
  file: File,
  entityId: string,
  entityType: string,
  hash: string,
) {
  const basePath = process.env.NEXT_BASE_PATH || '';
  const apiUrl = (path: string) => `${basePath}${path}`;

  const checkRes = await fetch(apiUrl('/api/attachments/check'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hash, fileName: file.name, size: file.size, entityId, entityType }),
  });
  if (!checkRes.ok) {
    const err = await checkRes.json().catch(() => ({ error: 'Check failed' }));
    throw new Error(err.error || 'Check failed');
  }
  const checkData = await checkRes.json();

  if (checkData.status === 'deduplicated' || checkData.status === 'already_attached') {
    return checkData.attachment;
  }

  if (checkData.status === 'upload_needed') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('entityId', entityId);
    formData.append('entityType', entityType);
    const uploadRes = await fetch(apiUrl('/api/attachments/upload'), {
      method: 'POST',
      body: formData,
    });
    if (!uploadRes.ok) {
      const err = await uploadRes.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(err.error || 'Upload failed');
    }
    return uploadRes.json();
  }

  throw new Error('Unexpected check response');
}
