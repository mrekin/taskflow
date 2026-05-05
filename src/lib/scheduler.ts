import { db } from '@/lib/db';
import { fireWebhookEvent, buildTaskContext, resolveTaskAreaId } from '@/lib/webhook-engine';

const MAX_PAYLOAD_SIZE = 4096;
const BATCH_SIZE = 100;
const DEFAULT_INTERVAL_MIN = 1;
const INITIAL_DELAY_MS = 30_000;

type JobHandler = (job: {
  id: string;
  entityId: string;
  entityType: string;
  ownerId: string;
  payload: Record<string, unknown>;
}) => Promise<void>;

const handlers: Record<string, JobHandler> = {
  async due_date_reached(job) {
    const { entityId, ownerId, payload } = job;
    const title = typeof payload.title === 'string' ? payload.title : '';
    const shortIdNum = typeof payload.shortIdNum === 'number' ? payload.shortIdNum : 0;
    const projectId = typeof payload.projectId === 'string' ? payload.projectId : null;

    let areaId: string | null = null;
    try {
      areaId = await resolveTaskAreaId(projectId);
    } catch {
      // area resolution failed, continue without it
    }

    await fireWebhookEvent(
      buildTaskContext(
        { id: entityId, title, shortIdNum, projectId, ownerId },
        'task.due_date_reached',
        undefined,
        areaId,
      ),
    );
  },
};

async function processScheduledJobs(): Promise<void> {
  let jobs: { id: string; type: string; entityId: string; entityType: string; ownerId: string; payload: string }[] = [];

  try {
    jobs = await db.scheduledJob.findMany({
      where: { fireAt: { lte: new Date() } },
      take: BATCH_SIZE,
    });
  } catch (error) {
    console.error('[Scheduler] DB query failed:', error);
    return;
  }

  if (jobs.length === 0) return;

  let processed = 0;
  let errors = 0;

  for (const job of jobs) {
    try {
      const handler = handlers[job.type];

      if (!handler) {
        console.warn(`[Scheduler] Unknown job type: "${job.type}", deleting job ${job.id}`);
        await db.scheduledJob.delete({ where: { id: job.id } }).catch(() => {});
        errors++;
        continue;
      }

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(job.payload || '{}');
      } catch {
        console.warn(`[Scheduler] Invalid payload JSON for job ${job.id}, deleting`);
        await db.scheduledJob.delete({ where: { id: job.id } }).catch(() => {});
        errors++;
        continue;
      }

      if (job.entityType === 'task') {
        const task = await db.task.findUnique({
          where: { id: job.entityId },
          select: { id: true, status: true },
        });

        if (!task) {
          await db.scheduledJob.delete({ where: { id: job.id } }).catch(() => {});
          processed++;
          continue;
        }

        if (task.status === 'done' || task.status === 'cancelled') {
          await db.scheduledJob.delete({ where: { id: job.id } }).catch(() => {});
          processed++;
          continue;
        }
      }

      await handler({
        id: job.id,
        entityId: job.entityId,
        entityType: job.entityType,
        ownerId: job.ownerId,
        payload,
      });

      await db.scheduledJob.delete({ where: { id: job.id } }).catch(() => {});
      processed++;
    } catch (error) {
      console.error(`[Scheduler] Error processing job ${job.id} (type: ${job.type}):`, error);
      await db.scheduledJob.delete({ where: { id: job.id } }).catch(() => {});
      errors++;
    }
  }

  console.log(`[Scheduler] Processed ${processed} jobs (errors: ${errors})`);
}

export async function startScheduler(): Promise<NodeJS.Timeout | null> {
  const intervalMin = Math.max(1, parseInt(process.env.SCHEDULER_INTERVAL_MIN || String(DEFAULT_INTERVAL_MIN), 10));
  const intervalMs = intervalMin * 60 * 1000;

  let pendingCount = 0;
  try {
    pendingCount = await db.scheduledJob.count();
  } catch {
    pendingCount = -1;
  }
  console.log(`[Scheduler] Started. Interval: ${intervalMin} min. Pending jobs: ${pendingCount >= 0 ? pendingCount : 'unknown'}`);

  setTimeout(() => {
    processScheduledJobs().catch((error) => {
      console.error('[Scheduler] Initial run failed:', error);
    });
  }, INITIAL_DELAY_MS);

  const timer = setInterval(() => {
    try {
      processScheduledJobs().catch((error) => {
        console.error('[Scheduler] Tick failed:', error);
      });
    } catch (error) {
      console.error('[Scheduler] Tick wrapper error:', error);
    }
  }, intervalMs);

  return timer;
}

export interface CreateScheduledJobParams {
  type: string;
  fireAt: Date;
  entityId: string;
  entityType?: string;
  ownerId: string;
  payload?: Record<string, unknown>;
}

export async function createScheduledJob(params: CreateScheduledJobParams): Promise<void> {
  const payloadStr = JSON.stringify(params.payload || {});
  const safePayload = payloadStr.length > MAX_PAYLOAD_SIZE ? JSON.stringify({}) : payloadStr;

  await db.scheduledJob.create({
    data: {
      type: params.type,
      fireAt: params.fireAt,
      entityId: params.entityId,
      entityType: params.entityType || 'task',
      ownerId: params.ownerId,
      payload: safePayload,
    },
  });
}

export async function deleteScheduledJobsForEntity(entityId: string, type?: string): Promise<void> {
  const where: { entityId: string; type?: string } = { entityId };
  if (type) where.type = type;

  await db.scheduledJob.deleteMany({ where });
}
