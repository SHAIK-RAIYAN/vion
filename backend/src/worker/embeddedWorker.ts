import type { Worker } from "bullmq";
import { createTranscodingWorker } from "./transcodingWorker";
import { reconcileUploadQueue } from "./reconcileQueue";
import { checkRedisHealth, closeRedisClient } from "../queue/redisClient";
import { isRedisConfigured, ENABLE_WORKER, WORKER_CONCURRENCY } from "../config/config";
import { logMemoryUsage } from "../utils/memoryDiagnostics";
import type { TranscodeJobData } from "../queue/videoQueue";

let embeddedWorkerInstance: Worker<TranscodeJobData> | null = null;
let isStarted = false;

/**
 * Starts the BullMQ transcoding worker directly inside the current Express/Bun process.
 *
 * Resource Advantages on Render Free Tier (512MB RAM Budget):
 * 1. Single Process Architecture: Eliminates an entire second Bun process,
 *    saving ~80MB - 120MB of baseline duplicate memory.
 * 2. Shared Module & Client Cache: Reuses existing database connection and config.
 * 3. Asynchronous Non-Blocking Execution: Media transcoding uses OS child processes (FFmpeg)
 *    and streams to disk, so the Express HTTP event loop remains responsive.
 * 4. Strict Serial Concurrency: Enforces WORKER_CONCURRENCY=1 so at most 1 video transcode
 *    executes at any time on the free tier.
 */
export async function startEmbeddedWorker(): Promise<void> {
  if (isStarted) return;

  if (!ENABLE_WORKER || process.env.ENABLE_WORKER === "false") {
    console.info("[Embedded Worker] Worker is disabled (ENABLE_WORKER=false).");
    return;
  }

  if (!isRedisConfigured()) {
    console.info("[Embedded Worker] Redis is not configured; skipping embedded worker startup.");
    return;
  }

  isStarted = true;
  logMemoryUsage("embedded-worker-boot", { concurrency: WORKER_CONCURRENCY });

  // Pre-flight Redis health check
  try {
    const redisHealth = await checkRedisHealth();
    if (!redisHealth.isAvailable) {
      console.warn(`[Embedded Worker] Redis health check notice: ${redisHealth.message}`);
    } else {
      console.info(`[Embedded Worker] Redis connection verified (${redisHealth.latencyMs}ms latency).`);
    }
  } catch (err: any) {
    console.warn(`[Embedded Worker] Redis pre-flight notice: ${err?.message || err}`);
  }

  // Reconcile database state: re-enqueue any dropped or interrupted uploads on startup
  try {
    const recovered = await reconcileUploadQueue();
    if (recovered > 0) {
      console.info(`[Embedded Worker] Recovered ${recovered} pending/interrupted video job(s).`);
    }
  } catch (reconcileErr: any) {
    console.warn(`[Embedded Worker] Startup queue reconciliation notice: ${reconcileErr.message}`);
  }

  // Spin up worker within the current process
  embeddedWorkerInstance = createTranscodingWorker();
  console.info("[Embedded Worker] Transcoding worker successfully booted in-process (shared memory budget).");
}

/**
 * Gracefully shuts down the embedded worker on server termination.
 */
export async function stopEmbeddedWorker(timeoutMs = 10000): Promise<void> {
  if (!embeddedWorkerInstance) return;

  console.info("[Embedded Worker] Commencing graceful worker shutdown...");
  const worker = embeddedWorkerInstance;
  embeddedWorkerInstance = null;
  isStarted = false;

  try {
    const closePromise = worker.close();
    const timeoutPromise = new Promise<void>((resolve) =>
      setTimeout(() => {
        console.warn("[Embedded Worker] Worker close timed out; forcing teardown.");
        resolve();
      }, timeoutMs),
    );
    await Promise.race([closePromise, timeoutPromise]);
    console.info("[Embedded Worker] Transcoding worker shut down cleanly.");
  } catch (err: any) {
    console.warn("[Embedded Worker] Notice during worker shutdown:", err.message);
  }
}
