'use client';

import { useState, useEffect } from 'react';

/**
 * Like useState, but persists the value in localStorage under `key`.
 * Reads once in the lazy useState initializer (SSR / private-mode safe),
 * writes back in an effect on every change. Values are stored as JSON.
 * `validate` guards against stale/corrupted entries — return false to fall back to `initial`.
 */
export function useLocalStorageState<T>(
  key: string,
  initial: T,
  validate: (value: unknown) => value is T
): readonly [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return initial;
      const parsed: unknown = JSON.parse(raw);
      return validate(parsed) ? parsed : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value]);

  return [value, setValue] as const;
}
