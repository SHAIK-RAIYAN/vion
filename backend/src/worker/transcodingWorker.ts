import fs from "fs";
import path from "path";
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
  WORKER_CONCURRENCY,
  TEMP_MEDIA_DIR,
} from "../config/config";
import * as storageService from "../services/storageService";
import * as mediaService from "../services/mediaService";
import * as transcodingService from "../services/transcodingService";
import {
  logMemoryUsage,
  triggerGarbageCollection,
  incrementActiveTranscodes,
  decrementActiveTranscodes,
  getActiveTranscodesCount,
} from "../utils/memoryDiagnostics";

const { Upload } = db.orm.public;

/**
 * Worker job processor for video transcoding tasks.
 * Follows the required 7-stage processing lifecycle:
 * 1. Receive job
 * 2. Load the upload record
 * 3. Verify the expected raw object exists
 * 4. Check that the upload is in a valid state for processing
 * 5. Run the media-processing service
 * 6. Record success or failure in existing database fields
 * 7. Clean up temporary files
 */
export async function processTranscodeJob(job: Job<TranscodeJobData>): Promise<{
  success: boolean;
  uploadId: string;
  manifestUrl?: string;
  thumbnailUrl?: string;
}> {
  const { uploadId, channelId, rawVideoKey, title } = job.data;
  const logPrefix = `[Upload: ${uploadId}] [Job: ${job.id}]`;
  const attemptNum = job.attemptsMade + 1;
  const maxAttempts = job.opts.attempts || 3;

  logMemoryUsage("job-start", { uploadId, jobId: job.id, attempt: attemptNum });
  console.info(`${logPrefix} Processing started for "${title || "Untitled"}" (Attempt ${attemptNum}/${maxAttempts})`);

  // Concurrency guard: strictly enforce that at most 1 video-transcoding job runs at a time
  if (getActiveTranscodesCount() >= WORKER_CONCURRENCY) {
    throw new Error(
      `Worker concurrency limit reached (${getActiveTranscodesCount()}/${WORKER_CONCURRENCY} active). Delaying job for serial execution.`,
    );
  }

  incrementActiveTranscodes();

  try {
    // 1. Stage: Load upload record from database
    await job.updateProgress(5);
    const upload = await Upload.where({ id: uploadId, isDeleted: false }).first();
    if (!upload) {
      console.warn(`${logPrefix} Upload record ${uploadId} not found or soft-deleted. Aborting processing.`);
      return { success: false, uploadId };
    }

    // 2. Stage: Idempotent state validation
    // If the upload was already marked COMPLETED in the database, avoid duplicate active assets
    if (upload.processingStatus === "COMPLETED") {
      console.info(`${logPrefix} Upload already marked COMPLETED in database. Skipping duplicate processing.`);
      await job.updateProgress(100);
      return {
        success: true,
        uploadId,
        manifestUrl: upload.hlsManifestUrl || undefined,
        thumbnailUrl: upload.thumbnailUrl || undefined,
      };
    }

    // Transition state to TRANSCODING in database
    await Upload.where({ id: uploadId }).update({
      processingStatus: "TRANSCODING",
    });

    // 3. Stage: Verify raw object exists in storage and stream directly to disk
    await job.updateProgress(15);
    const workerJobDir = path.join(TEMP_MEDIA_DIR, `worker_job_${uploadId}_${Date.now()}`);
    fs.mkdirSync(workerJobDir, { recursive: true });
    let localRawPath: string | undefined;

    try {
      if (isStorageConfigured()) {
        console.info(`${logPrefix} Verifying raw media object in storage key: ${rawVideoKey}`);
        const folder = `raw/${channelId}/${uploadId}`;
        const files = await storageService.listFiles(STORAGE_RAW_BUCKET, folder);
        if (!files || files.length === 0) {
          throw new Error(`Raw media file is missing in storage for upload ${uploadId} under folder: ${folder}`);
        }

        // Stream raw video directly to disk without loading into RAM
        console.info(`${logPrefix} Streaming raw video to worker scratch workspace...`);
        localRawPath = path.join(workerJobDir, "source_input.mp4");
        await storageService.downloadFileToDisk(STORAGE_RAW_BUCKET, rawVideoKey, localRawPath);
        logMemoryUsage("download-complete", { uploadId });
      }

      // 4. Stage: Run media processing service (thumbnails & inspection)
      await job.updateProgress(25);
      console.info(`${logPrefix} Running media-inspection and thumbnail generation (FFmpeg: ${FFMPEG_PATH})...`);
      let activeThumbnailUrl = upload.thumbnailUrl;

      try {
        const thumbResult = await mediaService.makeThumbnails({
          uploadId,
          channelId,
          sourceFilePath: localRawPath,
          sourceStorageKey: localRawPath ? undefined : rawVideoKey,
          updateDatabase: true,
        });
        activeThumbnailUrl = thumbResult.defaultThumbnailUrl;
        console.info(`${logPrefix} Thumbnails generated successfully: ${activeThumbnailUrl}`);
        logMemoryUsage("thumbnails-complete", { uploadId });
      } catch (thumbErr: any) {
        console.warn(`${logPrefix} Thumbnail extraction notice: ${thumbErr.message}`);
      }

      // 5. Stage: Run multi-bitrate HLS adaptive transcoding pipeline
      console.info(`${logPrefix} Starting adaptive HLS transcoding pipeline (FFmpeg: ${FFMPEG_PATH})...`);
      const transcodeResult = await transcodingService.processVideoHlsPipeline({
        uploadId,
        channelId,
        sourceFilePath: localRawPath,
        sourceStorageKey: localRawPath ? undefined : rawVideoKey,
        activeThumbnailUrl: activeThumbnailUrl || undefined,
        onProgress: async (stage, pct) => {
          // Map pipeline progress (0-100) into BullMQ job progress (30-95)
          const jobPct = 30 + Math.round(pct * 0.65);
          await job.updateProgress(jobPct);
        },
      });

      await job.updateProgress(100);
      console.info(
        `${logPrefix} Transcode job completed successfully. Manifest: ${transcodeResult.masterManifestUrl} (${transcodeResult.renditions.length} renditions)`,
      );
      logMemoryUsage("job-complete", { uploadId });

      return {
        success: true,
        uploadId,
        manifestUrl: transcodeResult.masterManifestUrl,
        thumbnailUrl: activeThumbnailUrl || undefined,
      };
    } finally {
      // Guaranteed cleanup of worker scratch directory
      try {
        if (fs.existsSync(workerJobDir)) {
          fs.rmSync(workerJobDir, { recursive: true, force: true });
        }
      } catch {}
    }
  } catch (err: any) {
    console.error(`${logPrefix} Transcoding error on attempt ${attemptNum}/${maxAttempts}: ${err.message}`);

    // If max retry attempts reached, record failure in database
    if (attemptNum >= maxAttempts) {
      console.error(`${logPrefix} Max attempts reached. Marking upload as FAILED in database.`);
      try {
        await Upload.where({ id: uploadId }).update({
          processingStatus: "FAILED",
        });
      } catch (dbErr: any) {
        console.error(`${logPrefix} Failed to record FAILED status in database: ${dbErr.message}`);
      }
    }

    throw err;
  } finally {
    decrementActiveTranscodes();
    triggerGarbageCollection();
    logMemoryUsage("job-finalized", { uploadId });
  }
}

/**
 * Initializes and returns the BullMQ Worker instance with bounded concurrency.
 */
export function createTranscodingWorker(): Worker<TranscodeJobData> {
  const connection = createDedicatedRedisConnection();

  const worker = new Worker<TranscodeJobData>(
    VIDEO_TRANSCODE_QUEUE_NAME,
    processTranscodeJob,
    {
      connection,
      concurrency: WORKER_CONCURRENCY, // Default 1: strictly serial processing to prevent CPU/OOM death on free tier
      limiter: {
        max: 5,
        duration: 1000,
      },
    },
  );

  worker.on("ready", () => {
    console.info(`[Worker] Transcoding worker is connected and ready. Listening on queue '${VIDEO_TRANSCODE_QUEUE_NAME}'.`);
  });

  worker.on("active", (job) => {
    console.info(
      `[Upload: ${job.data?.uploadId}] [Job: ${job.id}] Picked up from queue and active (Attempt ${job.attemptsMade + 1}/${job.opts?.attempts || 3}).`,
    );
  });

  worker.on("progress", (job, progress) => {
    console.info(`[Upload: ${job.data?.uploadId}] [Job: ${job.id}] Progress: ${progress}%`);
  });

  worker.on("completed", (job) => {
    console.info(`[Upload: ${job.data?.uploadId}] [Job: ${job.id}] Completed successfully.`);
  });

  worker.on("failed", async (job, err) => {
    const attemptsMade = job?.attemptsMade ?? 0;
    const maxAttempts = job?.opts?.attempts ?? 3;
    const willRetry = attemptsMade < maxAttempts;
    console.error(
      `[Upload: ${job?.data?.uploadId}] [Job: ${job?.id}] Failed on attempt ${attemptsMade}/${maxAttempts}: ${err.message}. Will retry: ${willRetry}`,
    );

    // If max attempts reached, guarantee FAILED state is persisted in DB
    if (!willRetry && job?.data?.uploadId) {
      try {
        await Upload.where({ id: job.data.uploadId }).update({
          processingStatus: "FAILED",
        });
        console.info(`[Upload: ${job.data.uploadId}] Persisted terminal FAILED state in database.`);
      } catch (dbErr: any) {
        console.error(`[Upload: ${job.data.uploadId}] Error recording FAILED status in database:`, dbErr.message);
      }
    }
  });

  worker.on("stalled", (jobId) => {
    console.warn(`[Worker Warning] Job '${jobId}' stalled. BullMQ will reassign or retry.`);
  });

  let lastWorkerErrTime = 0;
  worker.on("error", (err) => {
    const now = Date.now();
    if (now - lastWorkerErrTime > 10000) {
      lastWorkerErrTime = now;
      console.warn(`[Worker Warning] Worker encountered an error: ${err.message || "Connection issue"}`);
    }
  });

  worker.on("closed", () => {
    console.info("[Worker] Transcoding worker closed.");
  });

  return worker;
}
