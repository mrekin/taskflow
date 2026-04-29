'use client';

import { DEFAULT_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className="grid grid-cols-8 gap-2">
      {DEFAULT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className={cn(
            'flex size-8 items-center justify-center rounded-full transition-all hover:scale-110',
            value === c && 'ring-2 ring-primary ring-offset-2'
          )}
          style={{ backgroundColor: c }}
          onClick={() => onChange(c)}
        >
          {value === c && (
            <Check className="size-4 text-white drop-shadow-sm" />
          )}
        </button>
      ))}
    </div>
  );
}
