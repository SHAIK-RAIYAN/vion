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
  MAX_UPLOAD_SIZE_BYTES: z.coerce.number().default(500 * 1024 * 1024), // 500 MB default
  MAX_PROCESSING_DURATION_SECONDS: z.coerce.number().default(1800), // 30 minutes default
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
export const REDIS_URL = env.REDIS_URL || "redis://localhost:6379";

// Media Processing Binaries & Dirs
export const FFMPEG_PATH = env.FFMPEG_PATH || "ffmpeg";
export const FFPROBE_PATH = env.FFPROBE_PATH || "ffprobe";
export const TEMP_MEDIA_DIR = path.resolve(env.TEMP_MEDIA_DIR || path.resolve(process.cwd(), "tmp/media"));
export const MAX_UPLOAD_SIZE_BYTES = Number(env.MAX_UPLOAD_SIZE_BYTES) || 500 * 1024 * 1024;
export const MAX_PROCESSING_DURATION_SECONDS = Number(env.MAX_PROCESSING_DURATION_SECONDS) || 1800;

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
  return Boolean(REDIS_URL && REDIS_URL.startsWith("redis"));
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
