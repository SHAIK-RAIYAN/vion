import { Router, type Request, type Response } from "express";
import { db } from "../../prisma/db";
import { asyncHandler } from "../../utils/asyncHandler";
import { AppError } from "../../utils/AppError";

const router = Router();
const { Upload, Video } = db.orm.public;

// Optional internal service token verification
const internalAuth = (req: Request, res: Response, next: Function) => {
  const secret = process.env.INTERNAL_WORKER_SECRET;
  if (secret) {
    const authHeader = req.headers["x-internal-secret"];
    if (authHeader !== secret) {
      throw new AppError("Forbidden: Invalid internal worker credentials", 403);
    }
  }
  next();
};

router.use(internalAuth);

// Section 7: TRANSCODING / PROCESSING INTERNAL ENDPOINTS
router.post(
  "/:uploadId/process",
  asyncHandler(async (req: Request, res: Response) => {
    const uploadId = String(req.params.uploadId);
    const upload = await Upload.where({ id: uploadId }).first();
    if (!upload) throw new AppError("Upload not found", 404);

    const updated = await Upload.where({ id: uploadId }).update({
      processingStatus: "TRANSCODING",
    });

    res.status(200).json({
      success: true,
      message: "Transcoding job started",
      data: updated,
    });
  }),
);

router.post(
  "/:uploadId/retry",
  asyncHandler(async (req: Request, res: Response) => {
    const uploadId = String(req.params.uploadId);
    const upload = await Upload.where({ id: uploadId }).first();
    if (!upload) throw new AppError("Upload not found", 404);

    const updated = await Upload.where({ id: uploadId }).update({
      processingStatus: "PENDING",
    });

    res.status(200).json({
      success: true,
      message: "Transcoding job requeued",
      data: updated,
    });
  }),
);

router.post(
  "/:uploadId/cancel",
  asyncHandler(async (req: Request, res: Response) => {
    const uploadId = String(req.params.uploadId);
    const upload = await Upload.where({ id: uploadId }).first();
    if (!upload) throw new AppError("Upload not found", 404);

    const updated = await Upload.where({ id: uploadId }).update({
      processingStatus: "FAILED",
    });

    res.status(200).json({
      success: true,
      message: "Transcoding job cancelled",
      data: updated,
    });
  }),
);

router.post(
  "/:uploadId/complete",
  asyncHandler(async (req: Request, res: Response) => {
    const uploadId = String(req.params.uploadId);
    const upload = await Upload.where({ id: uploadId }).first();
    if (!upload) throw new AppError("Upload not found", 404);

    const { hlsManifestUrl, renditions } = req.body;

    if (Array.isArray(renditions)) {
      for (const item of renditions) {
        if (item.resolution && item.url) {
          await Video.create({
            uploadId,
            resolution: String(item.resolution),
            url: String(item.url),
          });
        }
      }
    }

    const updated = await Upload.where({ id: uploadId }).update({
      processingStatus: "COMPLETED",
      ...(hlsManifestUrl ? { hlsManifestUrl: String(hlsManifestUrl) } : {}),
    });

    res.status(200).json({
      success: true,
      message: "Transcoding job marked complete",
      data: updated,
    });
  }),
);

router.post(
  "/:uploadId/fail",
  asyncHandler(async (req: Request, res: Response) => {
    const uploadId = String(req.params.uploadId);
    const upload = await Upload.where({ id: uploadId }).first();
    if (!upload) throw new AppError("Upload not found", 404);

    const updated = await Upload.where({ id: uploadId }).update({
      processingStatus: "FAILED",
    });

    res.status(200).json({
      success: true,
      message: "Transcoding job marked failed",
      data: updated,
    });
  }),
);


export default router;
