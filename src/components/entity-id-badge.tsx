'use client';

import { useState } from 'react';
import { Copy, Check, Link2 } from 'lucide-react';
import { cn, shortId, getEntityLink, copyToClipboard } from '@/lib/utils';
import type { EntityType } from '@/lib/utils';

interface EntityIdBadgeProps {
  id: string;
  type: EntityType;
  className?: string;
}

export function EntityIdBadge({ id, type, className }: EntityIdBadgeProps) {
  const [copied, setCopied] = useState(false);

  const displayId = shortId(id);
  const prefixMap: Record<EntityType, string> = {
    task: 'T',
    project: 'P',
    note: 'N',
    area: 'A',
  };
  const prefix = prefixMap[type];

  const handleCopyId = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await copyToClipboard(id);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const link = window.location.origin + getEntityLink(type, id);
    const ok = await copyToClipboard(link);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className={cn('inline-flex items-center gap-0.5 rounded-md bg-muted/60 border border-border/50 text-[10px] font-mono text-muted-foreground', className)}>
      <span className="px-1.5 py-0.5 select-all" title={id}>
        {prefix}-{displayId}
      </span>
      <button
        type="button"
        onClick={handleCopyId}
        className="px-1 py-0.5 hover:text-foreground transition-colors border-l border-border/50"
        title="Copy ID"
      >
        {copied ? <Check className="size-2.5 text-emerald-500" /> : <Copy className="size-2.5" />}
      </button>
      <button
        type="button"
        onClick={handleCopyLink}
        className="px-1 py-0.5 hover:text-foreground transition-colors border-l border-border/50"
        title="Copy direct link"
      >
        <Link2 className="size-2.5" />
      </button>
    </div>
  );
}
