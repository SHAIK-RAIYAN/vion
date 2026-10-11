import { Router, type Request, type Response } from "express";
import { db } from "../../prisma/db";
import { checkRedisHealth } from "../../queue/redisClient";
import { checkStorageHealth } from "../../services/storageService";
import { getQueueMetrics } from "../../queue/videoQueue";
import { getSanitizedConfigSummary } from "../../config/config";

const router = Router();

// Section 18: HEALTH / OBSERVABILITY

/**
 * GET /api/v1/health
 * Liveness & configuration metadata
 */
router.get("/", (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      service: "vion-backend",
      version: "1.0.0",
      config: getSanitizedConfigSummary(),
    },
  });
});

/**
 * GET /api/v1/health/live
 * Process liveness probe for container orchestrators
 */
router.get("/live", (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      status: "alive",
      processId: process.pid,
      uptime: process.uptime(),
    },
  });
});

/**
 * GET /api/v1/health/ready
 * Comprehensive readiness check for traffic routing:
 * - Neon PostgreSQL (application metadata)
 * - Redis (background jobs)
 * - Supabase Storage (media object store)
 */
router.get("/ready", async (req: Request, res: Response) => {
  const startTime = Date.now();
  const checks: Record<string, any> = {};
  let overallHealthy = true;

  // 1. Neon Database check
  const dbStart = Date.now();
  try {
    await db.orm.public.User.first();
    checks.database = {
      status: "healthy",
      provider: "Neon PostgreSQL",
      latencyMs: Date.now() - dbStart,
    };
  } catch (err: any) {
    overallHealthy = false;
    checks.database = {
      status: "unhealthy",
      provider: "Neon PostgreSQL",
      latencyMs: Date.now() - dbStart,
      error: err.message || "Failed to query database",
    };
  }

  // 2. Redis queue check
  try {
    const redisHealth = await checkRedisHealth();
    checks.redis = {
      status: redisHealth.isAvailable
        ? "healthy"
        : redisHealth.isConfigured
          ? "degraded"
          : "unconfigured",
      latencyMs: redisHealth.latencyMs,
      message: redisHealth.message,
    };
  } catch (err: any) {
    checks.redis = {
      status: "degraded",
      error: err.message,
    };
  }

  // 3. Supabase Storage check
  try {
    const storageHealth = await checkStorageHealth();
    checks.storage = {
      status: storageHealth.isAvailable
        ? "healthy"
        : storageHealth.isConfigured
          ? "degraded"
          : "unconfigured",
      message: storageHealth.message,
      buckets: storageHealth.buckets,
    };
  } catch (err: any) {
    checks.storage = {
      status: "degraded",
      error: err.message,
    };
  }

  // 4. Background queue metrics
  try {
    const queueMetrics = await getQueueMetrics();
    checks.queue = queueMetrics;
  } catch {
    checks.queue = { isAvailable: false };
  }

  const statusCode = overallHealthy ? 200 : 503;

  res.status(statusCode).json({
    success: overallHealthy,
    data: {
      status: overallHealthy ? "ready" : "degraded",
      totalLatencyMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      dependencies: checks,
    },
  });
});

export default router;
