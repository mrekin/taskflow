'use client';

import { useAppStore } from '@/store/app-store';
import {
  RELEASE_ACTIVE_STATUSES,
  RELEASE_STATUS_COLORS,
} from '@/lib/constants';
import { formatShortId } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const NO_RELEASE = '__none__';

interface ReleasePickerProps {
  projectId: string | null;
  value: string | null;
  onChange: (releaseId: string | null) => void;
  disabled?: boolean;
}

export function ReleasePicker({ projectId, value, onChange, disabled }: ReleasePickerProps) {
  const { releases } = useAppStore();

  // Active releases of the project, plus the currently linked (possibly closed) one
  // so it stays visible/unlinkable.
  const options = releases.filter(
    (r) =>
      r.projectId === projectId &&
      (RELEASE_ACTIVE_STATUSES.includes(r.status) || r.id === value)
  );

  const isDisabled = disabled || !projectId;

  return (
    <Select
      value={value ?? NO_RELEASE}
      onValueChange={(v) => onChange(v === NO_RELEASE ? null : v)}
      disabled={isDisabled}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="No release" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_RELEASE}>No release</SelectItem>
        {options.map((r) => {
          const color = RELEASE_STATUS_COLORS[r.status] ?? RELEASE_STATUS_COLORS.planned;
          return (
            <SelectItem key={r.id} value={r.id}>
              <span className="flex items-center gap-1.5 min-w-0">
                <span
                  className="size-2 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="truncate">
                  {formatShortId('release', r.shortIdNum)} — {r.title}
                  {r.version ? ` (v${r.version})` : ''}
                </span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
