import { Router, type Request, type Response } from "express";
import { db } from "../../prisma/db";

const router = Router();

// Section 18: HEALTH / OBSERVABILITY
router.get("/", (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      service: "vion-backend",
      version: "1.0.0",
    },
  });
});

router.get("/live", (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      status: "alive",
      processId: process.pid,
    },
  });
});

router.get("/ready", async (req: Request, res: Response) => {
  try {
    // Quick readiness check against database
    await db.orm.public.User.first();
    res.status(200).json({
      success: true,
      data: {
        status: "ready",
        database: "connected",
      },
    });
  } catch (err: any) {
    res.status(503).json({
      success: false,
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Database connection not ready: " + (err.message || "Unknown error"),
      },
    });
  }
});

export default router;
