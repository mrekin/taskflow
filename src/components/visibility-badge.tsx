'use client';

import { useMemo } from 'react';
import { Lock, Users, Globe } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  VISIBILITY_OWNER,
  VISIBILITY_USERS,
  VISIBILITY_SITE,
  VISIBILITY_WORLD,
} from '@/lib/constants';

type UserItem = { id: string; name: string | null };

interface VisibilityBadgeProps {
  visibility: string | null;
  effectiveVisibility?: string;
  visibleUserIds?: string[];
  users?: UserItem[];
  className?: string;
}

const VISIBILITY_LABEL_MAP: Record<string, string> = {
  [VISIBILITY_OWNER]: 'Owner only',
  [VISIBILITY_USERS]: 'Specific users',
  [VISIBILITY_SITE]: 'Authenticated users',
  [VISIBILITY_WORLD]: 'Everyone',
};

function getIconAndLabel(vis: string | null | undefined): {
  Icon: typeof Lock;
  label: string;
} {
  const resolved = vis ?? VISIBILITY_OWNER;

  switch (resolved) {
    case VISIBILITY_USERS:
      return { Icon: Users, label: VISIBILITY_LABEL_MAP[VISIBILITY_USERS] };
    case VISIBILITY_SITE:
    case VISIBILITY_WORLD:
      return { Icon: Globe, label: VISIBILITY_LABEL_MAP[resolved] };
    case VISIBILITY_OWNER:
    default:
      return { Icon: Lock, label: VISIBILITY_LABEL_MAP[VISIBILITY_OWNER] };
  }
}

export function VisibilityBadge({
  visibility,
  effectiveVisibility,
  visibleUserIds,
  users,
  className,
}: VisibilityBadgeProps) {
  const displayVisibility = visibility ?? effectiveVisibility;
  const { Icon, label } = getIconAndLabel(displayVisibility);

  const tooltipContent = useMemo(() => {
    if (
      displayVisibility === VISIBILITY_USERS &&
      visibleUserIds?.length &&
      users?.length
    ) {
      const names = visibleUserIds
        .map((id) => users.find((u) => u.id === id)?.name)
        .filter(Boolean) as string[];
      if (!names.length) return label;
      return `${label}: ${names.join(', ')}`;
    }
    return label;
  }, [displayVisibility, label, visibleUserIds, users]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('inline-flex items-center', className)}>
          <Icon className="size-4 text-muted-foreground" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{tooltipContent}</TooltipContent>
    </Tooltip>
  );
}
