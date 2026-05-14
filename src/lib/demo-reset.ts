import { db } from '@/lib/db';
import { getConfigError, DEMO_USER_EMAIL } from '@/lib/config';
import { STORAGE_LOCAL_PATH_DEFAULT } from '@/lib/attachment-config';

const DEFAULT_RESET_MIN = 15;
const INITIAL_DELAY_MS = 30_000;

const globalForDemo = globalThis as typeof globalThis & {
  __demoNextResetAt?: Date | null;
};

export function getNextResetAt(): Date | null {
  return globalForDemo.__demoNextResetAt ?? null;
}

async function resetDatabase(): Promise<void> {
  console.log('[DemoReset] Resetting database...');

  const demoUser = await db.user.findUnique({ where: { email: DEMO_USER_EMAIL } });

  try {
    await db.$executeRaw`DELETE FROM ScheduledJob`;
    await db.$executeRaw`DELETE FROM WebhookDelivery`;
    await db.$executeRaw`DELETE FROM WebhookTrigger`;
    await db.$executeRaw`DELETE FROM Webhook`;
    await db.$executeRaw`DELETE FROM Comment`;
    await db.$executeRaw`DELETE FROM Tag`;
    await db.$executeRaw`DELETE FROM Attachment`;
    await db.$executeRaw`DELETE FROM FileBlob`;
    await db.$executeRaw`DELETE FROM Note`;
    await db.$executeRaw`DELETE FROM NoteFolder`;
    await db.$executeRaw`DELETE FROM Task`;
    await db.$executeRaw`DELETE FROM Project`;
    await db.$executeRaw`DELETE FROM Area`;

    // Clean up uploaded files
    try {
      const { rmSync } = await import('fs');
      const storagePath = process.env.STORAGE_LOCAL_PATH || STORAGE_LOCAL_PATH_DEFAULT;
      rmSync(storagePath, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }

    if (demoUser) {
      await db.$executeRaw`DELETE FROM User WHERE id != ${demoUser.id}`;

      // Reset custom statuses for demo user
      try {
        const meta = JSON.parse(demoUser.metadata || '{}');
        if (meta.customStatuses) {
          delete meta.customStatuses;
          await db.user.update({
            where: { id: demoUser.id },
            data: { metadata: JSON.stringify(meta) },
          });
        }
      } catch {
        // ignore metadata parse errors
      }
    }
  } catch (error) {
    console.error('[DemoReset] Error during reset:', error);
  }

  scheduleNextReset();
  console.log('[DemoReset] Database reset complete. Next reset at:', globalForDemo.__demoNextResetAt?.toISOString());
}

function scheduleNextReset(): void {
  const resetMin = Math.max(1, parseInt(process.env.DEMO_RESET_MIN || String(DEFAULT_RESET_MIN), 10));
  globalForDemo.__demoNextResetAt = new Date(Date.now() + resetMin * 60 * 1000);
}

export function startDemoReset(): NodeJS.Timeout | null {
  const demoMode = process.env.DEMO_MODE === 'true';
  if (!demoMode) return null;

  const configError = getConfigError();
  if (configError) {
    console.warn(`[DemoReset] Configuration conflict: ${configError}. Skipping demo reset to protect data.`);
    return null;
  }

  const resetMin = Math.max(1, parseInt(process.env.DEMO_RESET_MIN || String(DEFAULT_RESET_MIN), 10));

  scheduleNextReset();

  console.warn('');
  console.warn('╔══════════════════════════════════════════════════════════════╗');
  console.warn('║  ⚠  DEMO MODE ACTIVE — ALL DATA WILL BE ERASED EVERY       ║');
  console.warn(`║  ⚠  ${resetMin} MINUTES. Do NOT use this mode with real data!        ║`);
  console.warn('╚══════════════════════════════════════════════════════════════╝');
  console.warn('');

  setTimeout(() => {
    resetDatabase().catch((error) => {
      console.error('[DemoReset] Initial reset failed:', error);
    });
  }, INITIAL_DELAY_MS);

  const timer = setInterval(() => {
    resetDatabase().catch((error) => {
      console.error('[DemoReset] Reset failed:', error);
    });
  }, resetMin * 60 * 1000);

  return timer;
}
