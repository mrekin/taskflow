'use client';

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store/app-store';
import { api } from '@/lib/api-utils';

/** Base poll interval; jittered ±20% per cycle to avoid synchronized request waves. */
const SYNC_INTERVAL_MS = 30_000;
const JITTER = 0.2;
/** Safety net: rebuild everything from full fetches this often. */
const FULL_REFETCH_EVERY_MS = 15 * 60_000;
const MAX_BACKOFF_MS = 5 * 60_000;
/** Retry cadence while the last sync ended in 401/403. */
const PAUSED_RETRY_MS = 60_000;

/**
 * Drives the external-change auto-refresh: polls /api/sync/changes on a jittered
 * interval while the tab is visible, polls immediately when the tab becomes visible
 * again, backs off on errors, and full-refetches around DEMO_MODE database resets.
 * Must be gated on the initial data load (pass `enabled = initialLoadDone`).
 */
export function useSyncPoll(enabled: boolean): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const errorsRef = useRef(0);
  const lastFullRefetchRef = useRef(0);
  const demoConfigRef = useRef<{ demoMode: boolean; demoResetAt: string | null }>({ demoMode: false, demoResetAt: null });

  useEffect(() => {
    if (!enabled) return;

    const basePath = process.env.NEXT_BASE_PATH || '';
    let disposed = false;

    const loadDemoConfig = async () => {
      try {
        const res = await fetch(api('/api/config'));
        if (res.ok) {
          const data = await res.json();
          demoConfigRef.current = { demoMode: !!data.demoMode, demoResetAt: data.demoResetAt ?? null };
        }
      } catch {
        // non-critical
      }
    };

    const schedule = (delayMs: number) => {
      if (disposed) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(tick, delayMs);
    };

    const tick = async () => {
      if (disposed) return;
      const store = useAppStore.getState();

      // DEMO_MODE wipes the database on a timer — rebuild the client around each reset
      const { demoMode, demoResetAt } = demoConfigRef.current;
      if (demoMode && demoResetAt && Date.now() >= new Date(demoResetAt).getTime()) {
        lastFullRefetchRef.current = Date.now();
        await store.forceFullRefetch();
        void loadDemoConfig();
      } else if (!document.hidden && !inFlightRef.current) {
        inFlightRef.current = true;
        try {
          await useAppStore.getState().syncChanges();
          errorsRef.current = 0;
        } catch {
          errorsRef.current += 1;
        } finally {
          inFlightRef.current = false;
        }
      }

      if (Date.now() - lastFullRefetchRef.current >= FULL_REFETCH_EVERY_MS) {
        lastFullRefetchRef.current = Date.now();
        void useAppStore.getState().forceFullRefetch();
      }

      // A paused sync (401/403, e.g. demo reset in flight) retries at a slower cadence
      // and unpauses itself on the first successful syncChanges.
      const paused = useAppStore.getState().syncPaused;
      const backoff = errorsRef.current > 0
        ? Math.min(MAX_BACKOFF_MS, SYNC_INTERVAL_MS * 2 ** errorsRef.current)
        : 0;
      const base = paused ? PAUSED_RETRY_MS : SYNC_INTERVAL_MS + backoff;
      const jitter = 1 + JITTER * (2 * Math.random() - 1);
      schedule(base * jitter);
    };

    const onVisibilityChange = () => {
      if (document.hidden || disposed) return;
      // Catch up immediately when the tab comes back — unless we just synced
      const last = useAppStore.getState().lastSyncedAt;
      if (last && Date.now() - new Date(last).getTime() < 3_000) return;
      void tick();
    };

    void loadDemoConfig();
    lastFullRefetchRef.current = Date.now();
    schedule(SYNC_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      disposed = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled]);
}
