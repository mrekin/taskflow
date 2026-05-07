'use client';

import { useState, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import {
  VISIBILITY_OWNER,
  VISIBILITY_USERS,
  VISIBILITY_SITE,
  VISIBILITY_WORLD,
  VISIBILITY_OPTIONS,
  DEFAULT_VISIBILITY,
} from '@/lib/constants';
import { Lock, Users, Globe, Loader2 } from 'lucide-react';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface VisibilitySelectProps {
  value: string | null;
  visibleUserIds: string[];
  onChange: (visibility: string | null, visibleUserIds: string[]) => void;
  ownerId: string;
  currentUserId: string | null;
  parentVisibility?: string | null;
  disabled?: boolean;
  compact?: boolean;
}

interface UserItem {
  id: string;
  name: string | null;
  image: string | null;
}

const INHERIT_VALUE = '__inherit__';

const VISIBILITY_LABEL_MAP: Record<string, string> = {
  [VISIBILITY_OWNER]: 'Owner only',
  [VISIBILITY_USERS]: 'Specific users',
  [VISIBILITY_SITE]: 'Authenticated users',
  [VISIBILITY_WORLD]: 'Everyone',
};

function getSelectValue(v: string | null): string {
  return v ?? INHERIT_VALUE;
}

function VisibilityIcon({ vis }: { vis: string | null }) {
  const resolved = vis ?? VISIBILITY_OWNER;
  switch (resolved) {
    case VISIBILITY_USERS:
      return <Users className="size-3.5 shrink-0" />;
    case VISIBILITY_SITE:
    case VISIBILITY_WORLD:
      return <Globe className="size-3.5 shrink-0" />;
    default:
      return <Lock className="size-3.5 shrink-0" />;
  }
}

export function VisibilitySelect({
  value,
  visibleUserIds,
  onChange,
  ownerId,
  currentUserId,
  parentVisibility,
  disabled,
  compact,
}: VisibilitySelectProps) {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  useEffect(() => {
    if (getSelectValue(value) !== VISIBILITY_USERS) return;
    if (users.length > 0) return;

    let cancelled = false;
    setUsersLoading(true);
    fetch('/api/users')
      .then((res) => res.json())
      .then((data: UserItem[]) => {
        if (!cancelled) {
          setUsers(data.filter((u) => u.id !== ownerId));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setUsersLoading(false);
      });
    return () => { cancelled = true; };
  }, [value, ownerId, users.length]);

  if (currentUserId !== ownerId) return null;

  const handleValueChange = (raw: string) => {
    if (raw === INHERIT_VALUE) {
      onChange(null, []);
      return;
    }
    if (raw === VISIBILITY_USERS) {
      onChange(raw, visibleUserIds);
      return;
    }
    onChange(raw, []);
  };

  const handleToggleUser = (userId: string, checked: boolean) => {
    if (checked) {
      onChange(VISIBILITY_USERS, [...visibleUserIds, userId]);
    } else {
      onChange(VISIBILITY_USERS, visibleUserIds.filter((id) => id !== userId));
    }
  };

  const inheritLabel = parentVisibility
    ? `Inherited (${VISIBILITY_LABEL_MAP[parentVisibility] ?? parentVisibility})`
    : `Inherited (${VISIBILITY_LABEL_MAP[DEFAULT_VISIBILITY] ?? 'Owner only'})`;

  const selectValue = getSelectValue(value);

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Select value={selectValue} onValueChange={handleValueChange} disabled={disabled}>
              <SelectTrigger className={cn(
                'h-7 px-2 gap-1.5 text-xs',
                'border-none shadow-none bg-transparent hover:bg-accent p-1',
              )}>
                <VisibilityIcon vis={selectValue === INHERIT_VALUE ? (parentVisibility ?? DEFAULT_VISIBILITY) : selectValue} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={INHERIT_VALUE}>Inherit</SelectItem>
                {VISIBILITY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </TooltipTrigger>
          <TooltipContent side="top">
            {selectValue === INHERIT_VALUE ? inheritLabel : (VISIBILITY_LABEL_MAP[selectValue] ?? selectValue)}
          </TooltipContent>
        </Tooltip>

        {value === VISIBILITY_USERS && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                disabled={disabled}
              >
                {visibleUserIds.length > 0 ? `${visibleUserIds.length} user${visibleUserIds.length > 1 ? 's' : ''}` : 'Pick users'}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
              {usersLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              ) : users.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 text-center">No users available</p>
              ) : (
                <div className="flex flex-col gap-1 max-h-[200px] overflow-y-auto">
                  {users.map((user) => (
                    <label
                      key={user.id}
                      className={cn(
                        'flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm cursor-pointer hover:bg-accent transition-colors',
                        disabled && 'pointer-events-none opacity-50'
                      )}
                    >
                      <Checkbox
                        checked={visibleUserIds.includes(user.id)}
                        onCheckedChange={(checked) =>
                          handleToggleUser(user.id, checked === true)
                        }
                        disabled={disabled}
                      />
                      <span className="truncate">{user.name || 'Unnamed user'}</span>
                    </label>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Select value={selectValue} onValueChange={handleValueChange} disabled={disabled}>
        <SelectTrigger className="w-full h-8 text-xs">
          <div className="flex items-center gap-1.5">
            <VisibilityIcon vis={selectValue === INHERIT_VALUE ? (parentVisibility ?? DEFAULT_VISIBILITY) : selectValue} />
            <SelectValue />
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={INHERIT_VALUE}>Inherit</SelectItem>
          {VISIBILITY_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {value === null && (
        <p className="text-[11px] text-muted-foreground">{inheritLabel}</p>
      )}

      {value === VISIBILITY_USERS && (
        <div className="rounded-md border p-1.5 max-h-[150px] overflow-y-auto">
          {usersLoading ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-[11px] text-muted-foreground py-2 text-center">No users available</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {users.map((user) => (
                <label
                  key={user.id}
                  className={cn(
                    'flex items-center gap-2 px-1.5 py-1 rounded-sm text-xs cursor-pointer hover:bg-accent transition-colors',
                    disabled && 'pointer-events-none opacity-50'
                  )}
                >
                  <Checkbox
                    checked={visibleUserIds.includes(user.id)}
                    onCheckedChange={(checked) =>
                      handleToggleUser(user.id, checked === true)
                    }
                    disabled={disabled}
                  />
                  <span className="truncate">{user.name || 'Unnamed user'}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
