'use client';

import { useState } from 'react';
import { Check, Link2 } from 'lucide-react';
import { cn, getEntityLink, copyToClipboard } from '@/lib/utils';
import type { EntityType } from '@/lib/utils';

interface EntityIdBadgeProps {
  /** The human-readable short ID (e.g. "T-7", "P-3") */
  shortId: string;
  /** The internal CUID for link generation */
  id: string;
  type: EntityType;
  /** Optional version number — shown in the label and included in the copied link */
  version?: number;
  className?: string;
}

export function EntityIdBadge({ shortId, id, type, version, className }: EntityIdBadgeProps) {
  const [copiedId, setCopiedId] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyId = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await copyToClipboard(shortId);
    if (ok) {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1500);
    }
  };

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const link = window.location.origin + getEntityLink(type, shortId, id, version);
    const ok = await copyToClipboard(link);
    if (ok) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1500);
    }
  };

  return (
    <div
      className={cn('inline-flex items-center gap-0.5 rounded-md bg-muted/60 border border-border/50 text-[10px] font-mono text-muted-foreground', className)}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={handleCopyId}
        className={cn(
          'px-2 py-1 sm:px-1.5 sm:py-0.5 transition-colors',
          copiedId ? 'text-emerald-500' : 'hover:text-foreground',
        )}
        title="Copy ID"
      >
        {copiedId ? <Check className="size-2.5 inline -mt-0.5 mr-0.5" /> : null}{shortId}
        {version !== undefined ? <span className="text-primary/70">·v{version}</span> : null}
      </button>
      <button
        type="button"
        onClick={handleCopyLink}
        className="px-1.5 py-1 sm:px-1 sm:py-0.5 hover:text-foreground transition-colors border-l border-border/50"
        title="Copy direct link"
      >
        {copiedLink ? <Check className="size-2.5 text-emerald-500" /> : <Link2 className="size-2.5" />}
      </button>
    </div>
  );
}
