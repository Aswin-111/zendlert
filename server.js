// server.js
// ---------------------------------------------------------
// Main entry point for the Express + Prisma + Redis + gRPC server
// Compatible with Node.js v24+ (no JSON import assertions)
// ---------------------------------------------------------

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createClient } from 'redis';
import admin from 'firebase-admin';

import app from './app.js';
import { startChatService } from './services/chat.service.js';
import { startAlertService } from './services/alert.service.js';

// ---------------------------------------------------------
// CONFIGURATION
// ---------------------------------------------------------

// Port to run the HTTP server on
const PORT = Number(process.env.PORT || 7000);

// Redis connection URL (fallback to Docker Compose service name)
const REDIS_URL = process.env.REDIS_URL || 'redis://zendlert_redis:6379';


// ---------------------------------------------------------
// FIREBASE ADMIN INITIALIZATION (Node 24+ Safe Version)
// ---------------------------------------------------------

// Node 24 removes support for: 
//   import serviceAccount from './file.json' assert { type: 'json' };
// So we manually load JSON via fs instead.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM-safe __dirname replacement
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to your Firebase service account file
const serviceAccountPath = path.join(
  __dirname,
  'config/firebase/google-services.json'
);

// Read & parse the JSON securely
const serviceAccount = JSON.parse(
  fs.readFileSync(serviceAccountPath, 'utf8')
);

// Initialize Firebase Admin SDK using the loaded credentials
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});


// ---------------------------------------------------------
// DATABASE CLIENT (PRISMA)
// ---------------------------------------------------------

const prisma = new PrismaClient();


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

  client.on('error', (err) =>
    console.error('Redis Client Error:', err?.message || err)
  );
  client.on('connect', () => console.log('Redis socket connected'));
  client.on('ready', () => console.log('Redis client ready'));

  return client;
}

const redisPublisher = makeRedisClient(REDIS_URL);
const redisSubscriber = redisPublisher.duplicate();


// ---------------------------------------------------------
// MAIN SERVER STARTUP LOGIC
// ---------------------------------------------------------

async function main() {
  console.log('Connecting to Redis at:', REDIS_URL);

  // Connect both publisher and subscriber
  await Promise.all([
    redisPublisher.connect(),
    redisSubscriber.connect(),
  ]);

  console.log('Redis connected.');

  // Start Express server
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 HTTP Server running at http://0.0.0.0:${PORT}`);
  });

  // Start gRPC chat & alert services
  startChatService(prisma, redisPublisher, redisSubscriber, admin);
  startAlertService(prisma);
}


// ---------------------------------------------------------
// RUN SERVER
// ---------------------------------------------------------

main()
  .catch((e) => {
    console.error('Fatal startup error:', e);
    process.exit(1);
  })
  .finally(async () => {
    // Only runs if main() throws before server fully starts
    await prisma.$disconnect().catch(() => {});
  });


// ---------------------------------------------------------
// GRACEFUL SHUTDOWN HANDLERS (SIGINT / SIGTERM)
// ---------------------------------------------------------

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  try {
    await Promise.allSettled([
      redisPublisher.quit(),
      redisSubscriber.quit(),
    ]);
    await prisma.$disconnect();
  } finally {
    process.exit(0);
  }
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down...');
  try {
    await Promise.allSettled([
      redisPublisher.quit(),
      redisSubscriber.quit(),
    ]);
    await prisma.$disconnect();
  } finally {
    process.exit(0);
  }
});
