import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { readVideoInfo, makeThumbnails, listStoredThumbnails } from "./mediaService";
import { FFMPEG_PATH, TEMP_MEDIA_DIR } from "../config/config";
import { AppError } from "../utils/AppError";

const execFileAsync = promisify(execFile);

describe("Media Inspection & Thumbnail Generation", () => {
  const testDir = path.join(TEMP_MEDIA_DIR, "test_fixtures");
  const validVideoPath = path.join(testDir, "fixture_with_audio.mp4");
  const noAudioVideoPath = path.join(testDir, "fixture_no_audio.mp4");
  const corruptVideoPath = path.join(testDir, "fixture_corrupt.mp4");

  beforeAll(async () => {
    fs.mkdirSync(testDir, { recursive: true });

    // 1. Create a repeatable valid test video with H.264 video and AAC audio (2.5 seconds)
    await execFileAsync(FFMPEG_PATH, [
      "-f",
      "lavfi",
      "-i",
      "testsrc=duration=2.5:size=640x360:rate=30",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=1000:duration=2.5",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-pix_fmt",
      "yuv420p",
      "-y",
      validVideoPath,
    ]);

    // 2. Create a video without audio stream (1.0 second)
    await execFileAsync(FFMPEG_PATH, [
      "-f",
      "lavfi",
      "-i",
      "testsrc=duration=1:size=320x240:rate=24",
      "-an",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-y",
      noAudioVideoPath,
    ]);

    // 3. Create a corrupt/fake video file
    fs.writeFileSync(corruptVideoPath, "This is not a real video stream container header.");
  });

  afterAll(() => {
    try {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup error
    }
  });

  describe("readVideoInfo (FFprobe)", () => {
    it("correctly reads duration, dimensions, framerate, video codec, and audio info", async () => {
      const info = await readVideoInfo(validVideoPath);

      expect(info.duration).toBeGreaterThanOrEqual(2.4);
      expect(info.duration).toBeLessThanOrEqual(2.6);
      expect(info.width).toBe(640);
      expect(info.height).toBe(360);
      expect(info.aspectRatio).toBe("16:9");
      expect(info.frameRate).toBe(30);
      expect(info.videoCodec).toBe("h264");
      expect(info.audio).not.toBeNull();
      expect(info.audio?.codec).toBe("aac");
      expect(info.audio?.channels).toBe(1);
      expect(info.sizeBytes).toBeGreaterThan(0);
    });

    it("handles videos without audio streams without throwing or crashing", async () => {
      const info = await readVideoInfo(noAudioVideoPath);

      expect(info.duration).toBeGreaterThanOrEqual(0.9);
      expect(info.width).toBe(320);
      expect(info.height).toBe(240);
      expect(info.aspectRatio).toBe("4:3");
      expect(info.frameRate).toBe(24);
      expect(info.videoCodec).toBe("h264");
      expect(info.audio).toBeNull(); // Audio is safely null
    });

    it("rejects corrupt or unparseable files before expensive processing begins", async () => {
      await expect(readVideoInfo(corruptVideoPath)).rejects.toThrow(AppError);
    });

    it("rejects non-existent file paths", async () => {
      await expect(readVideoInfo(path.join(testDir, "non_existent.mp4"))).rejects.toThrow(AppError);
    });
  });

  describe("makeThumbnails (FFmpeg)", () => {
    it("extracts candidate frames and resizes to consistent thumbnail dimensions", async () => {
      const result = await makeThumbnails({
        uploadId: "test_upload_1",
        channelId: "test_channel_1",
        sourceFilePath: validVideoPath,
        candidateCount: 3,
        targetWidth: 640,
        targetHeight: 360,
        updateDatabase: false,
      });

      expect(result.uploadId).toBe("test_upload_1");
      expect(result.defaultThumbnailUrl).toBeTruthy();
      expect(result.candidateThumbnails.length).toBeGreaterThan(0);

      // Verify each candidate is a valid JPEG image file
      for (const candidate of result.candidateThumbnails) {
        expect(candidate.timestampSeconds).toBeGreaterThanOrEqual(0);
        expect(candidate.storageKey).toContain("thumbnails/test_channel_1/test_upload_1/");
      }
    });

    it("handles short videos gracefully", async () => {
      const result = await makeThumbnails({
        uploadId: "test_upload_short",
        channelId: "test_channel_1",
        sourceFilePath: noAudioVideoPath,
        candidateCount: 2,
        updateDatabase: false,
      });

      expect(result.candidateThumbnails.length).toBeGreaterThan(0);
      expect(result.defaultThumbnailUrl).toBeTruthy();
    });

    it("always cleans up temporary scratch directory even on failure", async () => {
      const scratchSubdirsBefore = fs.readdirSync(TEMP_MEDIA_DIR);

      // Trigger intentional failure with invalid corrupt video
      try {
        await makeThumbnails({
          uploadId: "test_fail_cleanup",
          channelId: "test_channel_1",
          sourceFilePath: corruptVideoPath,
          updateDatabase: false,
        });
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppError);
      }

      const scratchSubdirsAfter = fs.readdirSync(TEMP_MEDIA_DIR);
      // No leaked scratch folders starting with thumb_test_fail_cleanup
      const leaked = scratchSubdirsAfter.filter((f) => f.startsWith("thumb_test_fail_cleanup"));
      expect(leaked.length).toBe(0);
    });
  });

  describe("listStoredThumbnails (Schema-Compliant)", () => {
    it(
      "returns thumbnail list structure safely without requiring database relation",
      async () => {
        const result = await listStoredThumbnails("test_channel_1", "test_video_1");
        expect(result).toHaveProperty("activeThumbnailUrl");
        expect(result).toHaveProperty("thumbnails");
        expect(Array.isArray(result.thumbnails)).toBe(true);
      },
      { timeout: 15000 },
    );
  });
});
