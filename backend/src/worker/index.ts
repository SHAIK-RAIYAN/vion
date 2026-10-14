import { createTranscodingWorker } from "./transcodingWorker";
import { reconcileUploadQueue } from "./reconcileQueue";
import { checkRedisHealth, closeRedisClient } from "../queue/redisClient";
import { getSanitizedConfigSummary, isRedisConfigured } from "../config/config";
import { checkStorageHealth } from "../services/storageService";

async function main() {
  console.info("=================================================");
  console.info("      VION VIDEO TRANSCODING WORKER SERVICE     ");
  console.info("=================================================");

  const summary = getSanitizedConfigSummary();
  console.info(`[Worker] Environment: ${summary.nodeEnv}`);
  console.info(`[Worker] Redis host: ${summary.redis.host} (configured: ${summary.redis.isConfigured})`);
  console.info(`[Worker] Storage: ${summary.storage.supabaseUrl} (configured: ${summary.storage.isConfigured})`);
  console.info(`[Worker] Temp media dir: ${summary.paths.tempMediaDir}`);
  console.info("-------------------------------------------------");

  if (!isRedisConfigured()) {
    console.error("[Worker Fatal] REDIS_URL is not configured. Cannot start worker without Redis.");
    process.exit(1);
  }

  // Pre-flight health verification
  const redisHealth = await checkRedisHealth();
  if (!redisHealth.isAvailable) {
    console.warn(`[Worker Warning] Redis health check failed: ${redisHealth.message}`);
    console.warn("[Worker Warning] Ensure Redis container is running via: docker compose up -d redis");
  } else {
    console.info(`[Worker] Redis connection verified (ping latency: ${redisHealth.latencyMs}ms)`);
  }

  const storageHealth = await checkStorageHealth();
  if (!storageHealth.isAvailable) {
    console.warn(`[Worker Storage Notice]: ${storageHealth.message}`);
  } else {
    console.info(`[Worker] Supabase Storage verified (${storageHealth.buckets?.length || 0} buckets detected)`);
  }

  // Reconcile database state: re-enqueue any dropped or interrupted uploads on startup
  try {
    await reconcileUploadQueue();
  } catch (reconcileErr: any) {
    console.warn(`[Worker Warning] Startup queue reconciliation notice: ${reconcileErr.message}`);
  }

  // Initialize and spin up worker
  const worker = createTranscodingWorker();
  console.info("[Worker] Service successfully booted. Ready to transcode incoming video jobs.");

  // Graceful shutdown handling
  let isShuttingDown = false;
  async function gracefulShutdown(signal: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.info(`\n[Worker] Received ${signal}. Commencing graceful shutdown...`);

    try {
      // Allow in-flight jobs to complete with a 15-second timeout
      await worker.close();
      console.info("[Worker] Transcoding worker closed cleanly.");

      await closeRedisClient();
      console.info("[Worker] Redis client connections terminated.");
    } catch (err: any) {
      console.error("[Worker] Error during shutdown:", err.message);
    } finally {
      process.exit(0);
    }
  }

  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

  process.on("unhandledRejection", (reason: any) => {
    console.error("[Worker Unhandled Rejection]:", reason?.message || reason);
  });

  process.on("uncaughtException", (err: any) => {
    console.error("[Worker Uncaught Exception]:", err?.message || err);
  });
}

main().catch((err) => {
  console.error("[Worker Fatal Crash]:", err);
  process.exit(1);
});
