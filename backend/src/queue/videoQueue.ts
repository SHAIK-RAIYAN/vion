import { Queue, type JobsOptions, type Job } from "bullmq";
import { createDedicatedRedisConnection } from "./redisClient";
import { isRedisConfigured } from "../config/config";

export const VIDEO_TRANSCODE_QUEUE_NAME = "video-transcoding";

export interface TranscodeJobData {
  uploadId: string;
  channelId: string;
  rawVideoKey: string;
  title?: string;
  requestedResolutions?: ("1080p" | "720p" | "480p" | "360p")[];
  enqueuedAt?: string;
}

let videoQueueInstance: Queue<TranscodeJobData> | null = null;

/**
 * Returns the BullMQ Queue singleton for video transcoding.
 * Configured with bounded retries, exponential backoff, and deduplication options.
 */
export function getVideoQueue(): Queue<TranscodeJobData> {
  if (videoQueueInstance) {
    return videoQueueInstance;
  }

  const connection = createDedicatedRedisConnection();

  videoQueueInstance = new Queue<TranscodeJobData>(VIDEO_TRANSCODE_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 3000, // 3s initial backoff with exponential multiplier
      },
      removeOnComplete: {
        count: 200, // keep latest 200 completed jobs for audit
        age: 24 * 3600, // 24 hours
      },
      removeOnFail: {
        count: 500, // retain failed jobs for diagnostic logging
      },
    },
  });

  videoQueueInstance.on("error", (err) => {
    console.warn(`[Video Queue Warning]: ${err.message}`);
  });

  return videoQueueInstance;
}

/**
 * Retrieves an existing transcoding job by uploadId.
 * Used for live queue progress queries and deduplication checks.
 */
export async function getTranscodeJobByUploadId(
  uploadId: string,
): Promise<Job<TranscodeJobData> | null> {
  if (!isRedisConfigured()) {
    return null;
  }

  try {
    const queue = getVideoQueue();
    const jobPromise = queue.getJob(`transcode-${uploadId}`);
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200));
    const job = await Promise.race([jobPromise, timeoutPromise]);
    return job || null;
  } catch (err: any) {
    console.warn(`[Video Queue Warning] Failed to fetch job for upload ${uploadId}:`, err.message);
    return null;
  }
}

/**
 * Enqueues a video transcoding job into BullMQ.
 * Enforces stable, deterministic job IDs (`transcode-${uploadId}`) to guarantee
 * that duplicate requests for the same upload resolve to the exact same job.
 */
export async function enqueueTranscodeJob(
  data: TranscodeJobData,
  opts?: JobsOptions,
): Promise<Job<TranscodeJobData> | null> {
  if (!isRedisConfigured()) {
    console.warn(
      `[Video Queue] Redis is not configured; skipping background job queueing for upload ${data.uploadId}.`,
    );
    return null;
  }

  const queue = getVideoQueue();
  const stableJobId = `transcode-${data.uploadId}`;

  // Idempotency: check if active or waiting job already exists
  try {
    const existingJob = await queue.getJob(stableJobId);
    if (existingJob) {
      const state = await existingJob.getState();
      if (state === "waiting" || state === "active" || state === "delayed") {
        console.info(
          `[Video Queue] Job ${stableJobId} already exists in state '${state}'. Returning existing job.`,
        );
        return existingJob;
      }
    }
  } catch {
    // Proceed to add job if check fails
  }

  const jobPayload: TranscodeJobData = {
    ...data,
    enqueuedAt: data.enqueuedAt || new Date().toISOString(),
  };

  try {
    const job = await queue.add(`transcode:${data.uploadId}`, jobPayload, {
      jobId: stableJobId,
      ...opts,
    });

    return job;
  } catch (err: any) {
    console.warn(
      `[Video Queue Warning] Failed to enqueue job for upload ${data.uploadId}:`,
      err?.message || err,
    );
    return null;
  }
}

/**
 * Retrieves high-level queue metrics for monitoring and health reporting.
 */
export async function getQueueMetrics(): Promise<{
  isAvailable: boolean;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  if (!isRedisConfigured()) {
    return {
      isAvailable: false,
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
    };
  }

  try {
    const queue = getVideoQueue();
    const counts = await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
    return {
      isAvailable: true,
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
    };
  } catch (err: any) {
    console.warn(`[Queue Metrics Warning]: ${err.message}`);
    return {
      isAvailable: false,
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
    };
  }
}

/**
 * Gracefully shuts down the queue connection.
 */
export async function closeVideoQueue(): Promise<void> {
  if (videoQueueInstance) {
    try {
      await videoQueueInstance.close();
    } catch {
      // Ignore cleanup error
    } finally {
      videoQueueInstance = null;
    }
  }
}
