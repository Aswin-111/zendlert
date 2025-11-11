// utils/redis.client.js
import { createClient } from 'redis';
import { REDIS_URL } from '../config/redis-connection.js';

export const redisClient = createClient({
  url: REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 200, 2000),
  },
});

redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

export async function ensureRedis() {
  if (!redisClient.isOpen) await redisClient.connect();
}

export default redisClient;
