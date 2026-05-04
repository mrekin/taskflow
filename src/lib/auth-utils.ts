import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const DEMO_USER_EMAIL = "demo@taskflow.app";

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

let cachedDemoUserId: string | null = null;

export async function getCurrentUserId(): Promise<string | null> {
  try {
    const session = await getServerSession(authOptions);
    const sessionUserId = (session?.user as { id?: string })?.id;
    if (sessionUserId) {
      return sessionUserId;
    }
  } catch {
    // Session check failed
  }

  if (process.env.DEMO_MODE === 'true') {
    if (!cachedDemoUserId) {
      cachedDemoUserId = await ensureDemoUser();
    }
    return cachedDemoUserId;
  }

  return null;
}

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

export function canAccess(userId: string, resourceOwnerId: string): boolean {
  return userId === resourceOwnerId;
}
