"use client";

import { SessionProvider } from "next-auth/react";

/**
 * AuthProvider wraps the app with NextAuth's SessionProvider.
 * Authentication is OPTIONAL - the app works in demo mode without sign-in.
 * The session is available if the user has authenticated (via credentials or OIDC),
 * but the UI is never blocked waiting for authentication.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchInterval={300} refetchOnWindowFocus={false}>
      {children}
    </SessionProvider>
  );
}
