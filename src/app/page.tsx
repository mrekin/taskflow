'use client';

import { useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Home from '@/components/home-content';

export default function Page() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const basePath = process.env.NEXT_BASE_PATH || '';

  useEffect(() => {
    if (status === 'loading') return;
    if (session) return;

    fetch(`${basePath}/api/config`)
      .then(r => r.json())
      .then((config: { demoMode: boolean; hasOidc: boolean }) => {
        if (config.demoMode) {
          signIn('credentials', { email: 'demo@taskflow.app', redirect: false });
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
