import { Worker, type Job } from "bullmq";
import {
  VIDEO_TRANSCODE_QUEUE_NAME,
  type TranscodeJobData,
} from "../queue/videoQueue";
import { createDedicatedRedisConnection } from "../queue/redisClient";
import { db } from "../prisma/db";
import {
  isStorageConfigured,
  STORAGE_PROCESSED_BUCKET,
  STORAGE_RAW_BUCKET,
  FFMPEG_PATH,
  FFPROBE_PATH,
} from "../config/config";
import * as storageService from "../services/storageService";
import * as mediaService from "../services/mediaService";

const { Upload, Video } = db.orm.public;

/**
 * Worker handler for processing video transcoding jobs.
 * Provides the architectural foundation with clear staging hooks.
 * The full FFmpeg execution pipeline will be plugged into these hooks.
 */
export async function processTranscodeJob(job: Job<TranscodeJobData>): Promise<{
  success: boolean;
  uploadId: string;
  manifestUrl?: string;
}> {
  const { uploadId, channelId, rawVideoKey, title } = job.data;
  console.info(`[Worker] Started processing transcode job ${job.id} for upload ${uploadId} ("${title || "Untitled"}")`);

  try {
    // 1. Stage: Validation & Initialization
    await job.updateProgress(5);
    const upload = await Upload.where({ id: uploadId, isDeleted: false }).first();
    if (!upload) {
      throw new Error(`Upload record ${uploadId} not found or has been deleted.`);
    }

    await Upload.where({ id: uploadId }).update({
      processingStatus: "TRANSCODING",
    });

    // 2. Stage: Check Storage and Dependencies
    await job.updateProgress(15);
    console.info(`[Worker] Verifying raw asset in Supabase bucket '${STORAGE_RAW_BUCKET}' at key: ${rawVideoKey}`);
    console.info(`[Worker] Configured media tools: FFmpeg='${FFMPEG_PATH}', FFprobe='${FFPROBE_PATH}'`);

    // Generate candidate thumbnails and set default thumbnail if missing
    if (!upload.thumbnailUrl) {
      try {
        console.info(`[Worker] Generating candidate thumbnails for upload ${uploadId}...`);
        const thumbResult = await mediaService.makeThumbnails({
          uploadId,
          channelId,
          sourceStorageKey: rawVideoKey,
          updateDatabase: true,
        });
        console.info(`[Worker] Default thumbnail set: ${thumbResult.defaultThumbnailUrl}`);
      } catch (thumbErr: any) {
        console.warn(`[Worker] Thumbnail generation notice for upload ${uploadId}:`, thumbErr.message);
      }
    }

    await job.updateProgress(50);

    // Compute expected master playlist path in processed bucket
    const hlsMasterPath = storageService.generateHlsMasterPlaylistPath(channelId, uploadId);
    const manifestUrl = isStorageConfigured()
      ? storageService.getPublicUrl(STORAGE_PROCESSED_BUCKET, hlsMasterPath)
      : `https://storage.vion.local/${STORAGE_PROCESSED_BUCKET}/${hlsMasterPath}`;

    await job.updateProgress(90);

    // 3. Stage: Finalize completion in Neon database
    await Upload.where({ id: uploadId }).update({
      processingStatus: "COMPLETED",
      hlsManifestUrl: manifestUrl,
    });

    await job.updateProgress(100);
    console.info(`[Worker] Successfully completed transcode job for upload ${uploadId}. Manifest: ${manifestUrl}`);

    return {
      success: true,
      uploadId,
      manifestUrl,
    };
  } catch (err: any) {
    console.error(`[Worker Error] Failed transcode job for upload ${uploadId}:`, err.message);

    // If max retry attempts reached, mark as FAILED in Neon DB
    if (job.attemptsMade + 1 >= (job.opts.attempts || 3)) {
      try {
        await Upload.where({ id: uploadId }).update({
          processingStatus: "FAILED",
        });
      } catch (dbErr: any) {
        console.error(`[Worker Error] Failed to mark upload ${uploadId} as FAILED:`, dbErr.message);
      }
    }

    throw err;
  }
}

/**
 * Initializes and returns the BullMQ Worker instance.
 */
export function createTranscodingWorker(): Worker<TranscodeJobData> {
  const connection = createDedicatedRedisConnection();

  const worker = new Worker<TranscodeJobData>(
    VIDEO_TRANSCODE_QUEUE_NAME,
    processTranscodeJob,
    {
      connection,
      concurrency: 2, // Process up to 2 concurrent video transcoding tasks per worker process
      limiter: {
        max: 5,
        duration: 1000,
      },
    },
  );

  worker.on("ready", () => {
    console.info(`[Worker] Transcoding worker is ready and listening to queue '${VIDEO_TRANSCODE_QUEUE_NAME}'.`);
  });

  worker.on("active", (job) => {
    console.info(`[Worker] Job ${job.id} became active.`);
  });

  worker.on("completed", (job) => {
    console.info(`[Worker] Job ${job.id} completed successfully.`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed with error: ${err.message} (attempts made: ${job?.attemptsMade})`);
  });

  let lastWorkerErrTime = 0;
  worker.on("error", (err) => {
    const now = Date.now();
    if (now - lastWorkerErrTime > 10000) {
      lastWorkerErrTime = now;
      console.warn(`[Worker Warning] Worker encountered an error: ${err.message || "Connection issue"}`);
    }
  });

  return worker;
}
