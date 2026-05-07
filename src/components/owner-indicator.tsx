'use client';

import { Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OwnerIndicatorProps {
  ownerId: string;
  currentUserId: string | null;
  ownerName?: string | null;
  className?: string;
}

export function OwnerIndicator({
  ownerId,
  currentUserId,
  ownerName,
  className,
}: OwnerIndicatorProps) {
  if (ownerId === currentUserId) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs text-muted-foreground',
        className,
      )}
    >
      <Share2 className="size-3" />
      <span>{ownerName || 'Shared'}</span>
    </span>
  );
}
