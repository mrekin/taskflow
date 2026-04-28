"use client";

import { SessionProvider } from "next-auth/react";

const basePath = process.env.NEXT_BASE_PATH || '';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider basePath={`${basePath}/api/auth`} refetchInterval={300} refetchOnWindowFocus={false}>
      {children}
    </SessionProvider>
  );
}
