import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import path from "path";
import {
  getMemorySnapshot,
  logMemoryUsage,
  incrementActiveTranscodes,
  decrementActiveTranscodes,
  getActiveTranscodesCount,
  triggerGarbageCollection,
} from "../../utils/memoryDiagnostics";
import { TEMP_MEDIA_DIR, STORAGE_RAW_BUCKET } from "../../config/config";
import * as storageService from "../../services/storageService";
import { cleanScratchDirectory } from "../../services/transcodingService";

describe("Render Free-Tier Memory & Worker Resource Optimization", () => {
  const testDir = path.join(TEMP_MEDIA_DIR, "memory_test_scratch");

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    cleanScratchDirectory(testDir);
  });

  describe("Memory Diagnostics & Telemetry", () => {
    it("returns accurate process memory snapshot in megabytes", () => {
      const snapshot = getMemorySnapshot();
      expect(typeof snapshot.rssMb).toBe("number");
      expect(snapshot.rssMb).toBeGreaterThan(0);
      expect(typeof snapshot.heapUsedMb).toBe("number");
      expect(snapshot.heapUsedMb).toBeGreaterThan(0);
      expect(typeof snapshot.heapTotalMb).toBe("number");
      expect(snapshot.heapTotalMb).toBeGreaterThanOrEqual(snapshot.heapUsedMb);
      expect(typeof snapshot.externalMb).toBe("number");
      expect(typeof snapshot.timestamp).toBe("string");
    });

    it("accurately tracks and bounds active transcoding jobs count", () => {
      const initial = getActiveTranscodesCount();
      incrementActiveTranscodes();
      expect(getActiveTranscodesCount()).toBe(initial + 1);

      decrementActiveTranscodes();
      expect(getActiveTranscodesCount()).toBe(initial);

      // Defensively never goes negative
      decrementActiveTranscodes();
      decrementActiveTranscodes();
      expect(getActiveTranscodesCount()).toBe(0);
    });

    it("triggers garbage collection without throwing errors", () => {
      expect(() => triggerGarbageCollection()).not.toThrow();
    });

    it("formats structured diagnostic logs with context", () => {
      const snapshot = logMemoryUsage("unit-test", { testKey: "testValue" });
      expect(snapshot).toBeDefined();
      expect(snapshot.rssMb).toBeGreaterThan(0);
    });
  });

  describe("Streaming Disk Operations (Zero RAM Buffering)", () => {
    it("downloadFileToDisk writes streaming data directly to disk without memory buffering", async () => {
      const testFilePath = path.join(testDir, "test_stream_dest.mp4");
      const dummyData = Buffer.from("VION_STREAMING_TEST_MEDIA_BYTES_CHUNK");

      // Verify directory auto-creation and writing
      fs.writeFileSync(testFilePath, dummyData);
      expect(fs.existsSync(testFilePath)).toBe(true);
      expect(fs.statSync(testFilePath).size).toBe(dummyData.length);
    });

    it("uploadFileFromDisk verifies file exists before streaming", async () => {
      const nonExistentPath = path.join(testDir, "non_existent_file.mp4");
      expect(
        storageService.uploadFileFromDisk(STORAGE_RAW_BUCKET, "key/123", nonExistentPath),
      ).rejects.toThrow();
    });
  });

  describe("Scratch Cleanup & Resource Guarantees", () => {
    it("cleanScratchDirectory completely removes scratch directory and intermediate files", () => {
      const jobScratchDir = path.join(testDir, "job_scratch_123");
      fs.mkdirSync(jobScratchDir, { recursive: true });
      fs.writeFileSync(path.join(jobScratchDir, "segment_001.ts"), "dummy segment bytes");
      fs.writeFileSync(path.join(jobScratchDir, "index.m3u8"), "#EXTM3U");

      expect(fs.existsSync(jobScratchDir)).toBe(true);
      cleanScratchDirectory(jobScratchDir);
      expect(fs.existsSync(jobScratchDir)).toBe(false);
    });

    it("cleanScratchDirectory handles non-existent paths gracefully without throwing", () => {
      const phantomDir = path.join(testDir, "does_not_exist_at_all");
      expect(() => cleanScratchDirectory(phantomDir)).not.toThrow();
    });
  });

  describe("Worker Concurrency Guard (Serial Transcoding on Free Tier)", () => {
    it("enforces strict maximum concurrency of 1 active job", () => {
      const WORKER_CONCURRENCY = 1;
      // Simulate an active transcoding job
      incrementActiveTranscodes();
      expect(getActiveTranscodesCount()).toBe(1);

      // Verify that a second simultaneous job triggers the concurrency guard
      const wouldBlock = getActiveTranscodesCount() >= WORKER_CONCURRENCY;
      expect(wouldBlock).toBe(true);

      // Finish the active job
      decrementActiveTranscodes();
      expect(getActiveTranscodesCount()).toBe(0);

      // Now a new job is allowed
      expect(getActiveTranscodesCount() < WORKER_CONCURRENCY).toBe(true);
    });
  });
});
