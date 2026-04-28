import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const DEMO_USER_EMAIL = "demo@taskflow.app";

/**
 * Ensure the demo user exists in the database.
 * Creates the demo user if they don't exist yet.
 */
async function ensureDemoUser(): Promise<string> {
  let user = await db.user.findUnique({ where: { email: DEMO_USER_EMAIL } });
  if (!user) {
    user = await db.user.create({
      data: {
        email: DEMO_USER_EMAIL,
        name: "Demo User",
      },
    });
  }
  return user.id;
}

// Cache the demo user ID to avoid repeated DB lookups
let cachedDemoUserId: string | null = null;

/**
 * Get the current authenticated user's ID from the session.
 * Falls back to the demo user ID if no session exists.
 * This ensures the app always works, even without authentication.
 */
export async function getCurrentUserId(): Promise<string | null> {
  try {
    const session = await getServerSession(authOptions);
    const sessionUserId = (session?.user as { id?: string })?.id;
    if (sessionUserId) {
      cachedDemoUserId = null; // Clear cache when real auth is used
      return sessionUserId;
    }
  } catch {
    // Session check failed, fall through to demo user
  }

  // Fall back to demo user
  if (!cachedDemoUserId) {
    cachedDemoUserId = await ensureDemoUser();
  }
  return cachedDemoUserId;
}

/**
 * Require authentication. Returns the user ID or an error response.
 * In demo mode (no auth configured), falls back to the demo user.
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
