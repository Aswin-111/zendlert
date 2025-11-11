// services/queue.service.js
import { Queue, Worker, QueueScheduler } from 'bullmq';

// Prefer a single REDIS_URL; fall back to host/port with Compose service name.
const REDIS_URL = process.env.REDIS_URL;

function buildConnection() {
  if (REDIS_URL) {
    const u = new URL(REDIS_URL); // e.g., redis://zendlert_redis:6379
    return {
      host: u.hostname || 'zendlert_redis',
      port: Number(u.port || 6379),
      ...(u.password ? { password: u.password } : {}),
    };
  }
  return {
    host: process.env.REDIS_HOST || 'zendlert_redis',
    port: Number(process.env.REDIS_PORT || 6379),
  };
}

const connection = buildConnection();

export const notificationQueue = new Queue('notificationQueue', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
    removeOnFail: 50,
  },
});

export function startNotificationWorker(processorFn) {
  // Ensure delayed/retried jobs are handled
  const scheduler = new QueueScheduler('notificationQueue', { connection });
  const worker = new Worker('notificationQueue', processorFn, { connection });

  worker.on('failed', (job, err) => {
    console.error(`notificationQueue job ${job?.id} failed:`, err?.message || err);
  });
  worker.on('completed', (job) => {
    console.log(`notificationQueue job ${job.id} completed`);
  });

  console.log(
    `🟢 BullMQ ready @ ${connection.host}:${connection.port} (notificationQueue)`
  );

  return { worker, scheduler };
}
