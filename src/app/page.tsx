'use client';

import { useEffect } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Home from '@/components/home-content';

const DEMO_EMAIL = 'demo@taskflow.app';

export default function Page() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const basePath = process.env.NEXT_BASE_PATH || '';

  useEffect(() => {
    if (status === 'loading') return;

    fetch(`${basePath}/api/config`)
      .then(r => r.json())
      .then((config: { demoMode: boolean; hasOidc: boolean }) => {
        const isDemoSession = session?.user?.email === DEMO_EMAIL;

        // Demo session but demo mode turned off — invalidate
        if (isDemoSession && !config.demoMode) {
          signOut({ redirect: false });
          return;
        }

        // Already authenticated — nothing to do
        if (session) return;

        // Not authenticated
        if (config.demoMode) {
          signIn('credentials', { email: DEMO_EMAIL, redirect: false });
        } else {
          router.replace('/login');
        }
      })
      .catch(() => {
        router.replace('/login');
      });
  }, [session, status, router, basePath]);

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
