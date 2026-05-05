'use client';

import { useEffect, useState } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Home from '@/components/home-content';

const DEMO_EMAIL = 'demo@taskflow.app';

export default function Page() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const basePath = process.env.NEXT_BASE_PATH || '';
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'loading') return;

    fetch(`${basePath}/api/config`)
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => null);
          throw new Error(data?.error || `Server error (${r.status})`);
        }
        return r.json();
      })
      .then((config: { noAuthMode: boolean; hasOidc: boolean; demoMode: boolean; configError: string | null; demoUserEmail?: string }) => {
        if (config.configError) {
          setInitError(config.configError);
          return;
        }

        const demoEmail = config.demoUserEmail || DEMO_EMAIL;
        const isDemoSession = session?.user?.email === demoEmail;

        if (isDemoSession && !config.noAuthMode && !config.demoMode) {
          signOut({ redirect: false });
          return;
        }

        if (session) return;

        if (config.noAuthMode) {
          signIn('credentials', { email: DEMO_EMAIL, redirect: false });
        } else if (config.demoMode) {
          signIn('credentials', { email: demoEmail, redirect: false });
        } else {
          router.replace('/login');
        }
      })
      .catch((err) => {
        setInitError(err instanceof Error ? err.message : String(err));
      });
  }, [session, status, router, basePath]);

  if (initError) {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-8">
        <div className="max-w-md text-center space-y-4">
          <Image src={`${basePath}/logo.png`} alt="TaskFlow" width={48} height={48} className="h-12 w-12 rounded-lg object-cover mx-auto" unoptimized />
          <h1 className="text-2xl font-bold text-destructive">Server Error</h1>
          <p className="text-sm text-muted-foreground">Unable to connect to the server. Please check your configuration.</p>
          <pre className="text-xs text-left bg-muted p-3 rounded-lg overflow-auto max-h-32 font-mono">{initError}</pre>
          <button
            onClick={() => { setInitError(null); window.location.reload(); }}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (status === 'loading' || !session) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-2">
          <Image src={`${basePath}/logo.png`} alt="TaskFlow" width={32} height={32} className="h-8 w-8 rounded-lg object-cover animate-pulse" unoptimized />
          <h1 className="text-3xl font-bold">TaskFlow</h1>
        </div>
      </div>
    );
  }

  return <Home />;
}
