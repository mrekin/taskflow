export function isPublicReadonly(): boolean {
  return process.env.PUBLIC_READONLY === 'true';
}

export function getConfigError(): string | null {
  const demoMode = process.env.DEMO_MODE === 'true';
  const noAuthMode = process.env.NOAUTH_MODE === 'true';
  const publicReadonly = isPublicReadonly();
  const hasOidc = !!(process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET);

  if (publicReadonly) {
    if (noAuthMode) {
      return 'PUBLIC_READONLY and NOAUTH_MODE cannot be enabled simultaneously. Disable one of them.';
    }
    if (demoMode) {
      return 'PUBLIC_READONLY cannot be used with DEMO_MODE. Disable one of them.';
    }
  }

  if (demoMode) {
    if (noAuthMode) {
      return 'DEMO_MODE and NOAUTH_MODE cannot be enabled simultaneously. Disable one of them.';
    }
    if (hasOidc) {
      return 'DEMO_MODE cannot be used with OIDC authentication. Disable OIDC or DEMO_MODE.';
    }
  }

  return null;
}

export const DEMO_USER_EMAIL = 'demo@taskflow.app';
