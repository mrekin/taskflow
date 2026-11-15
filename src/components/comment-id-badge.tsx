'use client';

import { useState } from 'react';
import { Check, Link2 } from 'lucide-react';
import { cn, copyToClipboard } from '@/lib/utils';

interface CommentIdBadgeProps {
  /** The human-readable comment short ID (e.g. "TC-5", "NC-3"). Render nothing when null/empty. */
  shortId: string | null;
  /** Full deep-link URL (origin + pathname + query incl. the comment param) for the link icon. */
  link: string;
  className?: string;
}

/**
 * Compact ID badge for comments (T-196), modeled on EntityIdBadge:
 * click on the ID text copies the ID, click on the link icon copies the
 * full deep-link URL. Hidden for legacy comments without a short ID.
 */
export function CommentIdBadge({ shortId, link, className }: CommentIdBadgeProps) {
  const [copiedId, setCopiedId] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  if (!shortId) return null;

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
    const ok = await copyToClipboard(link);
    if (ok) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1500);
    }
  };

  return (
    <span
      className={cn('inline-flex items-center gap-0.5 rounded-md bg-muted/60 border border-border/50 text-[10px] font-mono text-muted-foreground', className)}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={handleCopyId}
        className={cn(
          'px-1 py-0.5 transition-colors',
          copiedId ? 'text-emerald-500' : 'hover:text-foreground',
        )}
        title="Copy comment ID"
      >
        {copiedId ? <Check className="size-2.5 inline -mt-0.5 mr-0.5" /> : null}{shortId}
      </button>
      <button
        type="button"
        onClick={handleCopyLink}
        className="px-1 py-0.5 hover:text-foreground transition-colors border-l border-border/50"
        title="Copy comment link"
      >
        {copiedLink ? <Check className="size-2.5 text-emerald-500" /> : <Link2 className="size-2.5" />}
      </button>
    </span>
  );
}
