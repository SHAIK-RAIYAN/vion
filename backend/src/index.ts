import "temporal-polyfill/global";
import express from "express";
import { FRONTEND_URL, NODE_ENV, PORT } from "./config/config";
import { db } from "./prisma/db";
import router from "./routes";
import { errorHandler } from "./middlewares/errorHandler";
import cookieParser from "cookie-parser";
import cors from "cors";

export const app = express();

/**
 * Normalizes an origin string by trimming whitespace, removing wrapping quotes,
 * and stripping any trailing slashes.
 */
export function normalizeOrigin(url: string): string {
  if (!url) return "";
  return url
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

// Build allowed origins set
export const allowedOriginsSet = new Set<string>();

// 1. Built-in development & production domains
[
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
  "https://vion.raiyan.app",
  "https://www.vion.raiyan.app",
].forEach((o) => allowedOriginsSet.add(normalizeOrigin(o)));

// 2. Load from environment sources (FRONTEND_URL, CLIENT_URL, ALLOWED_ORIGINS, CORS_ORIGIN)
const rawOriginSources = [
  FRONTEND_URL,
  process.env.FRONTEND_URL,
  process.env.CLIENT_URL,
  process.env.ALLOWED_ORIGINS,
  process.env.CORS_ORIGIN,
  process.env.CORS_ORIGINS,
];

for (const source of rawOriginSources) {
  if (!source) continue;
  const parts = source.split(/[,\s]+/);
  for (const part of parts) {
    const norm = normalizeOrigin(part);
    if (!norm) continue;
    allowedOriginsSet.add(norm);
    try {
      const parsed = new URL(norm);
      if (parsed.hostname.startsWith("www.")) {
        const apex = `${parsed.protocol}//${parsed.hostname.slice(4)}${parsed.port ? `:${parsed.port}` : ""}`;
        allowedOriginsSet.add(apex);
      } else if (!parsed.hostname.includes("localhost") && !parsed.hostname.includes("127.0.0.1")) {
        const www = `${parsed.protocol}//www.${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`;
        allowedOriginsSet.add(www);
      }
    } catch {
      // ignore URL parsing error
    }
  }
}

/**
 * Checks whether an incoming origin header is permitted.
 */
export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true; // non-browser requests (mobile apps, server-to-server, curl)
  const normalized = normalizeOrigin(origin);
  if (allowedOriginsSet.has(normalized)) return true;

  try {
    const url = new URL(normalized);
    // Allow any localhost/127.0.0.1 development port
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return true;
    }
    // Allow any subdomain of raiyan.app (e.g. vion.raiyan.app, preview.raiyan.app)
    if (url.hostname === "raiyan.app" || url.hostname.endsWith(".raiyan.app")) {
      return true;
    }
    // Allow Vercel preview deployments for vion
    if (url.hostname.endsWith(".vercel.app") && url.hostname.includes("vion")) {
      return true;
    }
    // Allow Render deployments
    if (url.hostname.endsWith(".onrender.com")) {
      return true;
    }
  } catch {
    // ignore
  }

  return false;
}

export const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }
    if (NODE_ENV !== "production") {
      return callback(null, true);
    }
    console.warn(
      `[Vion CORS] Blocked request from origin: "${origin}". Allowed origins:`,
      Array.from(allowedOriginsSet),
    );
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  // When allowedHeaders is omitted, the cors package dynamically echoes
  // all headers requested in Access-Control-Request-Headers, avoiding drops for custom/tracing headers.
  exposedHeaders: [
    "Content-Range",
    "X-Content-Range",
    "ETag",
    "Cache-Control",
  ],
  optionsSuccessStatus: 204,
  maxAge: 86400, // Cache preflight response in browser for 24h to avoid redundant OPTIONS requests on every poll
};

// 1. CORS is mounted FIRST so all preflight OPTIONS requests are answered immediately without body/cookie parsing
app.use(cors(corsOptions));
app.options("/*path", cors(corsOptions));

// 2. Parse request bodies and cookies
app.use(express.json());
app.use(cookieParser());

// 3. Mount API routes and error handler
app.use("/api/v1", router);
app.use(errorHandler);

export const server = app.listen(PORT, async () => {
  console.log(`[Vion Server] Started listening on port ${PORT} (${NODE_ENV})`);
  try {
    await db.connect();
    console.log("[Vion Server] Connected to Neon PostgreSQL database");
  } catch (err: any) {
    console.error("[Vion Server] Database connection warning:", err?.message || err);
  }
  try {
    const { ensureStorageBucketsExist } = await import("./services/storageService");
    await ensureStorageBucketsExist();
  } catch (err: any) {
    console.warn("[Vion Server] Storage initialization notice:", err?.message || err);
  }

  // Optional embedded worker for development environments when enabled
  if (process.env.ENABLE_WORKER === "true" || process.env.RUN_WORKER === "true") {
    try {
      const { createTranscodingWorker } = await import("./worker/transcodingWorker");
      createTranscodingWorker();
      console.log("[Vion Server] Embedded transcoding worker started (ENABLE_WORKER=true).");
    } catch (err: any) {
      console.warn("[Vion Server] Failed to initialize embedded worker:", err?.message || err);
    }
  }
});

// Graceful server shutdown on termination signals
let isShuttingDown = false;
async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.info(`\n[Vion Server] Received ${signal}. Closing HTTP listener gracefully...`);

  server.close(async () => {
    console.info("[Vion Server] HTTP listener terminated.");
    try {
      if (typeof (db as any).disconnect === "function") {
        await (db as any).disconnect();
        console.info("[Vion Server] Database connection closed.");
      }
    } catch (err: any) {
      console.error("[Vion Server] Error closing database connection:", err?.message);
    } finally {
      process.exit(0);
    }
  });

  // Force kill if graceful termination does not complete within 10s
  setTimeout(() => {
    console.error("[Vion Server] Graceful shutdown timeout exceeded. Forcing exit.");
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

process.on("uncaughtException", (err) => {
  console.error("[Vion Server Uncaught Exception]:", err?.stack || err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[Vion Server Unhandled Rejection]:", reason);
});


