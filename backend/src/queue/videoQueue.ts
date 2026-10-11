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
        delay: 5000, // 5s initial retry delay
      },
      removeOnComplete: {
        count: 100, // keep latest 100 completed jobs for audit
        age: 24 * 3600, // or 24 hours
      },
      removeOnFail: {
        count: 500, // retain failed jobs for debugging
      },
    },
  });

  videoQueueInstance.on("error", (err) => {
    console.warn(`[Video Queue Warning]: ${err.message}`);
  });

  return videoQueueInstance;
}

/**
 * Enqueues a video transcoding job into BullMQ.
 */
export async function enqueueTranscodeJob(
  data: TranscodeJobData,
  opts?: JobsOptions,
): Promise<Job<TranscodeJobData> | null> {
  if (!isRedisConfigured()) {
    console.warn(
      `[Video Queue] Redis is not configured; skipping job queueing for upload ${data.uploadId}.`,
    );
    return null;
  }

  const queue = getVideoQueue();
  const jobPayload: TranscodeJobData = {
    ...data,
    enqueuedAt: data.enqueuedAt || new Date().toISOString(),
  };

  const job = await queue.add(`transcode:${data.uploadId}`, jobPayload, {
    jobId: `transcode-${data.uploadId}`, // Prevents duplicate concurrent jobs for same upload
    ...opts,
  });

  return job;
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
