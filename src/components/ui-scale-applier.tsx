'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/store/app-store';

/**
 * Applies the per-user UI scale by setting `font-size` on the root <html> element.
 * Because the app is rem-based (Tailwind text/spacing, lucide `size-*` icons, `--radius`),
 * scaling the root font-size cascades to text, icons, paddings and border-radii.
 * At 100% the inline style is removed so the browser default applies.
 */
export function UiScaleApplier() {
  const uiScale = useAppStore((s) => s.userPreferences.uiScale);

  useEffect(() => {
    const el = document.documentElement;
    el.style.fontSize = uiScale && uiScale !== 100 ? `${uiScale}%` : '';
  }, [uiScale]);

  return null;
}
