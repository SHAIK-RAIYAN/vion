import express from "express";
import { FRONTEND_URL, NODE_ENV, PORT } from "./config/config";
import { db } from "./prisma/db";
import router from "./routes";
import { errorHandler } from "./middlewares/errorHandler";
import cookieParser from "cookie-parser";
import cors from "cors";

export const app = express();

app.use(express.json());
app.use(cookieParser());

const allowedOrigins = [
  FRONTEND_URL,
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, server-to-server, curl)
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      if (NODE_ENV === "production") {
        return callback(new Error("CORS policy violation: Origin not allowed"), false);
      }
      // Permissive fallback in local development
      return callback(null, true);
    },
    credentials: true,
  }),
);

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

