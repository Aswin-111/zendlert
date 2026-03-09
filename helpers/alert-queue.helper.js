import { AlertStatus } from "@prisma/client";
import { Queue, Worker } from "bullmq";
import { REDIS_URL, bullConnection } from "../config/redis-connection.js";
import logger from "../utils/logger.js";
import prisma from "../utils/prisma.js";
import { utcNow } from "../utils/datetime.js";

const redisConnection = bullConnection();

export const notificationQueue = new Queue("notificationQueue", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: true,
    removeOnFail: 50,
  },
});

logger.info(
  `[alerts/queue] BullMQ using Redis @ ${redisConnection.host}:${redisConnection.port} (REDIS_URL=${REDIS_URL})`,
);

const sendSmsBatch = async (recipients) => {
  logger.info(
    `[SMS WORKER] Placeholder: Simulating sending of ${recipients.length} SMS messages.`,
  );
};

export const startAlertNotificationWorker = () => {
  logger.info("[alerts/queue] Initializing Notification Worker...");

  const worker = new Worker(
    "notificationQueue",
    async (job) => {
      const { alert_id, send_sms } = job.data;
      logger.info(`[WORKER] Processing job ${job.id} for alert ${alert_id}`);

      const now = utcNow();

      try {
        const alert = await prisma.alerts.findUnique({
          where: { id: alert_id },
          include: { Alert_Areas: { select: { area_id: true } } },
        });

        if (!alert) throw new Error(`Alert ${alert_id} not found.`);

        if (alert.status === AlertStatus.scheduled) {
          await prisma.alerts.update({
            where: { id: alert_id },
            data: {
              status: AlertStatus.active,
              start_time: alert.start_time ?? alert.scheduled_time ?? now,
            },
          });
          logger.info(`[WORKER] Alert ${alert_id} activated from scheduled.`);
        } else if (alert.status === AlertStatus.active) {
          if (!alert.start_time) {
            await prisma.alerts.update({
              where: { id: alert_id },
              data: { start_time: now },
            });
          }
        } else {
          logger.warn(
            `[WORKER] Alert ${alert_id} status=${alert.status}. Skipping dispatch.`,
          );
          return;
        }

        const finalAreaIdsArray = (alert.Alert_Areas || []).map((a) => a.area_id);
        if (finalAreaIdsArray.length === 0) {
          logger.info(`[WORKER] Alert ${alert_id} has no target areas. Done.`);
          return;
        }

        const recipients = await prisma.users.findMany({
          where: {
            organization_id: alert.organization_id,
            is_active: true,
            send_emergency_notification: true,
            area_id: { in: finalAreaIdsArray },
          },
          select: { user_id: true, fcm_token: true, phone_number: true },
        });

        if (recipients.length === 0) {
          logger.info(`[WORKER] No recipients for alert ${alert_id}. Job complete.`);
          return;
        }

        await prisma.notification_Recipients.createMany({
          data: recipients.map((user) => ({
            alert_id,
            user_id: user.user_id,
            channel: "in_app",
          })),
          skipDuplicates: true,
        });

        const recipientsWithFcmTokens = recipients.filter((recipient) => !!recipient.fcm_token);
        if (recipientsWithFcmTokens.length > 0) {
          const tokens = recipientsWithFcmTokens.map((recipient) => recipient.fcm_token);
          logger.info(
            `[FCM WORKER] Placeholder: Would send ${tokens.length} push notifications for alert ${alert_id}.`,
          );
        }

        if (send_sms) {
          const recipientsWithPhone = recipients.filter((recipient) => !!recipient.phone_number);
          if (recipientsWithPhone.length > 0) {
            await sendSmsBatch(
              recipientsWithPhone.map((recipient) => ({
                phone_number: recipient.phone_number,
                message: alert.message,
              })),
            );
          }
        }

        logger.info(`[WORKER] Job ${job.id} finished for alert ${alert_id}`);
      } catch (error) {
        logger.error(`[WORKER] Job ${job.id} failed for alert ${alert_id}:`, {
          error,
        });
        throw error;
      }
    },
    { connection: redisConnection },
  );

  worker.on("failed", (job, error) =>
    logger.error(`notificationQueue job ${job?.id} failed: ${error?.message || error}`),
  );

  logger.info("[alerts/queue] Notification Worker is running and listening for jobs.");
};
