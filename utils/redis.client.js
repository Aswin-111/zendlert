// utils/redis.client.js
import { createClient } from "redis";

const REDIS_URL = process.env.REDIS_URL || "redis://zendlert_redis:6379";

const redisClient = createClient({
  url: REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 200, 2000),
  },
});

redisClient.on("error", (err) => {
  console.error("Redis Client Error (OTP client):", err?.message || err);
});

redisClient.on("connect", () => {
  console.log("Redis OTP client socket connected");
});

redisClient.on("ready", () => {
  console.log("Redis OTP client ready");
});

// connect once on module load
(async () => {
  try {
    console.log("Connecting Redis OTP client at:", REDIS_URL);
    await redisClient.connect();
  } catch (err) {
    console.error("Failed to connect Redis OTP client:", err);
  }
})();

export default redisClient;
