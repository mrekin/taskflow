'use client';

import { useAppStore } from '@/store/app-store';
import { RELEASE_STATUS_COLORS } from '@/lib/constants';
import { formatShortId, cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface ReleaseBadgeProps {
  release: {
    id: string;
    title: string;
    version: string | null;
    status: string;
    shortIdNum: number;
  };
  className?: string;
}

export function ReleaseBadge({ release, className }: ReleaseBadgeProps) {
  const { selectRelease, setCurrentView } = useAppStore();

  const color = RELEASE_STATUS_COLORS[release.status] ?? RELEASE_STATUS_COLORS.planned;

  const fullTitle = `${formatShortId('release', release.shortIdNum)} ${release.title}${
    release.version ? ` (v${release.version})` : ''
  }`;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    selectRelease(release.id);
    setCurrentView('releases');
  };

  return (
    <Badge
      variant="secondary"
      className={cn(
        'gap-1 max-w-[200px] cursor-pointer hover:bg-secondary/80 transition-colors',
        className,
      )}
      title={fullTitle}
      onClick={handleClick}
    >
      <span
        className="size-1.5 rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="font-mono text-[10px] shrink-0">
        {formatShortId('release', release.shortIdNum)}
      </span>
      <span className="truncate font-normal text-foreground">{release.title}</span>
      {release.version && (
        <span className="text-[10px] shrink-0 opacity-80">v{release.version}</span>
      )}
    </Badge>
  );
}
