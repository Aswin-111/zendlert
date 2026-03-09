// services/queue.service.js
import { Queue, Worker } from 'bullmq';
import logger from "../utils/logger.js";

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
let notificationWorkerState = null;

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
  if (notificationWorkerState) {
    logger.info("[notificationQueue] Worker already initialized, reusing existing instance");
    return notificationWorkerState;
  }

  const worker = new Worker('notificationQueue', processorFn, { connection });

  worker.on('failed', (job, err) => {
    logger.error("notificationQueue job failed", {
      error: err,
      meta: { job_id: job?.id ?? null },
    });
  });
  worker.on('completed', (job) => {
    logger.info("notificationQueue job completed", {
      meta: { job_id: job?.id ?? null },
    });
  });

  logger.info(
    `[notificationQueue] BullMQ ready @ ${connection.host}:${connection.port}`
  );

  notificationWorkerState = { worker };
  return notificationWorkerState;
}
