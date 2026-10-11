import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import {
  determineTargetRenditions,
  buildMasterPlaylist,
  verifyHlsPackageLocal,
  encodeRenditionHls,
  processVideoHlsPipeline,
  cleanScratchDirectory,
  validateUploadRecord,
} from "./transcodingService";
import {
  getEligibleRenditions,
  STANDARD_QUALITY_LADDER,
} from "../config/transcodingProfiles";
import { FFMPEG_PATH, TEMP_MEDIA_DIR } from "../config/config";
import { AppError } from "../utils/AppError";
import { db } from "../prisma/db";

const execFileAsync = promisify(execFile);

describe("FFmpeg Transcoding & Adaptive Streaming Pipeline", () => {
  const testDir = path.join(TEMP_MEDIA_DIR, "transcode_test_fixtures");
  const valid360pVideoPath = path.join(testDir, "fixture_360p.mp4");
  const valid240pVideoPath = path.join(testDir, "fixture_240p.mp4");
  const noAudioVideoPath = path.join(testDir, "fixture_no_audio.mp4");
  const veryShortVideoPath = path.join(testDir, "fixture_very_short.mp4");
  const corruptVideoPath = path.join(testDir, "fixture_corrupt.mp4");

  beforeAll(async () => {
    fs.mkdirSync(testDir, { recursive: true });

    // 1. Create a 360p video with audio (2.5 seconds)
    await execFileAsync(FFMPEG_PATH, [
      "-f", "lavfi", "-i", "testsrc=duration=2.5:size=640x360:rate=30",
      "-f", "lavfi", "-i", "sine=frequency=1000:duration=2.5",
      "-c:v", "libx264", "-preset", "ultrafast",
      "-c:a", "aac", "-pix_fmt", "yuv420p",
      "-y", valid360pVideoPath,
    ]);

    // 2. Create a sub-360p video (320x240, 2.0 seconds)
    await execFileAsync(FFMPEG_PATH, [
      "-f", "lavfi", "-i", "testsrc=duration=2.0:size=320x240:rate=24",
      "-f", "lavfi", "-i", "sine=frequency=800:duration=2.0",
      "-c:v", "libx264", "-preset", "ultrafast",
      "-c:a", "aac", "-pix_fmt", "yuv420p",
      "-y", valid240pVideoPath,
    ]);

    // 3. Create a video without audio (1.5 seconds)
    await execFileAsync(FFMPEG_PATH, [
      "-f", "lavfi", "-i", "testsrc=duration=1.5:size=640x360:rate=30",
      "-an",
      "-c:v", "libx264", "-preset", "ultrafast",
      "-pix_fmt", "yuv420p",
      "-y", noAudioVideoPath,
    ]);

    // 4. Create an extremely short video (0.8 seconds)
    await execFileAsync(FFMPEG_PATH, [
      "-f", "lavfi", "-i", "testsrc=duration=0.8:size=640x360:rate=30",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=0.8",
      "-c:v", "libx264", "-preset", "ultrafast",
      "-c:a", "aac", "-pix_fmt", "yuv420p",
      "-y", veryShortVideoPath,
    ]);

    // 5. Corrupt file
    fs.writeFileSync(corruptVideoPath, "Not a valid MP4 container or video stream");
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

  // ==========================================================================
  // 1. Resolution, Bitrate Ladder & Anti-Upscaling Rules
  // ==========================================================================
  describe("Quality Ladder & Anti-Upscaling Rules", () => {
    it("never upscales a 360p source to 720p or 1080p", () => {
      const renditions = getEligibleRenditions(640, 360);
      expect(renditions.length).toBe(1);
      expect(renditions[0]?.name).toBe("360p");
      expect(renditions.some((r) => r.name === "1080p")).toBe(false);
      expect(renditions.some((r) => r.name === "720p")).toBe(false);
      expect(renditions.some((r) => r.name === "480p")).toBe(false);
    });

    it("generates 720p, 480p, and 360p for a 720p source without upscaling to 1080p", () => {
      const renditions = getEligibleRenditions(1280, 720);
      expect(renditions.map((r) => r.name)).toEqual(["720p", "480p", "360p"]);
      expect(renditions.some((r) => r.name === "1080p")).toBe(false);
    });

    it("generates full quality ladder for a 1080p source", () => {
      const renditions = getEligibleRenditions(1920, 1080);
      expect(renditions.map((r) => r.name)).toEqual(["1080p", "720p", "480p", "360p"]);
    });

    it("handles source resolutions below 360p (e.g. 240p) with a custom baseline profile without upscaling", () => {
      const renditions = getEligibleRenditions(320, 240);
      expect(renditions.length).toBe(1);
      expect(renditions[0]?.name).toBe("240p");
      expect(renditions[0]?.height).toBe(240);
      expect(renditions[0]?.videoBitrate).toBe("400k");
      // Never upscale to 360p or above
      expect(renditions.some((r) => r.height > 240)).toBe(false);
    });
  });

  // ==========================================================================
  // 2. Master Playlist Authoring & Formatting
  // ==========================================================================
  describe("Master Playlist Authoring (RFC 8216 & Apple Guidance)", () => {
    it("generates compliant master playlist with BANDWIDTH, RESOLUTION, and relative paths", () => {
      const outputDir = path.join(testDir, "master_test_out");
      fs.mkdirSync(outputDir, { recursive: true });

      const ladder = getEligibleRenditions(1280, 720);
      const masterPath = buildMasterPlaylist(outputDir, ladder, 30);

      expect(fs.existsSync(masterPath)).toBe(true);
      const content = fs.readFileSync(masterPath, "utf8");

      expect(content).toContain("#EXTM3U");
      expect(content).toContain("#EXT-X-VERSION:3");
      expect(content).toContain("#EXT-X-INDEPENDENT-SEGMENTS");
      expect(content).toContain("#EXT-X-STREAM-INF:");
      expect(content).toContain("RESOLUTION=1280x720");
      expect(content).toContain("RESOLUTION=640x360");
      expect(content).toContain('CODECS="avc1.');
      expect(content).toContain("720p/index.m3u8");
      expect(content).toContain("360p/index.m3u8");

      // Verify descending bandwidth order (highest quality first)
      const lines = content.split("\n");
      const idx720 = lines.findIndex((l) => l.includes("720p/index.m3u8"));
      const idx360 = lines.findIndex((l) => l.includes("360p/index.m3u8"));
      expect(idx720).toBeLessThan(idx360);
    });
  });

  // ==========================================================================
  // 3. Single Rendition HLS Encoding & Segment Verification
  // ==========================================================================
  describe("encodeRenditionHls (FFmpeg)", () => {
    it("transcodes video to HLS with valid ~6s target segments and playlist terminator", async () => {
      const outputDir = path.join(testDir, "rendition_encode_test");
      fs.mkdirSync(outputDir, { recursive: true });

      const profile = STANDARD_QUALITY_LADDER.find((p) => p.name === "360p")!;
      const result = await encodeRenditionHls({
        sourcePath: valid360pVideoPath,
        rendition: profile,
        outputDir,
        frameRate: 30,
        hasAudio: true,
      });

      expect(fs.existsSync(result.playlistPath)).toBe(true);
      expect(result.segmentPaths.length).toBeGreaterThan(0);

      const playlistContent = fs.readFileSync(result.playlistPath, "utf8");
      expect(playlistContent).toContain("#EXT-X-PLAYLIST-TYPE:VOD");
      expect(playlistContent).toContain("#EXT-X-ENDLIST");
      expect(playlistContent).toContain("#EXT-X-TARGETDURATION:");

      // Verify that segment files exist and have non-zero size
      for (const segPath of result.segmentPaths) {
        expect(fs.existsSync(segPath)).toBe(true);
        expect(fs.statSync(segPath).size).toBeGreaterThan(0);
      }
    });

    it("synthesizes silent stereo audio for videos without audio stream without crashing", async () => {
      const outputDir = path.join(testDir, "no_audio_encode_test");
      fs.mkdirSync(outputDir, { recursive: true });

      const profile = STANDARD_QUALITY_LADDER.find((p) => p.name === "360p")!;
      const result = await encodeRenditionHls({
        sourcePath: noAudioVideoPath,
        rendition: profile,
        outputDir,
        frameRate: 30,
        hasAudio: false, // Explicitly no audio
      });

      expect(fs.existsSync(result.playlistPath)).toBe(true);
      expect(result.segmentPaths.length).toBeGreaterThan(0);

      const playlistContent = fs.readFileSync(result.playlistPath, "utf8");
      expect(playlistContent).toContain("#EXT-X-ENDLIST");
    });
  });

  // ==========================================================================
  // 4. Local Package Verification & Error Detection
  // ==========================================================================
  describe("verifyHlsPackageLocal", () => {
    it("passes verification when all playlists, terminators, and segment files exist", () => {
      const outputDir = path.join(testDir, "verify_pass_test");
      const renditionDir = path.join(outputDir, "360p");
      fs.mkdirSync(renditionDir, { recursive: true });

      // Write mock valid segment
      fs.writeFileSync(path.join(renditionDir, "segment_000.ts"), Buffer.alloc(1024, 0x47));

      // Write mock valid rendition playlist
      fs.writeFileSync(
        path.join(renditionDir, "index.m3u8"),
        `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXT-X-TARGETDURATION:6\n#EXTINF:2.5,\nsegment_000.ts\n#EXT-X-ENDLIST\n`,
      );

      // Write mock master playlist
      const profile = STANDARD_QUALITY_LADDER.find((p) => p.name === "360p")!;
      buildMasterPlaylist(outputDir, [profile], 30);

      expect(() => verifyHlsPackageLocal(outputDir, [profile])).not.toThrow();
    });

    it("detects missing segment file and throws descriptive AppError", () => {
      const outputDir = path.join(testDir, "verify_fail_test");
      const renditionDir = path.join(outputDir, "360p");
      fs.mkdirSync(renditionDir, { recursive: true });

      // Playlist references segment_missing.ts which does not exist
      fs.writeFileSync(
        path.join(renditionDir, "index.m3u8"),
        `#EXTM3U\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:6.0,\nsegment_missing.ts\n#EXT-X-ENDLIST\n`,
      );

      const profile = STANDARD_QUALITY_LADDER.find((p) => p.name === "360p")!;
      buildMasterPlaylist(outputDir, [profile], 30);

      expect(() => verifyHlsPackageLocal(outputDir, [profile])).toThrow(AppError);
    });
  });

  // ==========================================================================
  // 5. End-to-End Transcoding Pipeline
  // ==========================================================================
  describe("processVideoHlsPipeline (End-to-End)", () => {
    it("processes valid video, respects anti-upscaling, generates HLS, and cleans up scratch directory", async () => {
      const mockUpload = {
        id: "upl_pipeline_valid",
        channelId: "chan_test",
        title: "Adaptive Streaming Test",
        processingStatus: "PENDING",
        isDeleted: false,
        hlsManifestUrl: null,
        thumbnailUrl: null,
        channel: { id: "chan_test", userId: "usr_1" },
      };

      const originalWhere = db.orm.public.Upload.where;
      const originalCreate = db.orm.public.Video.create;

      let dbUpdatedStatus = "";
      let dbUpdatedManifest = "";
      const createdVideos: any[] = [];

      (db.orm.public.Upload as any).where = () => ({
        include: () => ({
          first: async () => mockUpload,
        }),
        first: async () => mockUpload,
        update: async (data: any) => {
          if (data.processingStatus) dbUpdatedStatus = data.processingStatus;
          if (data.hlsManifestUrl) dbUpdatedManifest = data.hlsManifestUrl;
          return { ...mockUpload, ...data };
        },
      });

      (db.orm.public.Video as any).create = async (data: any) => {
        createdVideos.push(data);
        return { id: "vid_" + createdVideos.length, ...data };
      };

      try {
        const scratchBefore = fs.readdirSync(TEMP_MEDIA_DIR);

        const result = await processVideoHlsPipeline({
          uploadId: "upl_pipeline_valid",
          channelId: "chan_test",
          sourceFilePath: valid360pVideoPath, // Direct 360p source
        });

        expect(result.uploadId).toBe("upl_pipeline_valid");
        expect(result.masterManifestUrl).toContain("master.m3u8");
        expect(result.renditions.length).toBe(1);
        expect(result.renditions[0]?.resolution).toBe("360p");
        expect(result.durationSeconds).toBeGreaterThanOrEqual(2.4);

        // Verify DB was updated
        expect(dbUpdatedStatus).toBe("COMPLETED");
        expect(dbUpdatedManifest).toContain("master.m3u8");
        expect(createdVideos.length).toBe(1);
        expect(createdVideos[0]?.resolution).toBe("360p");

        // Verify scratch directory was completely cleaned up
        const scratchAfter = fs.readdirSync(TEMP_MEDIA_DIR);
        const leaked = scratchAfter.filter((f) => f.startsWith("transcode_upl_pipeline_valid"));
        expect(leaked.length).toBe(0);
      } finally {
        (db.orm.public.Upload as any).where = originalWhere;
        (db.orm.public.Video as any).create = originalCreate;
      }
    });

    it("processes very short video (< 1s) successfully without crashing", async () => {
      const mockUpload = {
        id: "upl_pipeline_short",
        channelId: "chan_test",
        processingStatus: "PENDING",
        isDeleted: false,
        channel: { id: "chan_test", userId: "usr_1" },
      };

      const originalWhere = db.orm.public.Upload.where;
      (db.orm.public.Upload as any).where = () => ({
        include: () => ({ first: async () => mockUpload }),
        first: async () => mockUpload,
        update: async (data: any) => ({ ...mockUpload, ...data }),
      });

      try {
        const result = await processVideoHlsPipeline({
          uploadId: "upl_pipeline_short",
          channelId: "chan_test",
          sourceFilePath: veryShortVideoPath,
        });

        expect(result.uploadId).toBe("upl_pipeline_short");
        expect(result.renditions.length).toBeGreaterThan(0);
      } finally {
        (db.orm.public.Upload as any).where = originalWhere;
      }
    });

    it("rejects corrupt media input and guarantees scratch cleanup", async () => {
      const mockUpload = {
        id: "upl_pipeline_corrupt",
        channelId: "chan_test",
        processingStatus: "PENDING",
        isDeleted: false,
        channel: { id: "chan_test", userId: "usr_1" },
      };

      const originalWhere = db.orm.public.Upload.where;
      (db.orm.public.Upload as any).where = () => ({
        include: () => ({ first: async () => mockUpload }),
        first: async () => mockUpload,
        update: async (data: any) => ({ ...mockUpload, ...data }),
      });

      try {
        await expect(
          processVideoHlsPipeline({
            uploadId: "upl_pipeline_corrupt",
            channelId: "chan_test",
            sourceFilePath: corruptVideoPath,
          }),
        ).rejects.toThrow(AppError);

        // Ensure cleanup occurred
        const scratchAfter = fs.readdirSync(TEMP_MEDIA_DIR);
        const leaked = scratchAfter.filter((f) => f.startsWith("transcode_upl_pipeline_corrupt"));
        expect(leaked.length).toBe(0);
      } finally {
        (db.orm.public.Upload as any).where = originalWhere;
      }
    });

    it("skips re-processing idempotently if upload is already COMPLETED", async () => {
      const mockCompleted = {
        id: "upl_pipeline_done",
        channelId: "chan_test",
        processingStatus: "COMPLETED",
        isDeleted: false,
        hlsManifestUrl: "https://storage.vion.local/processed-videos/master.m3u8",
        channel: { id: "chan_test", userId: "usr_1" },
      };

      const originalWhere = db.orm.public.Upload.where;
      (db.orm.public.Upload as any).where = () => ({
        include: () => ({ first: async () => mockCompleted }),
        first: async () => mockCompleted,
      });

      try {
        const result = await processVideoHlsPipeline({
          uploadId: "upl_pipeline_done",
          channelId: "chan_test",
          sourceFilePath: valid360pVideoPath,
        });

        expect(result.uploadId).toBe("upl_pipeline_done");
        expect(result.masterManifestUrl).toBe(mockCompleted.hlsManifestUrl);
      } finally {
        (db.orm.public.Upload as any).where = originalWhere;
      }
    });
  });
});
