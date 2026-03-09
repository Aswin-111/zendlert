// utils/redis.client.js
import { createClient } from "redis";
import logger, { serializeError } from "./logger.js";

const REDIS_URL = process.env.REDIS_URL || "redis://zendlert_redis:6379";
const maskRedisUrl = (url) => {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "***";
    return parsed.toString();
  } catch {
    return url;
  }
};

const redisClient = createClient({
  url: REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 200, 2000),
  },
});

redisClient.on("error", (err) => {
  logger.error("redis.otp_client.error", { error: serializeError(err) });
});

redisClient.on("connect", () => {
  logger.info("redis.otp_client.socket_connected");
});

redisClient.on("ready", () => {
  logger.info("redis.otp_client.ready");
});

// connect once on module load
(async () => {
  try {
    logger.info("redis.otp_client.connecting", {
      redisUrl: maskRedisUrl(REDIS_URL),
    });
    await redisClient.connect();
  } catch (err) {
    logger.error("redis.otp_client.connect_failed", {
      error: serializeError(err),
    });
  }
})();

export default redisClient;
