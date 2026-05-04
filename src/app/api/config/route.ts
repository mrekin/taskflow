import { NextResponse } from 'next/server';

export async function GET() {
  try {
    return NextResponse.json({
      demoMode: process.env.DEMO_MODE === 'true',
      hasOidc: !!(process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
