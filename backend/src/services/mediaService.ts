import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  FFMPEG_PATH,
  FFPROBE_PATH,
  TEMP_MEDIA_DIR,
  STORAGE_RAW_BUCKET,
  STORAGE_THUMBNAILS_BUCKET,
  MAX_UPLOAD_SIZE_BYTES,
  isStorageConfigured,
} from "../config/config";
import { AppError } from "../utils/AppError";
import * as storageService from "./storageService";
import { db } from "../prisma/db";

const execFileAsync = promisify(execFile);

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface AudioStreamInfo {
  codec: string;
  channels: number;
  sampleRate: number;
  bitrate?: number;
}

export interface VideoInfo {
  duration: number; // Duration in seconds
  width: number;
  height: number;
  aspectRatio: string; // e.g. "16:9" or "4:3"
  frameRate: number; // e.g. 29.97, 30, 60
  videoCodec: string; // e.g. "h264", "hevc", "vp9"
  audio: AudioStreamInfo | null; // null if video has no audio track
  formatName: string; // e.g. "mov,mp4,m4a,3gp,3g2,mj2"
  sizeBytes: number;
  bitrate: number;
}

export interface MakeThumbnailsOptions {
  uploadId: string;
  channelId: string;
  sourceFilePath?: string; // Direct local file path if already downloaded
  sourceStorageKey?: string; // Supabase Storage raw key if remote
  candidateCount?: number; // Number of candidate frames to generate (default: 3)
  targetWidth?: number; // Thumbnail target width (default: 1280)
  targetHeight?: number; // Thumbnail target height (default: 720)
  updateDatabase?: boolean; // Whether to update Upload.thumbnailUrl in Neon DB (default: true)
}

export interface MakeThumbnailsResult {
  uploadId: string;
  defaultThumbnailUrl: string;
  candidateThumbnails: {
    index: number;
    timestampSeconds: number;
    storageKey: string;
    publicUrl: string;
    filePath?: string;
  }[];
}

const SUPPORTED_VIDEO_CODECS = [
  "h264",
  "hevc",
  "h265",
  "vp8",
  "vp9",
  "av1",
  "mpeg4",
  "mjpeg",
  "prores",
];

// ============================================================================
// 1. FFprobe Media Inspection Utility
// ============================================================================

/**
 * What FFprobe does:
 * FFprobe analyzes container headers, streams, and packet indexes without
 * decoding the entire video. This makes inspection extremely fast (typically < 50ms)
 * and allows us to validate video duration, dimensions, codecs, and integrity
 * BEFORE triggering costly transcoding jobs.
 */
export async function readVideoInfo(filePath: string): Promise<VideoInfo> {
  if (!fs.existsSync(filePath)) {
    throw new AppError(`Target media file not found on disk: ${filePath}`, 404, "FILE_NOT_FOUND");
  }

  const stat = fs.statSync(filePath);
  if (stat.size === 0) {
    throw new AppError("Media file is empty (0 bytes).", 422, "EMPTY_MEDIA_FILE");
  }

  if (stat.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new AppError(
      `Media file exceeds maximum size limit of ${Math.round(MAX_UPLOAD_SIZE_BYTES / (1024 * 1024))} MB.`,
      413,
      "FILE_TOO_LARGE",
    );
  }

  let stdout = "";
  try {
    const res = await execFileAsync(
      FFPROBE_PATH,
      ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", filePath],
      { timeout: 15000 },
    );
    stdout = res.stdout;
  } catch (err: any) {
    throw new AppError(
      `FFprobe failed to inspect media file: ${err.stderr || err.message || "Corrupt container or unsupported format"}`,
      422,
      "CORRUPT_OR_UNSUPPORTED_MEDIA",
    );
  }

  let probeData: any;
  try {
    probeData = JSON.parse(stdout);
  } catch {
    throw new AppError("Failed to parse FFprobe output metadata.", 500, "PROBE_PARSE_ERROR");
  }

  const streams = probeData.streams || [];
  const format = probeData.format || {};

  // 1. Locate video stream (do not trust file extension as proof of video content)
  const videoStream = streams.find((s: any) => s.codec_type === "video");
  if (!videoStream) {
    throw new AppError("Media file does not contain a valid video stream.", 422, "NO_VIDEO_STREAM");
  }

  const videoCodec = (videoStream.codec_name || "").toLowerCase();
  if (!SUPPORTED_VIDEO_CODECS.includes(videoCodec)) {
    throw new AppError(
      `Unsupported video codec '${videoCodec}'. Supported codecs: ${SUPPORTED_VIDEO_CODECS.join(", ")}`,
      422,
      "UNSUPPORTED_CODEC",
    );
  }

  // 2. Validate dimensions
  const width = Number(videoStream.width);
  const height = Number(videoStream.height);
  if (!width || !height || width <= 0 || height <= 0) {
    throw new AppError("Invalid or zero video dimensions.", 422, "INVALID_DIMENSIONS");
  }

  // 3. Compute duration (prefer container format duration, fallback to stream duration)
  const durationSec = parseFloat(format.duration || videoStream.duration || "0");
  if (!durationSec || durationSec <= 0 || isNaN(durationSec)) {
    throw new AppError("Invalid or zero-length video duration.", 422, "INVALID_DURATION");
  }

  // 4. Compute frame rate from r_frame_rate or avg_frame_rate ("30/1", "30000/1001")
  let frameRate = 0;
  const rawFps = videoStream.r_frame_rate || videoStream.avg_frame_rate;
  if (rawFps && rawFps.includes("/")) {
    const [num, den] = rawFps.split("/").map(Number);
    if (num && den && den > 0) {
      frameRate = Math.round((num / den) * 100) / 100;
    }
  }

  // 5. Audio stream information (do not assume every video has audio)
  const audioStream = streams.find((s: any) => s.codec_type === "audio");
  let audio: AudioStreamInfo | null = null;
  if (audioStream) {
    audio = {
      codec: (audioStream.codec_name || "unknown").toLowerCase(),
      channels: Number(audioStream.channels) || 1,
      sampleRate: Number(audioStream.sample_rate) || 44100,
      bitrate: Number(audioStream.bit_rate) || undefined,
    };
  }

  // Compute aspect ratio
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height);
  const aspectRatio = divisor > 0 ? `${width / divisor}:${height / divisor}` : "16:9";

  return {
    duration: Math.round(durationSec * 1000) / 1000,
    width,
    height,
    aspectRatio,
    frameRate,
    videoCodec,
    audio,
    formatName: format.format_name || "unknown",
    sizeBytes: Number(format.size) || stat.size,
    bitrate: Number(format.bit_rate) || Number(videoStream.bit_rate) || 0,
  };
}

// ============================================================================
// 2. FFmpeg Thumbnail Generation Utility
// ============================================================================

/**
 * Why thumbnails are generated before the page is rendered:
 * Video platforms require immediate poster images for:
 * 1. Home feeds and search result cards without playing video.
 * 2. HTML5 `<video poster="...">` placeholder while video segments buffer.
 * 3. Social media OpenGraph preview metadata.
 *
 * Why temporary files must be cleaned up:
 * Frame extractions and scratch video copies generate intermediate disk files.
 * If orphaned on error or left behind, they will rapidly consume server storage
 * and cause ENOSPC (Out of Space) outages.
 */
export async function makeThumbnails(
  options: MakeThumbnailsOptions,
): Promise<MakeThumbnailsResult> {
  const {
    uploadId,
    channelId,
    sourceFilePath,
    sourceStorageKey,
    candidateCount = 3,
    targetWidth = 1280,
    targetHeight = 720,
    updateDatabase = true,
  } = options;

  // 1. Create unique temporary scratch workspace
  const scratchId = `thumb_${uploadId}_${crypto.randomUUID().slice(0, 8)}`;
  const scratchDir = path.join(TEMP_MEDIA_DIR, scratchId);
  fs.mkdirSync(scratchDir, { recursive: true });

  let localVideoPath = "";
  let downloadedLocally = false;

  try {
    // 2. Obtain local file: use existing local file or download from Supabase Storage
    if (sourceFilePath && fs.existsSync(sourceFilePath)) {
      localVideoPath = sourceFilePath;
    } else if (sourceStorageKey) {
      localVideoPath = path.join(scratchDir, "source_input.mp4");
      const buffer = await storageService.downloadFile(STORAGE_RAW_BUCKET, sourceStorageKey);
      fs.writeFileSync(localVideoPath, buffer);
      downloadedLocally = true;
    } else {
      // Look up files in the upload session folder in storage
      const folder = `raw/${channelId}/${uploadId}`;
      const files = await storageService.listFiles(STORAGE_RAW_BUCKET, folder);
      if (!files || files.length === 0) {
        throw new AppError(
          `No uploaded video found in storage under folder: ${folder}`,
          404,
          "MEDIA_NOT_FOUND",
        );
      }
      const rawFile = files[0];
      if (!rawFile) {
        throw new AppError(`No media file found in storage folder: ${folder}`, 404, "MEDIA_NOT_FOUND");
      }
      const key = `${folder}/${rawFile.name}`;
      localVideoPath = path.join(scratchDir, "source_input.mp4");
      const buffer = await storageService.downloadFile(STORAGE_RAW_BUCKET, key);
      fs.writeFileSync(localVideoPath, buffer);
      downloadedLocally = true;
    }

    // 3. Inspect video with FFprobe to select sensible timestamps
    const videoInfo = await readVideoInfo(localVideoPath);
    const duration = videoInfo.duration;

    // Determine candidate timestamps within video duration
    const timestamps: number[] = [];
    if (duration <= 1.0) {
      // Extremely short video: seek near start
      timestamps.push(Math.min(0.1, duration / 2));
    } else if (duration <= 5.0) {
      // Short video: spread across early, mid, late
      timestamps.push(duration * 0.25, duration * 0.5, duration * 0.75);
    } else {
      // Normal video: extract 3 candidates (15%, 50%, 85%)
      const ratios = [0.15, 0.5, 0.85];
      for (let i = 0; i < Math.min(candidateCount, ratios.length); i++) {
        timestamps.push(Math.round(duration * ratios[i]! * 100) / 100);
      }
    }

    // 4. Extract candidate frames using FFmpeg
    // Aspect ratio filter: scale to fit within target box without distortion,
    // and pad with black borders to preserve standard 16:9 thumbnail frame.
    const scaleFilter = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:black`;

    const candidateResults: MakeThumbnailsResult["candidateThumbnails"] = [];

    for (let i = 0; i < timestamps.length; i++) {
      const ts = timestamps[i]!;
      const candidateFileName = `candidate_${i + 1}.jpg`;
      const candidateLocalPath = path.join(scratchDir, candidateFileName);

      try {
        await execFileAsync(
          FFMPEG_PATH,
          [
            "-ss",
            ts.toString(),
            "-i",
            localVideoPath,
            "-frames:v",
            "1",
            "-update",
            "1",
            "-vf",
            scaleFilter,
            "-q:v",
            "2", // High quality JPEG
            "-y",
            candidateLocalPath,
          ],
          { timeout: 20000 },
        );
      } catch (extractErr: any) {
        // Fallback to timestamp 0.0 if seeking past end failed
        console.warn(`[Media Service] Seek to ${ts}s failed, falling back to 0.0s: ${extractErr.message}`);
        await execFileAsync(
          FFMPEG_PATH,
          [
            "-ss",
            "0.0",
            "-i",
            localVideoPath,
            "-frames:v",
            "1",
            "-update",
            "1",
            "-vf",
            scaleFilter,
            "-q:v",
            "2",
            "-y",
            candidateLocalPath,
          ],
          { timeout: 20000 },
        );
      }

      if (!fs.existsSync(candidateLocalPath) || fs.statSync(candidateLocalPath).size === 0) {
        continue;
      }

      // 5. Upload candidate frame to Supabase Storage
      const storageKey = `thumbnails/${channelId}/${uploadId}/${candidateFileName}`;

      if (!isStorageConfigured()) {
        throw new AppError(
          "Storage service is not configured for thumbnail generation.",
          500,
          "STORAGE_NOT_CONFIGURED",
        );
      }

      const fileBuffer = fs.readFileSync(candidateLocalPath);
      await storageService.uploadFile(STORAGE_THUMBNAILS_BUCKET, storageKey, fileBuffer, {
        contentType: "image/jpeg",
        upsert: true,
      });
      const publicUrl = storageService.getPublicUrl(STORAGE_THUMBNAILS_BUCKET, storageKey);

      candidateResults.push({
        index: i + 1,
        timestampSeconds: ts,
        storageKey,
        publicUrl,
        filePath: candidateLocalPath,
      });
    }

    if (candidateResults.length === 0) {
      throw new AppError("Failed to extract any usable thumbnail frames from video.", 500, "THUMBNAIL_EXTRACTION_FAILED");
    }

    // 6. Select middle candidate as default thumbnail (or candidate 1)
    const defaultCandidate =
      candidateResults.find((c) => c.index === 2) || candidateResults[0]!;

    // Upload default.jpg copy for predictable default thumbnail reference
    const defaultStorageKey = `thumbnails/${channelId}/${uploadId}/default.jpg`;
    let defaultThumbnailUrl = defaultCandidate.publicUrl;

    if (isStorageConfigured() && defaultCandidate.filePath && fs.existsSync(defaultCandidate.filePath)) {
      try {
        const defaultBuffer = fs.readFileSync(defaultCandidate.filePath);
        await storageService.uploadFile(STORAGE_THUMBNAILS_BUCKET, defaultStorageKey, defaultBuffer, {
          contentType: "image/jpeg",
          upsert: true,
        });
        defaultThumbnailUrl = storageService.getPublicUrl(STORAGE_THUMBNAILS_BUCKET, defaultStorageKey);
      } catch (defaultUploadErr: any) {
        console.warn(`[Media Service] Failed to upload default.jpg to storage: ${defaultUploadErr.message}`);
      }
    }

    // 7. Update Upload record in Neon DB
    if (updateDatabase) {
      try {
        await db.orm.public.Upload.where({ id: uploadId }).update({
          thumbnailUrl: defaultThumbnailUrl,
        });
      } catch (dbErr: any) {
        console.warn(`[Media Service] Database update notice for upload ${uploadId}:`, dbErr.message);
      }
    }

    return {
      uploadId,
      defaultThumbnailUrl,
      candidateThumbnails: candidateResults,
    };
  } finally {
    // 8. Always clean up temporary directory and files, including on error
    try {
      if (fs.existsSync(scratchDir)) {
        fs.rmSync(scratchDir, { recursive: true, force: true });
      }
    } catch (cleanupErr: any) {
      console.warn(`[Media Service] Failed to clean scratch dir ${scratchDir}:`, cleanupErr.message);
    }
  }
}

// ============================================================================
// 3. Stored Thumbnails Listing Helper (Schema-Compliant)
// ============================================================================

/**
 * Schema constraint: The Prisma schema stores one active `thumbnailUrl` on Upload.
 * It has no separate thumbnail table.
 *
 * This function safely queries files beneath the controlled storage prefix
 * `thumbnails/${channelId}/${videoId}/` to list available candidate images
 * without inventing fake database tables.
 */
export async function listStoredThumbnails(
  channelId: string,
  videoId: string,
): Promise<{
  activeThumbnailUrl: string | null;
  thumbnails: { name: string; url: string; sizeBytes?: number }[];
}> {
  let activeThumbnailUrl: string | null = null;
  try {
    const upload = await db.orm.public.Upload.where({ id: videoId, isDeleted: false }).first();
    activeThumbnailUrl = upload?.thumbnailUrl || null;
  } catch {
    // Database access fallback
  }

  if (!isStorageConfigured()) {
    return {
      activeThumbnailUrl,
      thumbnails: activeThumbnailUrl ? [{ name: "default.jpg", url: activeThumbnailUrl }] : [],
    };
  }

  try {
    const prefix = `thumbnails/${channelId}/${videoId}`;
    const files = await storageService.listFiles(STORAGE_THUMBNAILS_BUCKET, prefix);

    const thumbnails = (files || []).map((file) => ({
      name: file.name,
      url: storageService.getPublicUrl(STORAGE_THUMBNAILS_BUCKET, `${prefix}/${file.name}`),
      sizeBytes: (file as any).metadata?.size,
    }));

    return {
      activeThumbnailUrl,
      thumbnails,
    };
  } catch (err: any) {
    console.warn(`[Media Service] Storage thumbnail listing fallback: ${err.message}`);
    return {
      activeThumbnailUrl,
      thumbnails: activeThumbnailUrl ? [{ name: "default.jpg", url: activeThumbnailUrl }] : [],
    };
  }
}
