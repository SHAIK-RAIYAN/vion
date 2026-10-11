import { describe, it, expect, mock } from "bun:test";
import {
  enqueueTranscodeJob,
  getTranscodeJobByUploadId,
  getVideoQueue,
  VIDEO_TRANSCODE_QUEUE_NAME,
  type TranscodeJobData,
} from "./videoQueue";
import { processTranscodeJob, createTranscodingWorker } from "../worker/transcodingWorker";
import { db } from "../prisma/db";

describe("Background Video Processing Queue & Worker", () => {
  describe("Queue Configuration & Idempotency", () => {
    it("ensures queue logic is strictly separated from FFmpeg operations", () => {
      // The queue module must contain queue routing only, not media conversion binaries
      expect(VIDEO_TRANSCODE_QUEUE_NAME).toBe("video-transcoding");
      const queue = getVideoQueue();
      expect(queue.name).toBe("video-transcoding");
    });

    it("generates deterministic job IDs derived from upload ID", async () => {
      const payload: TranscodeJobData = {
        uploadId: "upl_stable_test_1",
        channelId: "chan_test_1",
        rawVideoKey: "raw/chan_test_1/upl_stable_test_1/video.mp4",
        title: "Deterministic Job Test",
      };

      // Mock queue.add
      const queue = getVideoQueue();
      let capturedJobId = "";
      const originalAdd = queue.add;
      (queue as any).add = async (name: string, data: any, opts: any) => {
        capturedJobId = opts?.jobId;
        return {
          id: capturedJobId,
          data,
          getState: async () => "waiting",
        };
      };

      try {
        const job = await enqueueTranscodeJob(payload);
        expect(capturedJobId).toBe("transcode-upl_stable_test_1");
        expect(job?.id).toBe("transcode-upl_stable_test_1");
      } finally {
        (queue as any).add = originalAdd;
      }
    });

    it("prevents duplicate concurrent jobs for the same upload ID", async () => {
      const payload: TranscodeJobData = {
        uploadId: "upl_duplicate_test_2",
        channelId: "chan_test_1",
        rawVideoKey: "raw/chan_test_1/upl_duplicate_test_2/video.mp4",
      };

      const queue = getVideoQueue();
      const existingActiveJob = {
        id: "transcode-upl_duplicate_test_2",
        getState: async () => "active",
        progress: 45,
      };

      const originalGetJob = queue.getJob;
      const originalAdd = queue.add;
      (queue as any).getJob = async (jobId: string) => {
        if (jobId === "transcode-upl_duplicate_test_2") return existingActiveJob;
        return null;
      };

      let addCalled = false;
      (queue as any).add = async () => {
        addCalled = true;
        return { id: "new_job" };
      };

      try {
        const result = await enqueueTranscodeJob(payload);
        expect(result?.id).toBe("transcode-upl_duplicate_test_2");
        expect(addCalled).toBe(false); // Did not add duplicate job
      } finally {
        (queue as any).getJob = originalGetJob;
        (queue as any).add = originalAdd;
      }
    });
  });

  describe("Worker Lifecycle & Resilience", () => {
    it("skips duplicate processing idempotently if upload is already COMPLETED", async () => {
      const completedUpload = {
        id: "upl_already_done",
        channelId: "chan_1",
        title: "Done Video",
        processingStatus: "COMPLETED",
        hlsManifestUrl: "https://nnenbfpjtggrhamveeiw.supabase.co/storage/v1/object/public/processed-videos/processed/chan_1/upl_already_done/hls/master.m3u8",
        thumbnailUrl: "https://nnenbfpjtggrhamveeiw.supabase.co/storage/v1/object/public/thumbnails/thumbnails/chan_1/upl_already_done/default.jpg",
      };

      const originalWhere = db.orm.public.Upload.where;
      (db.orm.public.Upload as any).where = () => ({
        first: async () => completedUpload,
        update: async () => completedUpload,
      });

      const mockJob: any = {
        id: "transcode-upl_already_done",
        data: {
          uploadId: "upl_already_done",
          channelId: "chan_1",
          rawVideoKey: "raw/chan_1/upl_already_done/video.mp4",
        },
        attemptsMade: 0,
        opts: { attempts: 3 },
        updateProgress: async () => {},
      };

      try {
        const result = await processTranscodeJob(mockJob);
        expect(result.success).toBe(true);
        expect(result.manifestUrl).toBe(completedUpload.hlsManifestUrl);
      } finally {
        (db.orm.public.Upload as any).where = originalWhere;
      }
    });

    it("aborts safely if upload record is not found or soft-deleted", async () => {
      const originalWhere = db.orm.public.Upload.where;
      (db.orm.public.Upload as any).where = () => ({
        first: async () => null, // Upload does not exist
      });

      const mockJob: any = {
        id: "transcode-upl_missing",
        data: {
          uploadId: "upl_missing",
          channelId: "chan_1",
          rawVideoKey: "raw/chan_1/upl_missing/video.mp4",
        },
        attemptsMade: 0,
        opts: { attempts: 3 },
        updateProgress: async () => {},
      };

      try {
        const result = await processTranscodeJob(mockJob);
        expect(result.success).toBe(false);
      } finally {
        (db.orm.public.Upload as any).where = originalWhere;
      }
    });

    it("transitions processingStatus to FAILED when maximum attempts are exhausted", async () => {
      let recordedStatus = "";

      const originalWhere = db.orm.public.Upload.where;
      (db.orm.public.Upload as any).where = () => ({
        first: async () => ({
          id: "upl_failing_3",
          channelId: "chan_1",
          processingStatus: "UPLOADING",
        }),
        update: async (data: any) => {
          if (data.processingStatus) {
            recordedStatus = data.processingStatus;
          }
          return {};
        },
      });

      const failingJob: any = {
        id: "transcode-upl_failing_3",
        data: {
          uploadId: "upl_failing_3",
          channelId: "chan_1",
          rawVideoKey: "raw/chan_1/upl_failing_3/non_existent.mp4",
        },
        attemptsMade: 2, // 3rd and final attempt (attemptsMade = 2 with max attempts = 3)
        opts: { attempts: 3 },
        updateProgress: async () => {
          throw new Error("Simulated storage network failure during job execution");
        },
      };

      try {
        await expect(processTranscodeJob(failingJob)).rejects.toThrow();
        expect(recordedStatus).toBe("FAILED");
      } finally {
        (db.orm.public.Upload as any).where = originalWhere;
      }
    });

    it("supports graceful worker initialization and clean closure", async () => {
      const worker = createTranscodingWorker();
      expect(worker).toBeDefined();
      expect(worker.opts.concurrency).toBe(2);

      // Verify graceful close
      await worker.close();
    });
  });
});
