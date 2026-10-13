'use client';

import { Calendar } from 'lucide-react';

import { useAppStore } from '@/store/app-store';
import { RELEASE_STATUS_COLORS, RELEASE_STATUS_LABELS } from '@/lib/constants';
import { formatShortId } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TagBadges } from '@/components/tag-badges';
import type { Release } from '@/lib/types';

interface ReleaseCardProps {
  release: Release;
  onClick?: () => void;
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString();
}

export function ReleaseCard({ release, onClick }: ReleaseCardProps) {
  const { tags } = useAppStore();

  const color = RELEASE_STATUS_COLORS[release.status] ?? RELEASE_STATUS_COLORS.planned;

  const start = formatDate(release.plannedStartDate);
  const end = formatDate(release.plannedEndDate);

  const resolvedTagIds = (release.tagIds || []).filter((id) =>
    tags.some((t) => t.id === id)
  );

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-all py-3 group"
      onClick={onClick}
    >
      <CardHeader className="pb-2 pt-0 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="size-2.5 rounded-full shrink-0"
              style={{ backgroundColor: color }}
              title={RELEASE_STATUS_LABELS[release.status] ?? release.status}
            />
            <CardTitle className="text-base group-hover:text-primary transition-colors truncate">
              {release.title}
            </CardTitle>
            <span className="font-mono text-[10px] text-muted-foreground shrink-0">
              {formatShortId('release', release.shortIdNum)}
            </span>
          </div>
          {release.version && (
            <Badge variant="outline" className="text-[10px] h-5 shrink-0">
              v{release.version}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-2 space-y-2">
        {release.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {release.description}
          </p>
        )}
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <Badge
            variant="outline"
            className="text-[10px] h-5 shrink-0"
            style={{ color, borderColor: `${color}66` }}
          >
            {RELEASE_STATUS_LABELS[release.status] ?? release.status}
          </Badge>
          {(start || end) && (
            <span className="flex items-center gap-1 min-w-0">
              <Calendar className="size-3 shrink-0" />
              <span className="truncate">
                {start ?? '—'} → {end ?? '—'}
              </span>
            </span>
          )}
        </div>
        {resolvedTagIds.length > 0 && (
          <TagBadges tagIds={resolvedTagIds} max={3} size="sm" />
        )}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{release._count?.tasks ?? 0} tasks</span>
          <span>·</span>
          <span>{release._count?.notes ?? 0} notes</span>
          <span>·</span>
          <span>{release._count?.folders ?? 0} folders</span>
        </div>
      </CardContent>
    </Card>
  );
}
