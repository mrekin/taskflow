"use client";

import { SessionProvider, useSession, signIn } from "next-auth/react";
import { useEffect, useState, useCallback, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Image from "next/image";

function AutoLogin({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const [retryCount, setRetryCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const MAX_RETRIES = 3;

  // Derived state - no setState in effect needed
  const showFallback = status === "unauthenticated" && retryCount >= MAX_RETRIES;

  const handleDemoLogin = useCallback(() => {
    setError(null);
    setRetryCount(0);
    signIn("credentials", {
      email: "demo@taskflow.app",
      redirect: false,
    }).then((result) => {
      if (result?.error) {
        setError(result.error);
        setRetryCount((c) => c + 1);
      }
    }).catch(() => {
      setError("Connection error");
      setRetryCount((c) => c + 1);
    });
  }, []);

  useEffect(() => {
    if (status === "unauthenticated" && retryCount < MAX_RETRIES) {
      const timer = setTimeout(() => {
        signIn("credentials", {
          email: "demo@taskflow.app",
          redirect: false,
        }).then((result) => {
          if (result?.error) {
            setError(result.error);
            setRetryCount((c) => c + 1);
          }
        }).catch(() => {
          setError("Connection error");
          setRetryCount((c) => c + 1);
        });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [status, retryCount]);

  // Show loading while session is loading or while auto-login is in progress
  if (status !== "authenticated") {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2">
            <Image
              src="/logo.png"
              alt="TaskFlow"
              width={40}
              height={40}
              className="h-10 w-10 rounded-xl object-cover"
            />
            <h1 className="text-3xl font-bold">TaskFlow</h1>
          </div>

          {status === "loading" && !showFallback && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading session...
            </div>
          )}

          {status === "unauthenticated" && !showFallback && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Signing in...
            </div>
          )}

          {showFallback && (
            <div className="space-y-3">
              {error && (
                <p className="text-sm text-destructive">
                  Login failed: {error}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Auto-login failed. Click below to enter demo mode.
              </p>
              <Button onClick={handleDemoLogin} className="w-full">
                Enter Demo Mode
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AutoLogin>{children}</AutoLogin>
    </SessionProvider>
  );
}
