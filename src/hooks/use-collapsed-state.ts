'use client';

import { useState, useCallback } from 'react';

export function useCollapsedState(key: string) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(key, next ? '1' : '0');
      } catch {}
      return next;
    });
  }, [key]);

  return [collapsed, toggle] as const;
}
