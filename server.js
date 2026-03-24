// server.js
// ---------------------------------------------------------
// Main entry point for the Express + Prisma + Redis + gRPC server
// Compatible with Node.js v24+ (no JSON import assertions)
// ---------------------------------------------------------

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "redis";
import admin from "firebase-admin";

import app from "./app.js";
import logger, { serializeError } from "./utils/logger.js";
import prisma from "./utils/prisma.js";
import { startChatService } from "./services/chat.service.js";
import { startKeyManagementService } from "./services/key-management.service.js";
import {
  processAlertNotificationJob,
  startAlertService,
} from "./services/alert.service.js";
import { startNotificationWorker } from "./services/queue.service.js";
import { startSubscriptionService } from "./services/subscription.service.js";
// ---------------------------------------------------------
// CONFIGURATION
// ---------------------------------------------------------

// Port to run the HTTP server on
const PORT = Number(process.env.PORT || 7000);

// Redis connection URL (fallback to Docker Compose service name)
const REDIS_URL = process.env.REDIS_URL || "redis://zendlert_redis:6379";

// ---------------------------------------------------------
// FIREBASE ADMIN INITIALIZATION (Node 24+ Safe Version)
// ---------------------------------------------------------

// Node 24 removes support for:
//   import serviceAccount from './file.json' assert { type: 'json' };
// So we manually load JSON via fs instead.

// ESM-safe __dirname replacement
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to Firebase service account file
const defaultServiceAccountPath = path.join(
  __dirname,
  "config/firebase/google-services.json",
);
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  ? path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
  : defaultServiceAccountPath;

function maskUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.password) parsed.password = "***";
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

function validateStartupEnv() {
  const requiredEnvVars = [
    "DATABASE_URL",
    "JWT_SECRET",
    "ACCESS_TOKEN_SECRET",
    "REFRESH_TOKEN_SECRET",
    "SERVER_SEAL_KEY",
    "SERVER_RSA_PUBLIC_KEY",   // add this
    "SERVER_RSA_PRIVATE_KEY",
  ];
  const missingEnvVars = requiredEnvVars.filter((key) => {
    const value = process.env[key];
    return typeof value !== "string" || value.trim().length === 0;
  });

  if (missingEnvVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingEnvVars.join(", ")}`,
    );
  }

  if (!Number.isInteger(PORT) || PORT <= 0 || PORT > 65535) {
    throw new Error("PORT must be a valid integer between 1 and 65535");
  }

  if (process.env.REDIS_URL) {
    try {
      // Validate format early to fail fast with a clear message.
      new URL(process.env.REDIS_URL);
    } catch {
      throw new Error("REDIS_URL must be a valid URL");
    }
  }

  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(
      `Firebase service account file not found at path: ${serviceAccountPath}`,
    );
  }

  const validNodeEnvs = new Set(["development", "test", "production"]);
  const runtimeNodeEnv = (process.env.NODE_ENV || "development").trim();
  if (!validNodeEnvs.has(runtimeNodeEnv)) {
    throw new Error("NODE_ENV must be one of: development, test, production");
  }

  const weakSecretVars = ["JWT_SECRET", "ACCESS_TOKEN_SECRET", "REFRESH_TOKEN_SECRET"]
    .filter((key) => {
      const value = process.env[key]?.trim();
      return value && value.length < 12;
    });

  if (weakSecretVars.length > 0) {
    logger.warn("startup.weak_secret_detected", {
      keys: weakSecretVars,
      recommendation: "Use at least 12 characters for token/signing secrets.",
    });
  }
}

function loadFirebaseServiceAccount() {
  const raw = fs.readFileSync(serviceAccountPath, "utf8");
  return JSON.parse(raw);
}

validateStartupEnv();

const serviceAccount = loadFirebaseServiceAccount();

// Initialize Firebase Admin SDK using the loaded credentials
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

logger.info("startup.firebase_initialized", {
  serviceAccountPath,
});

// ---------------------------------------------------------
// DATABASE CLIENT (PRISMA)
// ---------------------------------------------------------

// ---------------------------------------------------------
// REDIS CLIENT SETUP (Publisher + Subscriber)
// ---------------------------------------------------------

function makeRedisClient(url) {
  const client = createClient({
    url,
    socket: {
      // Reconnect strategy: retry every 200ms, max 2s
      reconnectStrategy: (retries) => Math.min(retries * 200, 2000),
    },
  });

  client.on("error", (error) => {
    logger.error("redis.client_error", {
      redisUrl: maskUrl(url),
      error: serializeError(error),
    });
  });
  client.on("connect", () => {
    logger.info("redis.socket_connected", { redisUrl: maskUrl(url) });
  });
  client.on("ready", () => {
    logger.info("redis.client_ready", { redisUrl: maskUrl(url) });
  });

  return client;
}

const redisPublisher = makeRedisClient(REDIS_URL);
const redisSubscriber = redisPublisher.duplicate();

let httpServer;
let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.warn("shutdown.started", { signal });

  try {
    if (httpServer) {
      await new Promise((resolve) => {
        httpServer.close(() => resolve());
      });
      logger.info("shutdown.http_server_closed");
    }

    await Promise.allSettled([
      redisPublisher.quit(),
      redisSubscriber.quit(),
    ]);
    await prisma.$disconnect();

    logger.info("shutdown.completed", { signal });
  } catch (error) {
    logger.error("shutdown.failed", { signal, error: serializeError(error) });
  } finally {
    process.exit(0);
  }
}

// ---------------------------------------------------------
// MAIN SERVER STARTUP LOGIC
// ---------------------------------------------------------

async function main() {
  logger.info("startup.begin", {
    port: PORT,
    redisUrl: maskUrl(REDIS_URL),
    nodeEnv: process.env.NODE_ENV || "development",
  });

  // Connect both publisher and subscriber
  await Promise.all([
    redisPublisher.connect(),
    redisSubscriber.connect(),
  ]);

  logger.info("startup.redis_connected", { redisUrl: maskUrl(REDIS_URL) });

  // Start Express server
  httpServer = app.listen(PORT, "0.0.0.0", () => {
    logger.info("startup.http_server_listening", {
      host: "0.0.0.0",
      port: PORT,
    });
  });

  // Start gRPC chat & alert services
  startChatService(prisma, redisPublisher, redisSubscriber, admin);
  logger.info("startup.grpc_chat_started");

  startAlertService(prisma);
  logger.info("startup.grpc_alert_started");
  // add these two lines:
  startKeyManagementService(prisma, admin);
  logger.info("startup.grpc_key_management_started");

  startSubscriptionService();
  logger.info("startup.grpc_subscription_started");
  
  startNotificationWorker(async (job) => {
    const alertId = job?.data?.alert_id ?? null;
    try {
      await processAlertNotificationJob(prisma, job?.data);
      logger.info("startup.alert_notification_job_processed", {
        meta: { job_id: job?.id ?? null, alert_id: alertId },
      });
    } catch (error) {
      logger.error("startup.alert_notification_job_failed", {
        error: serializeError(error),
        meta: { job_id: job?.id ?? null, alert_id: alertId },
      });
      throw error;
    }
  });
  logger.info("startup.alert_notification_worker_started");
}

// ---------------------------------------------------------
// RUN SERVER
// ---------------------------------------------------------

main().catch(async (error) => {
  logger.error("startup.fatal_error", { error: serializeError(error) });
  await prisma.$disconnect().catch(() => { });
  process.exit(1);
});

// ---------------------------------------------------------
// GRACEFUL SHUTDOWN HANDLERS (SIGINT / SIGTERM)
// ---------------------------------------------------------

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
