'use client';

import { useEffect, useState } from 'react';
import { dump as yamlDump, load as yamlLoad } from 'js-yaml';
import { AlertCircle, Loader2 } from 'lucide-react';

import { api } from '@/lib/api-utils';
import type { AttachmentPreviewCategory } from '@/lib/attachment-preview';

interface TextViewerProps {
  blobId: string;
  category: Extract<AttachmentPreviewCategory, 'json' | 'yaml'>;
}

/** Pretty-prints the fetched text; falls back to the raw content when parsing fails. */
function prettify(raw: string, category: TextViewerProps['category']): string {
  if (category === 'json') {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }
  try {
    return yamlDump(yamlLoad(raw), { indent: 2 });
  } catch {
    return raw;
  }
}

/** JSON/YAML preview: fetch as text, pretty-print, render in a scrollable monospace <pre>. */
export function TextViewer({ blobId, category }: TextViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setContent(null);
    setError(null);
    (async () => {
      try {
        const res = await fetch(api(`/api/attachments/file/${blobId}?disposition=inline`));
        if (!res.ok) throw new Error(`Failed to load file (${res.status})`);
        const raw = await res.text();
        if (!cancelled) setContent(prettify(raw, category));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load file');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blobId, category]);

  if (error) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-sm text-destructive">
        <AlertCircle className="h-6 w-6" />
        {error}
      </div>
    );
  }

  if (content === null) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <pre className="h-full w-full overflow-auto whitespace-pre p-4 font-mono text-xs leading-relaxed">
      {content}
    </pre>
  );
}
