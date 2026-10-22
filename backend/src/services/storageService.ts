import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  STORAGE_RAW_BUCKET,
  STORAGE_PROCESSED_BUCKET,
  STORAGE_THUMBNAILS_BUCKET,
  STORAGE_PUBLIC_URL,
  isStorageConfigured,
} from "../config/config";
import { AppError } from "../utils/AppError";

export const STORAGE_BUCKETS = {
  /** Private bucket for raw ingests before transcoding (Access only via signed URLs) */
  RAW: STORAGE_RAW_BUCKET,
  /** Public bucket for streaming deliveries (HLS master manifests, segments, renditions) */
  PROCESSED: STORAGE_PROCESSED_BUCKET,
  /** Public bucket for video thumbnails, channel avatars, and posters */
  THUMBNAILS: STORAGE_THUMBNAILS_BUCKET,
} as const;

let supabaseClientInstance: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (supabaseClientInstance) {
    return supabaseClientInstance;
  }

  if (!isStorageConfigured()) {
    throw new AppError(
      "Supabase Storage is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.",
      500,
      "STORAGE_NOT_CONFIGURED",
    );
  }

  supabaseClientInstance = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseClientInstance;
}

/**
 * Sanitizes original filename and prevents directory traversal attacks.
 */
function sanitizeFileName(fileName?: string): string {
  if (!fileName) return "media.bin";
  return fileName
    .replace(/^.*[\\\/]/, "") // strip directory components
    .replace(/[^a-zA-Z0-9._-]/g, "_") // only keep safe alphanumeric and dot/dash
    .slice(0, 100);
}

// ============================================================================
// Server-Generated Storage Layout Paths
// ============================================================================

export function generateRawVideoKey(
  channelId: string,
  uploadId: string,
  originalFileName?: string,
): string {
  const fileId = crypto.randomUUID();
  const cleanName = sanitizeFileName(originalFileName);
  return `raw/${channelId}/${uploadId}/${fileId}_${cleanName}`;
}

export function generateHlsBasePath(channelId: string, videoId: string): string {
  return `processed/${channelId}/${videoId}/hls`;
}

export function generateHlsMasterPlaylistPath(channelId: string, videoId: string): string {
  return `${generateHlsBasePath(channelId, videoId)}/master.m3u8`;
}

export function generateMp4Key(
  channelId: string,
  videoId: string,
  resolution: string,
): string {
  return `processed/${channelId}/${videoId}/mp4/${resolution}.mp4`;
}

export function generateThumbnailKey(
  channelId: string,
  videoId: string,
  originalFileName?: string,
): string {
  const fileId = crypto.randomUUID();
  const cleanName = sanitizeFileName(originalFileName);
  return `thumbnails/${channelId}/${videoId}/${fileId}_${cleanName}`;
}

// ============================================================================
// Core Storage Operations
// ============================================================================

let bucketsEnsured = false;

/**
 * Ensures that all required Supabase Storage buckets exist with appropriate permissions.
 * - raw-videos: Private (access only via signed URLs)
 * - processed-videos: Public (direct streaming delivery)
 * - thumbnails: Public (direct image loading)
 */
export async function ensureStorageBucketsExist(): Promise<void> {
  if (bucketsEnsured || !isStorageConfigured()) return;

  try {
    const client = getSupabaseClient();
    const { data: buckets, error } = await client.storage.listBuckets();
    if (error) {
      console.warn("[Storage Service] Notice listing buckets during initialization:", error.message);
      return;
    }

    const existingNames = new Set((buckets || []).map((b) => b.name));

    if (!existingNames.has(STORAGE_RAW_BUCKET)) {
      await client.storage.createBucket(STORAGE_RAW_BUCKET, {
        public: false,
        fileSizeLimit: 50 * 1024 * 1024,
        allowedMimeTypes: ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"],
      });
    } else {
      await client.storage.updateBucket(STORAGE_RAW_BUCKET, {
        public: false,
        fileSizeLimit: 50 * 1024 * 1024,
        allowedMimeTypes: ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"],
      });
    }
    if (!existingNames.has(STORAGE_PROCESSED_BUCKET)) {
      await client.storage.createBucket(STORAGE_PROCESSED_BUCKET, { public: true });
    }
    if (!existingNames.has(STORAGE_THUMBNAILS_BUCKET)) {
      await client.storage.createBucket(STORAGE_THUMBNAILS_BUCKET, { public: true });
    }

    bucketsEnsured = true;
  } catch (err: any) {
    console.warn("[Storage Service] Notice ensuring storage buckets:", err?.message || err);
  }
}

/**
 * Generates a signed upload URL for direct, secure client-to-storage ingest.
 * Only the server generates the destination path; clients cannot alter it.
 */
export async function createSignedUploadUrl(
  bucket: string,
  path: string,
  options: { expiresInSeconds?: number; upsert?: boolean } = {},
): Promise<{ signedUrl: string; token: string; path: string }> {
  const client = getSupabaseClient();
  const expiresIn = options.expiresInSeconds || 3600; // default 1 hour

  let { data, error } = await client.storage
    .from(bucket)
    .createSignedUploadUrl(path, {
      upsert: options.upsert ?? false,
    });

  // If the bucket doesn't exist yet, attempt to initialize it and retry once
  if (error && (error.message.includes("does not exist") || error.message.includes("not found"))) {
    await ensureStorageBucketsExist();
    const retry = await client.storage
      .from(bucket)
      .createSignedUploadUrl(path, {
        upsert: options.upsert ?? false,
      });
    data = retry.data;
    error = retry.error;
  }

  if (error || !data) {
    throw new AppError(
      `Failed to create signed upload URL: ${error?.message || "Unknown storage error"}`,
      500,
      "STORAGE_UPLOAD_URL_ERROR",
    );
  }

  return {
    signedUrl: data.signedUrl,
    token: data.token,
    path,
  };
}

/**
 * Generates a short-lived signed download URL for private objects (e.g. raw video processing).
 */
export async function createSignedDownloadUrl(
  bucket: string,
  path: string,
  expiresInSeconds = 3600,
  options?: { download?: string | boolean },
): Promise<string> {
  const client = getSupabaseClient();

  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds, options);

  if (error || !data?.signedUrl) {
    throw new AppError(
      `Failed to create signed download URL: ${error?.message || "Object not found"}`,
      error ? 500 : 404,
      "STORAGE_DOWNLOAD_URL_ERROR",
    );
  }

  return data.signedUrl;
}

/**
 * Returns the public URL for publicly deliverable assets (e.g., HLS manifests, thumbnails).
 */
export function getPublicUrl(bucket: string, path: string): string {
  if (STORAGE_PUBLIC_URL) {
    // Custom CDN domain if specified
    const cleanBase = STORAGE_PUBLIC_URL.replace(/\/+$/, "");
    return `${cleanBase}/${bucket}/${path.replace(/^\/+/, "")}`;
  }

  const client = getSupabaseClient();
  const { data } = client.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Uploads a file buffer or stream directly from the server.
 */
export async function uploadFile(
  bucket: string,
  path: string,
  fileBody: Buffer | Uint8Array | Blob,
  options: { contentType?: string; upsert?: boolean } = {},
): Promise<{ path: string; id?: string }> {
  const client = getSupabaseClient();

  let { data, error } = await client.storage
    .from(bucket)
    .upload(path, fileBody, {
      contentType: options.contentType || "application/octet-stream",
      upsert: options.upsert ?? false,
    });

  // If the bucket doesn't exist yet, attempt to initialize it and retry once
  if (error && (error.message.includes("does not exist") || error.message.includes("not found"))) {
    await ensureStorageBucketsExist();
    const retry = await client.storage
      .from(bucket)
      .upload(path, fileBody, {
        contentType: options.contentType || "application/octet-stream",
        upsert: options.upsert ?? false,
      });
    data = retry.data;
    error = retry.error;
  }

  if (error || !data) {
    throw new AppError(
      `Failed to upload file to storage: ${error?.message || "Upload failed"}`,
      500,
      "STORAGE_UPLOAD_ERROR",
    );
  }

  return {
    path: data.path,
    id: data.id,
  };
}

/**
 * Streams a local disk file directly to Supabase Storage
 * using a readable file stream without loading the file into RAM.
 */
export async function uploadFileFromDisk(
  bucket: string,
  storagePath: string,
  localFilePath: string,
  options: { contentType?: string; upsert?: boolean } = {},
): Promise<{ path: string; id?: string }> {
  if (!fs.existsSync(localFilePath)) {
    throw new AppError(`File not found on disk: ${localFilePath}`, 404, "FILE_NOT_FOUND");
  }

  const client = getSupabaseClient();
  const fileStream = fs.createReadStream(localFilePath);

  let { data, error } = await client.storage
    .from(bucket)
    .upload(storagePath, fileStream as any, {
      contentType: options.contentType || "application/octet-stream",
      upsert: options.upsert ?? false,
    });

  // If the bucket doesn't exist yet, attempt to initialize it and retry once
  if (error && (error.message.includes("does not exist") || error.message.includes("not found"))) {
    await ensureStorageBucketsExist();
    const retryStream = fs.createReadStream(localFilePath);
    const retry = await client.storage
      .from(bucket)
      .upload(storagePath, retryStream as any, {
        contentType: options.contentType || "application/octet-stream",
        upsert: options.upsert ?? false,
      });
    data = retry.data;
    error = retry.error;
  }

  if (error || !data) {
    throw new AppError(
      `Failed to upload file to storage: ${error?.message || "Upload failed"}`,
      500,
      "STORAGE_UPLOAD_ERROR",
    );
  }

  return {
    path: data.path,
    id: data.id,
  };
}

/**
 * Streams a remote file directly from Supabase Storage to a local disk path
 * without buffering the content in JavaScript heap or Node Buffer memory.
 */
export async function downloadFileToDisk(
  bucket: string,
  storagePath: string,
  localFilePath: string,
): Promise<void> {
  const dir = path.dirname(localFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Attempt 1: Fetch through short-lived signed URL for true streaming response body
  try {
    const signedUrl = await createSignedDownloadUrl(bucket, storagePath, 600);
    const response = await fetch(signedUrl);
    if (response.ok && response.body) {
      const writeStream = fs.createWriteStream(localFilePath);
      const nodeReadable = Readable.fromWeb(response.body as any);
      await pipeline(nodeReadable, writeStream);
      return;
    }
  } catch {
    // Fall back to direct client download stream if signed URL fails
  }

  // Attempt 2: Fallback to direct client download stream
  const client = getSupabaseClient();
  const { data, error } = await client.storage.from(bucket).download(storagePath);

  if (error || !data) {
    throw new AppError(
      `Failed to download file from storage: ${error?.message || "Object not found"}`,
      500,
      "STORAGE_DOWNLOAD_ERROR",
    );
  }

  const writeStream = fs.createWriteStream(localFilePath);
  if (typeof (data as any).stream === "function") {
    const nodeReadable = Readable.fromWeb((data as any).stream());
    await pipeline(nodeReadable, writeStream);
  } else {
    const arrayBuffer = await data.arrayBuffer();
    fs.writeFileSync(localFilePath, Buffer.from(arrayBuffer));
  }
}

/**
 * Downloads a file buffer from storage (used by legacy callers or small metadata files).
 */
export async function downloadFile(bucket: string, path: string): Promise<Buffer> {
  const client = getSupabaseClient();

  const { data, error } = await client.storage.from(bucket).download(path);

  if (error || !data) {
    throw new AppError(
      `Failed to download file from storage: ${error?.message || "Download failed"}`,
      500,
      "STORAGE_DOWNLOAD_ERROR",
    );
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Deletes one or more files from a storage bucket.
 */
export async function deleteFiles(bucket: string, paths: string[]): Promise<void> {
  if (!paths || paths.length === 0) return;

  const client = getSupabaseClient();
  const { error } = await client.storage.from(bucket).remove(paths);

  if (error) {
    throw new AppError(
      `Failed to delete files from storage: ${error.message}`,
      500,
      "STORAGE_DELETE_ERROR",
    );
  }
}

/**
 * Lists objects in a folder inside a bucket.
 */
export async function listFiles(
  bucket: string,
  folder = "",
  options: { limit?: number; offset?: number } = {},
) {
  const client = getSupabaseClient();

  const { data, error } = await client.storage.from(bucket).list(folder, {
    limit: options.limit || 100,
    offset: options.offset || 0,
    sortBy: { column: "created_at", order: "desc" },
  });

  if (error) {
    throw new AppError(
      `Failed to list files from storage: ${error.message}`,
      500,
      "STORAGE_LIST_ERROR",
    );
  }

  return data || [];
}

/**
 * Fast check whether an object exists in a storage bucket.
 */
export async function checkFileExists(bucket: string, storagePath: string): Promise<boolean> {
  if (!isStorageConfigured()) return false;
  try {
    const client = getSupabaseClient();
    const cleanPath = storagePath.replace(/^\/+/, "");
    const parts = cleanPath.split("/");
    const fileName = parts.pop();
    const folder = parts.join("/");

    if (!fileName) return false;

    const { data, error } = await client.storage
      .from(bucket)
      .list(folder, { limit: 20, search: fileName });

    if (error || !data) return false;
    return data.some((item) => item.name === fileName);
  } catch {
    return false;
  }
}

/**
 * Finds the first available raw video file path for an upload in the RAW bucket.
 */
export async function findRawVideoKey(channelId: string, uploadId: string): Promise<string | null> {
  if (!isStorageConfigured()) return null;
  try {
    const client = getSupabaseClient();
    const folder = `raw/${channelId}/${uploadId}`;
    const { data, error } = await client.storage.from(STORAGE_RAW_BUCKET).list(folder, { limit: 10 });
    if (error || !data || data.length === 0) return null;
    const match = data.find((item) => item.name && item.name.match(/\.(mp4|mov|webm|mkv|avi)$/i)) || data[0];
    if (match && match.name) {
      return `${folder}/${match.name}`;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Health check helper for Supabase Storage.
 * Verifies connectivity and reports status gracefully.
 */
export async function checkStorageHealth(): Promise<{
  isConfigured: boolean;
  isAvailable: boolean;
  message: string;
  buckets?: string[];
}> {
  if (!isStorageConfigured()) {
    return {
      isConfigured: false,
      isAvailable: false,
      message: "Supabase Storage credentials not configured (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing)",
    };
  }

  try {
    const client = getSupabaseClient();
    const { data: buckets, error } = await client.storage.listBuckets();

    if (error) {
      return {
        isConfigured: true,
        isAvailable: false,
        message: `Storage reachable but bucket listing failed: ${error.message}`,
      };
    }

    const bucketNames = (buckets || []).map((b) => b.name);
    return {
      isConfigured: true,
      isAvailable: true,
      message: "Supabase Storage connection healthy",
      buckets: bucketNames,
    };
  } catch (err: any) {
    return {
      isConfigured: true,
      isAvailable: false,
      message: `Failed to connect to Supabase Storage: ${err.message || "Unknown error"}`,
    };
  }
}
