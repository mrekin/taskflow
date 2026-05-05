import { NextResponse } from 'next/server';
import { getConfigError, DEMO_USER_EMAIL } from '@/lib/config';

export async function GET() {
  try {
    const configError = getConfigError();

    if (configError) {
      return NextResponse.json({
        noAuthMode: false,
        hasOidc: false,
        demoMode: false,
        demoResetAt: null,
        configError,
      });
    }

    const demoMode = process.env.DEMO_MODE === 'true';
    let demoResetAt: string | null = null;

    if (demoMode) {
      const { getNextResetAt } = await import('@/lib/demo-reset');
      const nextReset = getNextResetAt();
      if (nextReset) {
        demoResetAt = nextReset.toISOString();
      } else {
        const resetMin = Math.max(1, parseInt(process.env.DEMO_RESET_MIN || '15', 10));
        demoResetAt = new Date(Date.now() + resetMin * 60 * 1000).toISOString();
      }
    }

    return NextResponse.json({
      noAuthMode: process.env.NOAUTH_MODE === 'true',
      hasOidc: !!(process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET),
      demoMode,
      demoResetAt,
      demoUserEmail: DEMO_USER_EMAIL,
      configError: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
