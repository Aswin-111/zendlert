// config/redis-connection.js
// Central config for all Redis-based clients and queues

export const REDIS_URL =
  process.env.REDIS_URL || 'redis://zendlert_redis:6379';

export function bullConnection() {
  const u = new URL(REDIS_URL);
  return {
    host: u.hostname || 'zendlert_redis',
    port: Number(u.port || 6379),
    ...(u.password ? { password: u.password } : {}),
  };
}