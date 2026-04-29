import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({
    demoMode: process.env.DEMO_MODE === 'true',
    hasOidc: !!(process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET),
  });
}
