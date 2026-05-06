'use client';

import { useEffect, useState } from 'react';
import { Timer, AlertTriangle } from 'lucide-react';

type DemoConfig = {
  demoMode: boolean;
  demoResetAt: string | null;
  configError: string | null;
};

export function DemoBanner() {
  const [config, setConfig] = useState<DemoConfig | null>(null);
  const [remaining, setRemaining] = useState<string>('');
  const basePath = process.env.NEXT_BASE_PATH || '';

  useEffect(() => {
    fetch(`${basePath}/api/config`)
      .then(r => r.json())
      .then(data => setConfig(data))
      .catch(() => {});
  }, [basePath]);

  useEffect(() => {
    if (!config?.demoMode || !config?.demoResetAt || config?.configError) return;

    const resetTime = new Date(config.demoResetAt).getTime();

    const tick = () => {
      const diff = Math.max(0, resetTime - Date.now());
      if (diff === 0) {
        setRemaining('00:00');
        fetch(`${basePath}/api/config`)
          .then(r => r.json())
          .then(data => setConfig(data))
          .catch(() => {});
        return;
      }
      const totalSec = Math.floor(diff / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      setRemaining(`${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [config]);

  if (!config) return null;

  if (config.configError) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-destructive text-destructive-foreground px-4 py-2 text-center text-sm font-medium">
        <div className="flex items-center justify-center gap-2">
          <AlertTriangle className="size-4" />
          <span>Configuration Error: {config.configError}</span>
        </div>
      </div>
    );
  }

  if (!config.demoMode) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-amber-950 px-4 py-2 text-center text-sm font-medium">
      <div className="flex items-center justify-center gap-2">
        <Timer className="size-4" />
        <span>
          Demo mode &mdash; all data will be erased in <strong>{remaining || '...'}</strong>
        </span>
      </div>
    </div>
  );
}
