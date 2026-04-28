import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * Get the current authenticated user's ID from the session.
 * Returns null if the user is not authenticated.
 */
export async function getCurrentUserId(): Promise<string | null> {
  try {
    const session = await getServerSession(authOptions);
    return (session?.user as { id?: string })?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Require authentication. Returns the user ID or an error response.
 * Use in API route handlers to enforce auth.
 */
export async function requireAuth(): Promise<{ userId: string } | { error: NextResponse }> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return {
      error: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      ),
    };
  }
  return { userId };
}

/**
 * Check if a user can access a resource owned by a specific owner.
 * Currently only the owner can access their own resources.
 */
export function canAccess(userId: string, resourceOwnerId: string): boolean {
  return userId === resourceOwnerId;
}
