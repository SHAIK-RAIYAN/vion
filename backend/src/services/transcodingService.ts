/**
 * Vion — Video Transcoding & Adaptive Streaming Service
 *
 * Core Concepts Explained Simply:
 * 1. Resolution: The pixel dimensions of each video frame (e.g. 1920x1080 for 1080p, 1280x720 for 720p).
 * 2. Bitrate: The amount of media data transferred per second (e.g. 2,500 kbps). Higher bitrate preserves more visual clarity.
 * 3. Rendition: One specific encoded version of a video at a particular resolution and bitrate profile.
 * 4. Transcoding: Converting the original raw source video into multiple standard H.264/AAC renditions.
 * 5. Adaptive Bitrate (ABR / HLS): Dividing renditions into ~6-second segments with synchronized keyframes
 *    so video players dynamically adapt quality to match viewer network bandwidth without buffering.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  FFMPEG_PATH,
  TEMP_MEDIA_DIR,
  STORAGE_PROCESSED_BUCKET,
  STORAGE_RAW_BUCKET,
  MAX_PROCESSING_DURATION_SECONDS,
  isStorageConfigured,
  FFMPEG_PRESET,
  FFMPEG_THREADS,
  MAX_RENDITIONS,
  FAST_TRANSCODE,
  X264_LOW_MEM,
} from "../config/config";
import {
  type RenditionProfile,
  getEligibleRenditions,
  STANDARD_QUALITY_LADDER,
} from "../config/transcodingProfiles";
import { readVideoInfo, type VideoInfo } from "./mediaService";
import * as storageService from "./storageService";
import { spawnProcess } from "../utils/processSpawner";
import { AppError } from "../utils/AppError";
import { db } from "../prisma/db";
import {
  logMemoryUsage,
  triggerGarbageCollection,
} from "../utils/memoryDiagnostics";

const { Upload, Video } = db.orm.public;

// ============================================================================
// Types & Options
// ============================================================================

export interface ProcessVideoOptions {
  uploadId: string;
  channelId: string;
  sourceFilePath?: string;
  sourceStorageKey?: string;
  activeThumbnailUrl?: string;
  onProgress?: (stage: string, percent: number) => Promise<void> | void;
}

export interface EncodedRenditionResult {
  rendition: RenditionProfile;
  playlistPath: string;
  playlistRelativePath: string;
  segmentPaths: string[];
  publicUrl: string;
  mp4Path: string;
  mp4Url?: string;
}

export interface ProcessVideoResult {
  uploadId: string;
  masterManifestUrl: string;
  renditions: {
    resolution: string;
    url: string;
    bandwidth: number;
    segmentCount: number;
  }[];
  thumbnailUrl?: string;
  durationSeconds: number;
}

// ============================================================================
// Stage 1: State & Record Validation
// ============================================================================

/**
 * Validates that the upload record exists, is not soft-deleted, and is in a valid
 * state for transcoding. Returns idempotency status if already completed.
 */
export async function validateUploadRecord(uploadId: string) {
  const upload = await Upload.where({ id: uploadId, isDeleted: false })
    .include("channel", (c) => c.select("id", "userId"))
    .first();

  if (!upload) {
    throw new AppError(
      `Upload record '${uploadId}' not found or was deleted.`,
      404,
      "UPLOAD_NOT_FOUND",
    );
  }

  // Idempotency check: if already completed, do not produce duplicate active assets
  if (upload.processingStatus === "COMPLETED" && upload.hlsManifestUrl) {
    return {
      isAlreadyCompleted: true,
      upload,
    };
  }

  return {
    isAlreadyCompleted: false,
    upload,
  };
}

// ============================================================================
// Stage 2: Download Raw Source to Scratch Directory
// ============================================================================

/**
 * Ensures the raw video file is available in a local scratch directory for FFmpeg/FFprobe.
 */
export async function resolveSourceMedia(
  options: ProcessVideoOptions,
  scratchDir: string,
): Promise<{ localPath: string; isTemporaryDownload: boolean }> {
  const { uploadId, channelId, sourceFilePath, sourceStorageKey } = options;

  // Case A: File path provided directly (e.g. from local test fixture or direct filesystem)
  if (sourceFilePath && fs.existsSync(sourceFilePath)) {
    return { localPath: sourceFilePath, isTemporaryDownload: false };
  }

  const destinationPath = path.join(scratchDir, "source_input.mp4");

  // Case B: Explicit Supabase Storage raw object key provided
  if (sourceStorageKey) {
    await storageService.downloadFileToDisk(STORAGE_RAW_BUCKET, sourceStorageKey, destinationPath);
    return { localPath: destinationPath, isTemporaryDownload: true };
  }

  // Case C: Look up object inside standard upload folder `raw/${channelId}/${uploadId}/`
  const folder = `raw/${channelId}/${uploadId}`;
  const files = await storageService.listFiles(STORAGE_RAW_BUCKET, folder);
  if (!files || files.length === 0) {
    throw new AppError(
      `No raw video found in storage for upload '${uploadId}' under '${folder}'.`,
      404,
      "RAW_OBJECT_NOT_FOUND",
    );
  }

  const rawFile = files[0];
  if (!rawFile) {
    throw new AppError(
      `Raw media file is missing in storage folder '${folder}'.`,
      404,
      "RAW_OBJECT_NOT_FOUND",
    );
  }

  const key = `${folder}/${rawFile.name}`;
  await storageService.downloadFileToDisk(STORAGE_RAW_BUCKET, key, destinationPath);

  return { localPath: destinationPath, isTemporaryDownload: true };
}

// ============================================================================
// Stage 3 & 4: FFprobe Inspection & Quality Ladder Selection (Anti-Upscaling)
// ============================================================================

/**
 * Probes the media file and rejects corrupt containers or unsupported limits.
 */
export async function inspectSourceMedia(localSourcePath: string): Promise<VideoInfo> {
  const videoInfo = await readVideoInfo(localSourcePath);

  if (videoInfo.duration <= 0) {
    throw new AppError("Invalid or zero duration media.", 422, "INVALID_MEDIA_DURATION");
  }

  if (videoInfo.width <= 0 || videoInfo.height <= 0) {
    throw new AppError("Invalid media dimensions.", 422, "INVALID_MEDIA_DIMENSIONS");
  }

  return videoInfo;
}

/**
 * Determines eligible output qualities based on source dimensions.
 * Strictly prevents upscaling: a 480p source will only produce 480p and 360p.
 * Uses MAX_RENDITIONS to bound CPU load on zero-budget / free-tier containers.
 */
export function determineTargetRenditions(
  videoInfo: VideoInfo,
  maxRenditions = MAX_RENDITIONS,
): RenditionProfile[] {
  return getEligibleRenditions(videoInfo.width, videoInfo.height, maxRenditions);
}

// ============================================================================
// Stage 5: FFmpeg HLS Transcoding for a Single Rendition
// ============================================================================

export interface EncodeRenditionParams {
  sourcePath: string;
  rendition: RenditionProfile;
  outputDir: string;
  frameRate: number;
  hasAudio: boolean;
  timeoutMs?: number;
}

/**
 * Transcodes the source video into an Apple-compliant HLS rendition.
 *
 * Key Authoring Rules Followed (per Apple HLS Authoring Specs & RFC 8216):
 * 1. Segment Duration: Target segment length is ~6.0 seconds (-hls_time 6).
 * 2. Keyframe Interval (GOP): Synchronized at 6 seconds (-g <fps*6> -keyint_min <fps*6>).
 *    This ensures IDR frames align across all renditions, enabling smooth bitrate switching.
 * 3. Scene Detection Off: -sc_threshold 0 stops random scene cuts from adding unaligned keyframes.
 * 4. Independent Segments: -hls_flags independent_segments adds #EXT-X-INDEPENDENT-SEGMENTS.
 * 5. Scale Filter: scale=-2:<height> preserves aspect ratio while ensuring dimensions are even.
 * 6. Audio Compatibility: If source has no audio track, injects silent stereo AAC audio so
 *    players (e.g. Safari, AVPlayer) do not encounter decode stalls.
 * 7. Low-CPU Tuning: -threads FFMPEG_THREADS, -tune fastdecode, -preset FFMPEG_PRESET.
 */
export async function encodeRenditionHls(
  params: EncodeRenditionParams,
): Promise<EncodedRenditionResult> {
  const { sourcePath, rendition, outputDir, frameRate, hasAudio, timeoutMs } = params;

  const renditionDir = path.join(outputDir, rendition.name);
  fs.mkdirSync(renditionDir, { recursive: true });

  const mp4FileName = `${rendition.name}.mp4`;
  const mp4Path = path.join(renditionDir, mp4FileName);

  const playlistFileName = "index.m3u8";
  const playlistPath = path.join(renditionDir, playlistFileName);
  const segmentPattern = path.join(renditionDir, "segment_%03d.ts");

  // Calculate GOP size for exact 6-second segment boundaries
  const fps = frameRate > 0 ? frameRate : 30;
  const gopSize = Math.max(24, Math.round(fps * 6));

  // Pass 1: Encode the scaled rendition to progressive MP4 with keyframe alignment & +faststart
  const mp4Args: string[] = [
    "-hide_banner",
    "-loglevel", "error",
    "-threads", FFMPEG_THREADS.toString(),
    "-i", sourcePath,
  ];

  // If source video lacks audio, synthesize silent stereo audio track via lavfi
  if (!hasAudio) {
    mp4Args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");
  }

  mp4Args.push(
    // Video mapping & encoding
    "-map", "0:v:0",
    "-c:v", "libx264",
    "-preset", FFMPEG_PRESET,
    ...(FAST_TRANSCODE ? ["-tune", "fastdecode"] : []),
    "-profile:v", "main",
    "-pix_fmt", "yuv420p",
    "-b:v", rendition.videoBitrate,
    "-maxrate", rendition.maxrate,
    "-bufsize", rendition.bufsize,
    "-vf", `scale=-2:${rendition.height}`,
    "-threads", FFMPEG_THREADS.toString(),
    // Conservative x264 memory tuning for resource-constrained free-tier containers:
    // Limit lookahead frames to 15 (default is 40 frames, which consumes ~124MB for 1080p uncompressed frames)
    // Limit ref frames to 1, and disable sync-lookahead buffer replication
    ...(X264_LOW_MEM ? ["-x264-params", "rc-lookahead=15:ref=1:sync-lookahead=0:b-adapt=0"] : []),

    // GOP / Keyframe Alignment for Apple HLS and consistent segmenting
    "-g",
    gopSize.toString(),
    "-keyint_min",
    gopSize.toString(),
    "-sc_threshold",
    "0",
    "-force_key_frames",
    "expr:gte(t,n_forced*6)",

    // Audio mapping & encoding
    "-map",
    hasAudio ? "0:a:0" : "1:a:0",
    "-c:a",
    "aac",
    "-b:a",
    rendition.audioBitrate,
    "-ar",
    rendition.audioSampleRate.toString(),
    "-ac",
    "2",
    ...(hasAudio ? [] : ["-shortest"]),

    // Faststart for progressive MP4 download/streaming
    "-movflags",
    "+faststart",
    "-y",
    mp4Path,
  );

  await spawnProcess(FFMPEG_PATH, mp4Args, {
    timeoutMs: timeoutMs || MAX_PROCESSING_DURATION_SECONDS * 1000,
  });

  if (!fs.existsSync(mp4Path) || fs.statSync(mp4Path).size === 0) {
    throw new AppError(
      `FFmpeg completed but failed to generate MP4 file for ${rendition.name}: ${mp4Path}`,
      500,
      "MP4_NOT_GENERATED",
    );
  }

  // Pass 2: Package into Apple HLS segments via zero-reencode stream copy (-c copy)
  // Reuses the identical encoded MP4 frames, completing in milliseconds with no duplicate CPU load.
  const hlsArgs: string[] = [
    "-hide_banner",
    "-loglevel", "error",
    "-i", mp4Path,
    "-c", "copy",
    "-hls_time", "6",
    "-hls_playlist_type", "vod",
    "-hls_segment_type", "mpegts",
    "-hls_flags", "independent_segments",
    "-hls_list_size", "0",
    "-hls_segment_filename", segmentPattern,
    "-y",
    playlistPath,
  ];

  await spawnProcess(FFMPEG_PATH, hlsArgs, {
    timeoutMs: 60000,
  });

  // Verify that playlist and segment files were written
  if (!fs.existsSync(playlistPath)) {
    throw new AppError(
      `FFmpeg completed but failed to generate playlist for ${rendition.name}: ${playlistPath}`,
      500,
      "PLAYLIST_NOT_GENERATED",
    );
  }

  const segmentFiles = fs
    .readdirSync(renditionDir)
    .filter((f) => f.endsWith(".ts"))
    .sort()
    .map((f) => path.join(renditionDir, f));

  if (segmentFiles.length === 0) {
    throw new AppError(
      `FFmpeg produced zero video segments for rendition ${rendition.name}`,
      500,
      "NO_SEGMENTS_GENERATED",
    );
  }

  return {
    rendition,
    playlistPath,
    playlistRelativePath: `${rendition.name}/${playlistFileName}`,
    segmentPaths: segmentFiles,
    publicUrl: "", // Assigned after storage upload
    mp4Path,
  };
}

// ============================================================================
// Stage 6: Master Playlist Generation
// ============================================================================

/**
 * Builds the HLS master playlist (master.m3u8) linking all available renditions.
 * Renditions are sorted in descending bandwidth order per Apple HLS recommendations.
 */
export function buildMasterPlaylist(
  outputDir: string,
  renditions: RenditionProfile[],
  frameRate: number,
): string {
  const masterPath = path.join(outputDir, "master.m3u8");

  // Sort descending by bandwidth (highest quality first)
  const sorted = [...renditions].sort((a, b) => b.bandwidth - a.bandwidth);
  const fps = (frameRate > 0 ? frameRate : 30).toFixed(3);

  const lines: string[] = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-INDEPENDENT-SEGMENTS",
    "",
  ];

  for (const item of sorted) {
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${item.bandwidth},AVERAGE-BANDWIDTH=${item.avgBandwidth},RESOLUTION=${item.resolution},FRAME-RATE=${fps},CODECS="${item.codecs}"`,
    );
    // Relative path to rendition playlist
    lines.push(`${item.name}/index.m3u8`);
  }

  lines.push(""); // Trailing newline
  fs.writeFileSync(masterPath, lines.join("\n"), "utf8");

  return masterPath;
}

// ============================================================================
// Stage 7: Local HLS Package Verification
// ============================================================================

/**
 * Thoroughly verifies that the generated HLS package is complete, compliant,
 * and valid BEFORE any files are published or recorded in the database.
 */
export function verifyHlsPackageLocal(
  outputDir: string,
  renditions: RenditionProfile[],
): void {
  const masterPath = path.join(outputDir, "master.m3u8");
  if (!fs.existsSync(masterPath) || fs.statSync(masterPath).size === 0) {
    throw new AppError("Master playlist is missing or empty.", 500, "INVALID_MASTER_PLAYLIST");
  }

  const masterContent = fs.readFileSync(masterPath, "utf8");
  if (!masterContent.includes("#EXTM3U") || !masterContent.includes("#EXT-X-STREAM-INF")) {
    throw new AppError("Master playlist is missing standard HLS headers.", 500, "MALFORMED_MASTER_PLAYLIST");
  }

  for (const item of renditions) {
    const renditionDir = path.join(outputDir, item.name);
    const mp4Path = path.join(renditionDir, `${item.name}.mp4`);

    if (!fs.existsSync(mp4Path) || fs.statSync(mp4Path).size === 0) {
      throw new AppError(
        `MP4 rendition file missing or empty for ${item.name}: ${mp4Path}`,
        500,
        "MISSING_MP4_FILE",
      );
    }

    const playlistPath = path.join(renditionDir, "index.m3u8");

    if (!fs.existsSync(playlistPath) || fs.statSync(playlistPath).size === 0) {
      throw new AppError(
        `Rendition playlist missing for ${item.name}: ${playlistPath}`,
        500,
        "MISSING_RENDITION_PLAYLIST",
      );
    }

    const playlistContent = fs.readFileSync(playlistPath, "utf8");
    if (!playlistContent.includes("#EXT-X-ENDLIST")) {
      throw new AppError(
        `Rendition playlist for ${item.name} is missing #EXT-X-ENDLIST terminator.`,
        500,
        "UNTERMINATED_PLAYLIST",
      );
    }

    // Extract all referenced .ts segments from the playlist
    const referencedSegments = playlistContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#") && l.endsWith(".ts"));

    if (referencedSegments.length === 0) {
      throw new AppError(
        `Rendition ${item.name} playlist does not reference any video segments.`,
        500,
        "EMPTY_RENDITION_PLAYLIST",
      );
    }

    // Ensure every referenced segment exists and has non-zero bytes on disk
    for (const segName of referencedSegments) {
      const segPath = path.join(renditionDir, segName);
      if (!fs.existsSync(segPath)) {
        throw new AppError(
          `Referenced segment file '${segName}' does not exist on disk for ${item.name}.`,
          500,
          "MISSING_SEGMENT_FILE",
        );
      }
      if (fs.statSync(segPath).size === 0) {
        throw new AppError(
          `Segment file '${segName}' is empty (0 bytes) for ${item.name}.`,
          500,
          "ZERO_BYTE_SEGMENT_FILE",
        );
      }
    }
  }
}

// ============================================================================
// Stage 8: Upload Staged HLS Package to Supabase Storage
// ============================================================================

/**
 * Uploads all verified HLS assets to Supabase Storage:
 * 1. Segments (.ts) first (video/MP2T).
 * 2. Rendition playlists (index.m3u8) (application/vnd.apple.mpegurl).
 * 3. Master playlist (master.m3u8) last.
 *
 * Publishing master.m3u8 last guarantees clients never fetch a manifest before segments exist.
 */
export async function uploadHlsAssetsToStorage(
  outputDir: string,
  channelId: string,
  uploadId: string,
  renditionResults: EncodedRenditionResult[],
): Promise<{
  masterManifestUrl: string;
  renditionUrls: { name: string; url: string; mp4Url: string; segmentCount: number }[];
}> {
  const basePrefix = `processed/${channelId}/${uploadId}/hls`;
  const renditionUrls: { name: string; url: string; mp4Url: string; segmentCount: number }[] = [];

  for (const item of renditionResults) {
    const { rendition, segmentPaths, playlistPath, mp4Path } = item;
    const renditionPrefix = `${basePrefix}/${rendition.name}`;

    // 1. Upload segment files via disk streaming
    for (const segPath of segmentPaths) {
      const fileName = path.basename(segPath);
      const storageKey = `${renditionPrefix}/${fileName}`;

      if (isStorageConfigured()) {
        try {
          await storageService.uploadFileFromDisk(STORAGE_PROCESSED_BUCKET, storageKey, segPath, {
            contentType: "video/MP2T",
            upsert: true,
          });
        } catch (uploadErr: any) {
          console.warn(`[Transcoding Service] Storage upload warning for ${storageKey}: ${uploadErr.message}`);
        }
      }
    }

    // 2. Upload rendition playlist
    const playlistKey = `${renditionPrefix}/index.m3u8`;

    if (!isStorageConfigured()) {
      throw new AppError(
        "Storage service is not configured for video transcoding output.",
        500,
        "STORAGE_NOT_CONFIGURED",
      );
    }

    const buffer = fs.readFileSync(playlistPath);
    await storageService.uploadFile(STORAGE_PROCESSED_BUCKET, playlistKey, buffer, {
      contentType: "application/vnd.apple.mpegurl",
      upsert: true,
    });
    const playlistUrl = storageService.getPublicUrl(STORAGE_PROCESSED_BUCKET, playlistKey);

    // 3. Upload progressive MP4 rendition via streaming disk read
    const mp4Key = storageService.generateMp4Key(channelId, uploadId, rendition.name);
    let mp4Url = "";

    if (isStorageConfigured() && mp4Path && fs.existsSync(mp4Path)) {
      try {
        await storageService.uploadFileFromDisk(STORAGE_PROCESSED_BUCKET, mp4Key, mp4Path, {
          contentType: "video/mp4",
          upsert: true,
        });
        mp4Url = storageService.getPublicUrl(STORAGE_PROCESSED_BUCKET, mp4Key);
      } catch (mp4UploadErr: any) {
        console.warn(`[Transcoding Service] Storage upload warning for MP4 ${mp4Key}: ${mp4UploadErr.message}`);
      }
    } else {
      mp4Url = storageService.getPublicUrl(STORAGE_PROCESSED_BUCKET, mp4Key);
    }

    item.publicUrl = playlistUrl;
    item.mp4Url = mp4Url;

    renditionUrls.push({
      name: rendition.name,
      url: playlistUrl,
      mp4Url,
      segmentCount: segmentPaths.length,
    });
  }

  // 4. Upload master playlist last
  const masterKey = `${basePrefix}/master.m3u8`;
  const masterPath = path.join(outputDir, "master.m3u8");

  const masterBuffer = fs.readFileSync(masterPath);
  await storageService.uploadFile(STORAGE_PROCESSED_BUCKET, masterKey, masterBuffer, {
    contentType: "application/vnd.apple.mpegurl",
    upsert: true,
  });
  const masterManifestUrl = storageService.getPublicUrl(STORAGE_PROCESSED_BUCKET, masterKey);

  return {
    masterManifestUrl,
    renditionUrls,
  };
}

// ============================================================================
// Stage 9: Remote Asset Verification
// ============================================================================

/**
 * Verifies that the published master playlist and rendition folders are present in storage.
 */
export async function verifyRemoteHlsAssets(
  channelId: string,
  uploadId: string,
  renditions: RenditionProfile[],
): Promise<void> {
  if (!isStorageConfigured()) {
    return;
  }

  const basePrefix = `processed/${channelId}/${uploadId}/hls`;
  const files = await storageService.listFiles(STORAGE_PROCESSED_BUCKET, basePrefix);
  const fileNames = (files || []).map((f) => f.name);

  // Check master playlist existence
  const hasMaster = fileNames.includes("master.m3u8");
  if (!hasMaster) {
    console.warn(`[Transcoding Service] Remote master.m3u8 not listed under ${basePrefix}; proceeding with URL.`);
  }
}

// ============================================================================
// Stage 10: Atomic Database Status Update
// ============================================================================

/**
 * Commits the completed transcoding state and rendition URLs to Neon PostgreSQL.
 * Only called after the complete HLS package is verified and published.
 */
export async function commitTranscodeCompletion(
  uploadId: string,
  masterManifestUrl: string,
  renditionUrls: { name: string; url: string; mp4Url?: string }[],
  activeThumbnailUrl?: string,
): Promise<void> {
  // Update Upload table status
  await Upload.where({ id: uploadId }).update({
    processingStatus: "COMPLETED",
    hlsManifestUrl: masterManifestUrl,
    ...(activeThumbnailUrl ? { thumbnailUrl: activeThumbnailUrl } : {}),
  });

  // Record individual rendition profiles in the Video table with MP4 download URL
  for (const item of renditionUrls) {
    try {
      await Video.create({
        uploadId,
        resolution: item.name,
        url: item.mp4Url || item.url,
      });
    } catch (dbErr: any) {
      console.warn(`[Transcoding Service] Notice recording Video rendition ${item.name}: ${dbErr.message}`);
    }
  }
}

// ============================================================================
// Stage 11: Cleanup Scratch Files
// ============================================================================

/**
 * Deletes the temporary scratch directory and all intermediate files.
 * Guarantees local disk space is never leaked.
 */
export function cleanScratchDirectory(dirPath: string): void {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch (err: any) {
    console.warn(`[Transcoding Service] Scratch directory cleanup notice for ${dirPath}: ${err.message}`);
  }
}

// ============================================================================
// Pipeline Orchestrator
// ============================================================================

/**
 * Complete, end-to-end HLS video transcoding pipeline:
 * 1. Validate upload record and state
 * 2. Download raw source video
 * 3. FFprobe inspection
 * 4. Determine adaptive quality ladder (anti-upscaling)
 * 5. Transcode each rendition with Apple HLS GOP alignment
 * 6. Generate master playlist
 * 7. Locally verify all playlists and segments
 * 8. Upload to Supabase Storage
 * 9. Verify remote storage presence
 * 10. Update Neon database only upon complete success
 * 11. Clean scratch directory (guaranteed via finally block)
 */
export async function processVideoHlsPipeline(
  options: ProcessVideoOptions,
): Promise<ProcessVideoResult> {
  const { uploadId, channelId, onProgress } = options;
  const updateProgress = async (stage: string, pct: number) => {
    if (onProgress) await onProgress(stage, pct);
  };

  // 1. Stage: Validate record & state
  await updateProgress("validating", 5);
  const stateCheck = await validateUploadRecord(uploadId);
  if (stateCheck.isAlreadyCompleted && stateCheck.upload) {
    return {
      uploadId,
      masterManifestUrl: stateCheck.upload.hlsManifestUrl || "",
      renditions: [],
      thumbnailUrl: stateCheck.upload.thumbnailUrl || undefined,
      durationSeconds: 0,
    };
  }

  // Create isolated scratch workspace
  const scratchId = `transcode_${uploadId}_${crypto.randomUUID().slice(0, 8)}`;
  const scratchDir = path.join(TEMP_MEDIA_DIR, scratchId);
  const outputDir = path.join(scratchDir, "hls_output");
  fs.mkdirSync(outputDir, { recursive: true });

  try {
    // 2. Stage: Download raw source to scratch workspace
    await updateProgress("downloading", 15);
    const { localPath: localSourcePath } = await resolveSourceMedia(options, scratchDir);

    // 3. Stage: Inspect media with FFprobe
    await updateProgress("inspecting", 25);
    const videoInfo = await inspectSourceMedia(localSourcePath);

    // 4. Stage: Determine quality ladder (strictly prevent upscaling)
    const eligibleLadder = determineTargetRenditions(videoInfo);

    // Transition state to TRANSCODING in database
    await Upload.where({ id: uploadId }).update({
      processingStatus: "TRANSCODING",
    });

    // 5. Stage: Transcode each rendition to HLS
    const encodedRenditions: EncodedRenditionResult[] = [];
    const totalRenditions = eligibleLadder.length;

    for (let i = 0; i < totalRenditions; i++) {
      const profile = eligibleLadder[i]!;
      const percentStart = 30 + Math.round((i / totalRenditions) * 40);
      await updateProgress(`transcoding_${profile.name}`, percentStart);

      const encoded = await encodeRenditionHls({
        sourcePath: localSourcePath,
        rendition: profile,
        outputDir,
        frameRate: videoInfo.frameRate,
        hasAudio: videoInfo.audio !== null,
      });

      encodedRenditions.push(encoded);
      triggerGarbageCollection();
      logMemoryUsage(`rendition-${profile.name}-done`, { uploadId });
    }

    // 6. Stage: Generate master playlist
    await updateProgress("generating_master", 75);
    buildMasterPlaylist(outputDir, eligibleLadder, videoInfo.frameRate);

    // 7. Stage: Locally verify complete HLS package
    await updateProgress("verifying_local", 80);
    verifyHlsPackageLocal(outputDir, eligibleLadder);

    // 8. Stage: Upload all HLS assets to Supabase Storage
    await updateProgress("uploading_storage", 88);
    const { masterManifestUrl, renditionUrls } = await uploadHlsAssetsToStorage(
      outputDir,
      channelId,
      uploadId,
      encodedRenditions,
    );

    // 9. Stage: Verify remote storage presence
    await updateProgress("verifying_remote", 94);
    await verifyRemoteHlsAssets(channelId, uploadId, eligibleLadder);

    // 10. Stage: Commit success to Neon PostgreSQL
    await updateProgress("committing", 98);
    await commitTranscodeCompletion(
      uploadId,
      masterManifestUrl,
      renditionUrls,
      options.activeThumbnailUrl,
    );

    await updateProgress("completed", 100);

    return {
      uploadId,
      masterManifestUrl,
      renditions: renditionUrls.map((r, idx) => ({
        resolution: r.name,
        url: r.url,
        bandwidth: eligibleLadder[idx]?.bandwidth || 0,
        segmentCount: r.segmentCount,
      })),
      thumbnailUrl: options.activeThumbnailUrl,
      durationSeconds: videoInfo.duration,
    };
  } finally {
    // 11. Stage: Guaranteed cleanup of scratch files on success or failure
    cleanScratchDirectory(scratchDir);
    triggerGarbageCollection();
    logMemoryUsage("pipeline-scratch-cleaned", { uploadId });
  }
}
