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

export function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}
