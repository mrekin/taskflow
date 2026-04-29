'use client';

import { useSession, signIn } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { LogIn, AlertTriangle } from 'lucide-react';

type Config = { demoMode: boolean; hasOidc: boolean };

export default function LoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const basePath = process.env.NEXT_BASE_PATH || '';
  const [config, setConfig] = useState<Config | null>(null);

  useEffect(() => {
    fetch(`${basePath}/api/config`)
      .then(r => r.json())
      .then(setConfig)
      .catch(() => setConfig({ demoMode: false, hasOidc: false }));
  }, [basePath]);

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/');
    }
  }, [status, router, basePath]);

  if (status === 'loading' || !config) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-2">
          <Image
            src={`${basePath}/logo.png`}
            alt="TaskFlow"
            width={32}
            height={32}
            className="h-8 w-8 rounded-lg object-cover animate-pulse"
            unoptimized
          />
          <h1 className="text-3xl font-bold">TaskFlow</h1>
        </div>
      </div>
    );
  }

  if (session) return null;

  const hasAnyAuth = config.demoMode || config.hasOidc;

  return (
    <div className="flex h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-4 pb-2">
          <div className="flex justify-center">
            <Image
              src={`${basePath}/logo.png`}
              alt="TaskFlow"
              width={48}
              height={48}
              className="h-12 w-12 rounded-xl object-cover"
              unoptimized
            />
          </div>
          <div>
            <h1 className="text-2xl font-bold">TaskFlow</h1>
            {hasAnyAuth ? (
              <p className="text-sm text-muted-foreground mt-1">Sign in to continue</p>
            ) : (
              <p className="text-sm text-destructive mt-1">Authentication not configured</p>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {config.hasOidc && (
            <Button className="w-full" onClick={() => signIn('oidc')}>
              <LogIn className="size-4 mr-2" />
              Sign in with SSO
            </Button>
          )}
          {config.demoMode && (
            <Button
              variant={config.hasOidc ? 'outline' : 'default'}
              className="w-full"
              onClick={() => signIn('credentials', { email: 'demo@taskflow.app' })}
            >
              Try Demo
            </Button>
          )}
          {!hasAnyAuth && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="size-5 text-destructive shrink-0 mt-0.5" />
                <div className="space-y-2 text-sm">
                  <p className="font-medium">Setup required</p>
                  <p className="text-muted-foreground">
                    Configure one of the following to use TaskFlow:
                  </p>
                </div>
              </div>
              <div className="text-xs font-mono bg-muted/50 rounded p-3 space-y-1.5">
                <p className="text-muted-foreground"># Option 1: Enable demo mode</p>
                <p>DEMO_MODE=true</p>
                <p className="text-muted-foreground pt-1"># Option 2: Configure OIDC (e.g. Authentik)</p>
                <p>OIDC_ISSUER=https://auth.example.com</p>
                <p>OIDC_CLIENT_ID=your-client-id</p>
                <p>OIDC_CLIENT_SECRET=your-secret</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
