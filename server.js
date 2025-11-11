// server.js
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createClient } from 'redis';
import admin from 'firebase-admin';

import app from './app.js';
import { startChatService } from './services/chat.service.js';
import { startAlertService } from './services/alert.service.js';

// --- CONFIGURATION ---
const PORT = Number(process.env.PORT || 7000);

// Prefer one env var. Fallback to Compose service name if not set.
const REDIS_URL = process.env.REDIS_URL || 'redis://zendlert_redis:6379';

// Firebase Admin (using bundled service account JSON)
import serviceAccount from './config/firebase/google-services.json' assert { type: 'json' };
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// --- CLIENTS ---
const prisma = new PrismaClient();

// Create a robust Redis publisher/subscriber pair
function makeRedisClient(url) {
  const client = createClient({
    url,
    socket: {
      // simple linear backoff (cap at 2s)
      reconnectStrategy: (retries) => Math.min(retries * 200, 2000),
    },
  });
  client.on('error', (err) => console.error('Redis Client Error:', err?.message || err));
  client.on('connect', () => console.log('Redis socket connected'));
  client.on('ready', () => console.log('Redis client ready'));
  return client;
}

const redisPublisher = makeRedisClient(REDIS_URL);
const redisSubscriber = redisPublisher.duplicate();

// --- MAIN SERVER STARTUP LOGIC ---
async function main() {
  console.log('Connecting to Redis at:', REDIS_URL);
  await Promise.all([redisPublisher.connect(), redisSubscriber.connect()]);
  console.log('Redis connected.');

  // Start HTTP server (explicit 0.0.0.0 bind for Docker)
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 HTTP Server running at http://0.0.0.0:${PORT}`);
  });

  // Start gRPC services
  startChatService(prisma, redisPublisher, redisSubscriber, admin);
  startAlertService(prisma);
}

// --- RUN THE SERVER ---
main()
  .catch((e) => {
    console.error('Fatal startup error:', e);
    process.exit(1);
  })
  .finally(async () => {
    // prisma will remain open during server lifetime; this finally runs only if main() throws before servers start
    await prisma.$disconnect().catch(() => {});
  });

// Optional: graceful shutdown (SIGTERM/SIGINT)
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  try {
    await Promise.allSettled([redisPublisher.quit(), redisSubscriber.quit()]);
    await prisma.$disconnect();
  } finally {
    process.exit(0);
  }
});
process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down...');
  try {
    await Promise.allSettled([redisPublisher.quit(), redisSubscriber.quit()]);
    await prisma.$disconnect();
  } finally {
    process.exit(0);
  }
});
