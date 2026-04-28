'use client';

import { useAppStore } from '@/store/app-store';
import type { Tag } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface TagBadgesProps {
  tagIds: string[];
  max?: number;
  size?: 'sm' | 'default';
}

export function TagBadges({ tagIds, max = 3, size = 'default' }: TagBadgesProps) {
  const { tags } = useAppStore();

  const resolvedTags: Tag[] = tagIds
    .map((id) => tags.find((t) => t.id === id))
    .filter((t): t is Tag => t !== undefined);

  const visibleTags = resolvedTags.slice(0, max);
  const remainingCount = resolvedTags.length - max;

  if (resolvedTags.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visibleTags.map((tag) => (
        <Badge
          key={tag.id}
          className={cn(
            'border-0 font-medium',
            size === 'sm'
              ? 'px-1.5 py-0 text-[10px] leading-4'
              : 'px-2 py-0.5 text-xs'
          )}
          style={{ backgroundColor: tag.color, color: '#fff' }}
        >
          {tag.name}
        </Badge>
      ))}
      {remainingCount > 0 && (
        <Badge
          variant="secondary"
          className={cn(
            size === 'sm'
              ? 'px-1.5 py-0 text-[10px] leading-4'
              : 'px-2 py-0.5 text-xs'
          )}
        >
          +{remainingCount}
        </Badge>
      )}
    </div>
  );
}
