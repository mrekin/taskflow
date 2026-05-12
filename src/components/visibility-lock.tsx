'use client';

import { useState, useEffect, useMemo } from 'react';
import { Lock, Users, Globe, Loader2 } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api-utils';
import {
  VISIBILITY_OWNER,
  VISIBILITY_USERS,
  VISIBILITY_SITE,
  VISIBILITY_WORLD,
  VISIBILITY_OPTIONS,
  DEFAULT_VISIBILITY,
} from '@/lib/constants';

type UserItem = { id: string; name: string | null };
type PopoverUser = { id: string; name: string | null; image: string | null };

interface VisibilityLockProps {
  value: string | null;
  visibleUserIds: string[];
  onChange: (visibility: string | null, visibleUserIds: string[]) => void;
  ownerId: string;
  currentUserId: string | null;
  parentVisibility?: string | null;
  disabled?: boolean;
  size?: 'sm' | 'md';
  users?: UserItem[];
}

const VISIBILITY_LABEL_MAP: Record<string, string> = {
  [VISIBILITY_OWNER]: 'Owner only',
  [VISIBILITY_USERS]: 'Specific users',
  [VISIBILITY_SITE]: 'Authenticated users',
  [VISIBILITY_WORLD]: 'Everyone',
};

const VISIBILITY_DESC_MAP: Record<string, string> = {
  [VISIBILITY_OWNER]: 'Only you',
  [VISIBILITY_USERS]: 'You + selected users',
  [VISIBILITY_SITE]: 'All logged-in users',
  [VISIBILITY_WORLD]: 'Anyone, even without login',
};

function getIcon(vis: string | null) {
  switch (vis ?? VISIBILITY_OWNER) {
    case VISIBILITY_USERS: return Users;
    case VISIBILITY_SITE:
    case VISIBILITY_WORLD: return Globe;
    default: return Lock;
  }
}

const ALL_OPTIONS = [
  { value: null, label: 'Inherit', desc: 'From parent' },
  ...VISIBILITY_OPTIONS.map((o) => ({ value: o.value, label: o.label, desc: VISIBILITY_DESC_MAP[o.value] })),
];

export function VisibilityLock({
  value,
  visibleUserIds,
  onChange,
  ownerId,
  currentUserId,
  parentVisibility,
  disabled,
  size = 'md',
  users,
}: VisibilityLockProps) {
  const [open, setOpen] = useState(false);
  const [popoverUsers, setPopoverUsers] = useState<PopoverUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const effectiveVis = value ?? parentVisibility ?? DEFAULT_VISIBILITY;
  const Icon = getIcon(effectiveVis);
  const iconSize = size === 'sm' ? 'size-3.5' : 'size-4';

  const tooltipContent = useMemo(() => {
    const label = VISIBILITY_LABEL_MAP[effectiveVis] ?? effectiveVis;
    if (effectiveVis === VISIBILITY_USERS && visibleUserIds.length && users?.length) {
      const names = visibleUserIds
        .map((id) => users.find((u) => u.id === id)?.name)
        .filter(Boolean) as string[];
      if (names.length) return `${label}: ${names.join(', ')}`;
    }
    return label;
  }, [effectiveVis, visibleUserIds, users]);

  useEffect(() => {
    if (!open || value !== VISIBILITY_USERS) return;
    if (popoverUsers.length > 0) return;
    let cancelled = false;
    setUsersLoading(true);
    fetch(api('/api/users'))
      .then((r) => r.json())
      .then((data: PopoverUser[]) => { if (!cancelled) setPopoverUsers(data.filter((u) => u.id !== ownerId)); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setUsersLoading(false); });
    return () => { cancelled = true; };
  }, [open, value, ownerId, popoverUsers.length]);

  if (currentUserId !== ownerId) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center">
            <Icon className={cn(iconSize, 'text-muted-foreground')} />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{tooltipContent}</TooltipContent>
      </Tooltip>
    );
  }

  const readOnly = disabled ?? false;

  const trigger = (
    <span className={cn(
      'inline-flex items-center rounded-sm transition-colors',
      !readOnly && 'cursor-pointer hover:bg-accent',
      readOnly && 'cursor-default',
    )}>
      <Icon className={cn(iconSize, 'text-muted-foreground')} />
    </span>
  );

  if (readOnly) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent side="top">{tooltipContent}</TooltipContent>
      </Tooltip>
    );
  }

  const inheritLabel = parentVisibility
    ? `Inherited (${VISIBILITY_LABEL_MAP[parentVisibility] ?? parentVisibility})`
    : `Inherited (${VISIBILITY_LABEL_MAP[DEFAULT_VISIBILITY]})`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="start" side="bottom">
        <div className="flex flex-col gap-0.5">
          {ALL_OPTIONS.map((opt) => {
            const isSelected = value === opt.value;
            return (
              <button
                key={opt.value ?? '__inherit__'}
                type="button"
                className={cn(
                  'flex flex-col items-start gap-0.5 rounded-sm px-2.5 py-1.5 text-left text-sm transition-colors w-full',
                  isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
                )}
                onClick={() => {
                  onChange(opt.value, opt.value === VISIBILITY_USERS ? visibleUserIds : []);
                }}
              >
                <span className="font-medium text-xs">{opt.label}</span>
                <span className="text-[11px] text-muted-foreground leading-tight">
                  {opt.value === null ? inheritLabel : opt.desc}
                </span>
              </button>
            );
          })}
        </div>

        {value === VISIBILITY_USERS && (
          <div className="mt-1 pt-1 border-t">
            <p className="px-2.5 py-1 text-[11px] font-medium text-muted-foreground">Users</p>
            {usersLoading ? (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
              </div>
            ) : popoverUsers.length === 0 ? (
              <p className="text-[11px] text-muted-foreground py-2 px-2.5 text-center">No users</p>
            ) : (
              <div className="max-h-[160px] overflow-y-auto">
                {popoverUsers.map((user) => (
                  <label
                    key={user.id}
                    className="flex items-center gap-2 px-2.5 py-1 rounded-sm text-xs cursor-pointer hover:bg-accent transition-colors"
                  >
                    <Checkbox
                      checked={visibleUserIds.includes(user.id)}
                      onCheckedChange={(checked) => {
                        if (checked) onChange(VISIBILITY_USERS, [...visibleUserIds, user.id]);
                        else onChange(VISIBILITY_USERS, visibleUserIds.filter((id) => id !== user.id));
                      }}
                    />
                    <span className="truncate">{user.name || 'Unnamed'}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
