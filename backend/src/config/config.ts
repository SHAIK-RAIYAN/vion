import { config } from "dotenv";
import path from "path";
import fs from "fs";
import { z } from "zod";

config();

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SALT_ROUNDS: z.coerce.number().default(10),
  JWT_SECRET_KEY: z.string().default("vion_secret_key_change_me_in_production"),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  GOOGLE_CLIENT_ID: z.string().default(""),
  ADMIN_EMAILS: z.string().default(""), // Comma-separated admin email list

  // Supabase Object Storage
  SUPABASE_URL: z.string().default(""),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(""),
  SUPABASE_RAW_BUCKET: z.string().default("raw-videos"),
  SUPABASE_PROCESSED_BUCKET: z.string().default("processed-videos"),
  SUPABASE_THUMBNAILS_BUCKET: z.string().default("thumbnails"),
  SUPABASE_PUBLIC_URL: z.string().default(""), // Optional CDN/public delivery URL

  // Redis Queue (Job Storage)
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // Media Processing Limits & Executables
  FFMPEG_PATH: z.string().default("ffmpeg"),
  FFPROBE_PATH: z.string().default("ffprobe"),
  TEMP_MEDIA_DIR: z.string().default(path.resolve(process.cwd(), "tmp/media")),
  MAX_VIDEO_SIZE_BYTES: z.coerce.number().default(50 * 1024 * 1024), // 50 MB strict limit
  MAX_UPLOAD_SIZE_BYTES: z.coerce.number().default(50 * 1024 * 1024), // 50 MB default
  MAX_PROCESSING_DURATION_SECONDS: z.coerce.number().default(1800), // 30 minutes default

  // Transcoding Performance & Worker Concurrency (Zero-budget constrained settings)
  FFMPEG_PRESET: z.enum(["ultrafast", "superfast", "veryfast", "faster", "fast", "medium"]).default("veryfast"),
  FFMPEG_THREADS: z.coerce.number().default(1),
  MAX_RENDITIONS: z.coerce.number().default(2),
  WORKER_CONCURRENCY: z.coerce.number().default(1),
  FAST_TRANSCODE: z.coerce.boolean().default(true),
  ENABLE_WORKER: z.coerce.boolean().default(true),
  WORKER_MODE: z.enum(["embedded", "supervisor"]).default("embedded"),
  X264_LOW_MEM: z.coerce.boolean().default(true),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  // Warn about invalid environment variables without throwing a hard crash in dev
  console.warn(
    "⚠ Environment validation warning:",
    parsedEnv.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "),
  );
}

const env = parsedEnv.success ? parsedEnv.data : (process.env as any);

// Server & Auth Config
export const PORT = Number(env.PORT) || 5000;
export const NODE_ENV = (env.NODE_ENV as "development" | "production" | "test") || "development";
export const DB_URL = env.DATABASE_URL || process.env.DATABASE_URL;
export const SALT_ROUNDS = Number(env.SALT_ROUNDS) || 10;
export const JWT_SECRET = env.JWT_SECRET_KEY || "vion_secret_key_change_me_in_production";
export const FRONTEND_URL = (
  env.FRONTEND_URL ||
  process.env.FRONTEND_URL ||
  process.env.CLIENT_URL ||
  "http://localhost:3000"
)
  .trim()
  .replace(/\/+$/, "");
export const GOOGLE_CLIENT_ID = env.GOOGLE_CLIENT_ID || "";
export const ADMIN_EMAILS = (env.ADMIN_EMAILS || process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e: string) => e.trim().toLowerCase())
  .filter(Boolean);

// Supabase Storage Configuration
export const SUPABASE_URL = env.SUPABASE_URL || "";
export const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || "";
export const STORAGE_RAW_BUCKET = env.SUPABASE_RAW_BUCKET || "raw-videos";
export const STORAGE_PROCESSED_BUCKET = env.SUPABASE_PROCESSED_BUCKET || "processed-videos";
export const STORAGE_THUMBNAILS_BUCKET = env.SUPABASE_THUMBNAILS_BUCKET || "thumbnails";
export const STORAGE_PUBLIC_URL = env.SUPABASE_PUBLIC_URL || "";

// Redis & Queue Configuration
export const REDIS_URL = env.REDIS_URL || (NODE_ENV === "production" ? "" : "redis://localhost:6379");

// Media Processing Binaries & Dirs
export const FFMPEG_PATH = env.FFMPEG_PATH || "ffmpeg";
export const FFPROBE_PATH = env.FFPROBE_PATH || "ffprobe";
export const TEMP_MEDIA_DIR = path.resolve(env.TEMP_MEDIA_DIR || path.resolve(process.cwd(), "tmp/media"));
export const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB strict video limit
export const MAX_UPLOAD_SIZE_BYTES = Number(env.MAX_VIDEO_SIZE_BYTES || env.MAX_UPLOAD_SIZE_BYTES) || MAX_VIDEO_SIZE_BYTES;
export const MAX_PROCESSING_DURATION_SECONDS = Number(env.MAX_PROCESSING_DURATION_SECONDS) || 1800;

// Worker Concurrency & Transcoding Optimizations
export const FFMPEG_PRESET = env.FFMPEG_PRESET || "veryfast";
export const FFMPEG_THREADS = Number(env.FFMPEG_THREADS) || 1;
export const MAX_RENDITIONS = Number(env.MAX_RENDITIONS) || 2;
export const WORKER_CONCURRENCY = Number(env.WORKER_CONCURRENCY) || 1;
export const FAST_TRANSCODE = env.FAST_TRANSCODE !== false;
export const ENABLE_WORKER = env.ENABLE_WORKER !== false;
export const WORKER_MODE = (env.WORKER_MODE as "embedded" | "supervisor") || "embedded";
export const X264_LOW_MEM = env.X264_LOW_MEM !== false;

// Auto-initialize temp media directory
try {
  if (!fs.existsSync(TEMP_MEDIA_DIR)) {
    fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });
  }
} catch {
  // Ignore filesystem permission errors during test environments
}

// Helpers
export function isStorageConfigured(): boolean {
  return Boolean(
    SUPABASE_URL &&
    SUPABASE_URL.startsWith("http") &&
    !SUPABASE_URL.includes("your-project-id") &&
    SUPABASE_SERVICE_ROLE_KEY &&
    !SUPABASE_SERVICE_ROLE_KEY.includes("your-supabase-service-role-key") &&
    SUPABASE_SERVICE_ROLE_KEY.length > 20,
  );
}

export function isRedisConfigured(): boolean {
  if (!REDIS_URL) return false;
  if (NODE_ENV === "production" && (REDIS_URL.includes("localhost") || REDIS_URL.includes("127.0.0.1"))) {
    return false;
  }
  return REDIS_URL.startsWith("redis");
}

/**
 * Returns a sanitized diagnostic config summary.
 * NEVER prints or exposes sensitive secrets (service role keys or db credentials).
 */
export function getSanitizedConfigSummary() {
  return {
    nodeEnv: NODE_ENV,
    port: PORT,
    databaseConfigured: Boolean(DB_URL),
    storage: {
      isConfigured: isStorageConfigured(),
      supabaseUrl: SUPABASE_URL ? SUPABASE_URL.replace(/^(https?:\/\/[^/]+).*$/, "$1") : "not_configured",
      rawBucket: STORAGE_RAW_BUCKET,
      processedBucket: STORAGE_PROCESSED_BUCKET,
      thumbnailsBucket: STORAGE_THUMBNAILS_BUCKET,
    },
    redis: {
      isConfigured: isRedisConfigured(),
      host: REDIS_URL ? REDIS_URL.replace(/^redis:\/\/(?:[^:@]+:[^:@]+@)?([^:/]+).*$/, "$1") : "not_configured",
    },
    worker: {
      enabled: ENABLE_WORKER,
      mode: WORKER_MODE,
      concurrency: WORKER_CONCURRENCY,
      ffmpegPreset: FFMPEG_PRESET,
      ffmpegThreads: FFMPEG_THREADS,
      maxRenditions: MAX_RENDITIONS,
      fastTranscode: FAST_TRANSCODE,
      x264LowMem: X264_LOW_MEM,
    },
    limits: {
      maxUploadSizeBytes: MAX_UPLOAD_SIZE_BYTES,
      maxUploadSizeMB: Math.round(MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)),
      maxProcessingDurationSeconds: MAX_PROCESSING_DURATION_SECONDS,
    },
    paths: {
      tempMediaDir: TEMP_MEDIA_DIR,
      ffmpeg: FFMPEG_PATH,
      ffprobe: FFPROBE_PATH,
    },
  };
}
