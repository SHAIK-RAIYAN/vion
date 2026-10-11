import Redis, { type RedisOptions } from "ioredis";
import { REDIS_URL, isRedisConfigured } from "../config/config";

let sharedRedisInstance: Redis | null = null;

let lastWarningTime = 0;
function logRedisWarning(prefix: string, err: any) {
  const now = Date.now();
  if (now - lastWarningTime > 10000) {
    lastWarningTime = now;
    console.warn(`${prefix}: ${err.message || "Connection refused"}`);
  }
}

export function getRedisOptions(): RedisOptions {
  return {
    // BullMQ requires maxRetriesPerRequest to be null
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times: number) => {
      if (times > 5) return 10000;
      return Math.min(times * 1000, 5000);
    },
    lazyConnect: true,
  };
}

/**
 * Returns a singleton Redis connection for general caching and health checks.
 */
export function getRedisClient(): Redis {
  if (sharedRedisInstance) {
    return sharedRedisInstance;
  }

  const options = getRedisOptions();
  sharedRedisInstance = new Redis(REDIS_URL, options);

  sharedRedisInstance.on("error", (err) => {
    logRedisWarning("[Redis Client Warning]", err);
  });

  sharedRedisInstance.on("connect", () => {
    console.info("[Redis] Client connected successfully.");
  });

  return sharedRedisInstance;
}

/**
 * Creates a dedicated Redis connection (required by BullMQ Workers and QueueEvents
 * to avoid sharing blocking commands across instances).
 */
export function createDedicatedRedisConnection(): Redis {
  const options = getRedisOptions();
  const client = new Redis(REDIS_URL, options);

  client.on("error", (err) => {
    logRedisWarning("[Dedicated Redis Client Warning]", err);
  });

  return client;
}

/**
 * Verifies Redis connectivity and returns latency for readiness checks.
 */
export async function checkRedisHealth(): Promise<{
  isConfigured: boolean;
  isAvailable: boolean;
  latencyMs?: number;
  message: string;
}> {
  if (!isRedisConfigured()) {
    return {
      isConfigured: false,
      isAvailable: false,
      message: "REDIS_URL is not configured",
    };
  }

  const client = getRedisClient();
  const startTime = Date.now();

  try {
    if (client.status !== "ready" && client.status !== "connecting") {
      await client.connect().catch((err) => {
        // If already connected or connecting, ignore
        if (!err.message?.includes("already connected")) throw err;
      });
    }

    const pong = await client.ping();
    const latencyMs = Date.now() - startTime;

    if (pong === "PONG") {
      return {
        isConfigured: true,
        isAvailable: true,
        latencyMs,
        message: "Redis connection healthy",
      };
    }

    return {
      isConfigured: true,
      isAvailable: false,
      latencyMs,
      message: `Unexpected Redis response: ${pong}`,
    };
  } catch (err: any) {
    return {
      isConfigured: true,
      isAvailable: false,
      latencyMs: Date.now() - startTime,
      message: `Failed to connect to Redis: ${err.message || "Unknown error"}`,
    };
  }
}

/**
 * Gracefully disconnects all shared Redis connections on server shutdown.
 */
export async function closeRedisClient(): Promise<void> {
  if (sharedRedisInstance) {
    try {
      await sharedRedisInstance.quit();
    } catch {
      sharedRedisInstance.disconnect();
    } finally {
      sharedRedisInstance = null;
    }
  }
}
