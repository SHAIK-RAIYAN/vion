import { db } from "../prisma/db";
import {
  isRedisConfigured,
  isStorageConfigured,
  STORAGE_RAW_BUCKET,
} from "../config/config";
import {
  getTranscodeJobByUploadId,
  enqueueTranscodeJob,
} from "../queue/videoQueue";
import * as storageService from "../services/storageService";

const { Upload } = db.orm.public;

/**
 * Reconciles database state with the Redis BullMQ queue on worker startup.
 *
 * Why this is necessary on zero-budget / free-tier deployments:
 * 1. Free Redis instances may restart or flush in-memory jobs.
 * 2. If a container is killed while processing (OOM or Render deployment),
 *    the upload record may remain stuck in TRANSCODING or UPLOADING without an active job.
 * 3. Safe Recovery: Reverts interrupted TRANSCODING jobs back to UPLOADING,
 *    verifies the raw file exists in storage, and idempotently enqueues missing jobs.
 * 4. Never touches COMPLETED or soft-deleted records.
 *
 * Returns the number of successfully re-enqueued jobs.
 */
export async function reconcileUploadQueue(): Promise<number> {
  if (!isRedisConfigured()) {
    console.info("[Queue Reconciliation] Redis is not configured; skipping queue reconciliation.");
    return 0;
  }

  console.info("[Queue Reconciliation] Scanning database for uncompleted video uploads...");

  try {
    // 1. Fetch non-deleted uploads that may be pending or interrupted
    const pendingUploads = await Upload.where({
      isDeleted: false,
    })
      .include("channel", (c) => c.select("id"))
      .all();

    const candidates = pendingUploads.filter(
      (u) => u.processingStatus === "UPLOADING" || u.processingStatus === "TRANSCODING",
    );

    if (candidates.length === 0) {
      console.info("[Queue Reconciliation] All uploads are in terminal states. No dropped jobs detected.");
      return 0;
    }

    console.info(`[Queue Reconciliation] Found ${candidates.length} candidate upload(s). Checking queue states...`);
    let reEnqueuedCount = 0;

    for (const upload of candidates) {
      // If previous container was terminated mid-transcoding, revert status to UPLOADING
      // so the user/UI knows it is queued and not currently active
      if (upload.processingStatus === "TRANSCODING") {
        await Upload.where({ id: upload.id }).update({
          processingStatus: "UPLOADING",
        });
        upload.processingStatus = "UPLOADING";
        console.info(`[Queue Reconciliation] Reverted interrupted upload ${upload.id} from TRANSCODING to UPLOADING.`);
      }

      // Check if job is already waiting or active in BullMQ
      try {
        const existingJob = await getTranscodeJobByUploadId(upload.id);
        if (existingJob) {
          const state = await existingJob.getState();
          if (state === "waiting" || state === "active" || state === "delayed") {
            console.info(`[Queue Reconciliation] Upload ${upload.id} already has a BullMQ job in state '${state}'. Skipping duplicate.`);
            continue;
          }
        }
      } catch (err: any) {
        console.warn(`[Queue Reconciliation] Notice checking job for ${upload.id}: ${err.message}`);
      }

      // Verify that raw source video exists in Supabase Storage before queueing
      const folder = `raw/${upload.channel.id}/${upload.id}`;
      if (isStorageConfigured()) {
        try {
          const files = await storageService.listFiles(STORAGE_RAW_BUCKET, folder);
          const rawFile = files && files.length > 0 ? files[0] : null;
          if (!rawFile) {
            console.warn(`[Queue Reconciliation] Upload ${upload.id} has no source file in '${folder}'. Marking FAILED.`);
            await Upload.where({ id: upload.id }).update({
              processingStatus: "FAILED",
            });
            continue;
          }

          const rawVideoKey = `${folder}/${rawFile.name}`;

          // Enqueue with deterministic idempotent job ID: transcode-${uploadId}
          await enqueueTranscodeJob({
            uploadId: upload.id,
            channelId: upload.channel.id,
            rawVideoKey,
            title: upload.title,
          });

          reEnqueuedCount++;
          console.info(`[Queue Reconciliation] Successfully recovered and re-enqueued upload ${upload.id} ("${upload.title}").`);
        } catch (storageErr: any) {
          console.warn(`[Queue Reconciliation] Storage verification failed for ${upload.id}: ${storageErr.message}`);
        }
      } else {
        console.warn(`[Queue Reconciliation] Storage is not configured; cannot verify source file for ${upload.id}.`);
      }
    }

    console.info(`[Queue Reconciliation] Reconciliation completed. Recovered ${reEnqueuedCount} job(s).`);
    return reEnqueuedCount;
  } catch (err: any) {
    console.error("[Queue Reconciliation Error]:", err?.message || err);
    return 0;
  }
}
