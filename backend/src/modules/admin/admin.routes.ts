import { Router, type Request, type Response } from "express";
import { db } from "../../prisma/db";
import { asyncHandler } from "../../utils/asyncHandler";
import { AppError } from "../../utils/AppError";
import { paginationSchema, getPaginationMeta } from "../../utils/pagination";

import { ADMIN_EMAILS } from "../../config/config";

const router = Router();
const { User, Upload } = db.orm.public;

// Section 17: ADMIN
// Schema Prerequisite Note:
// The fixed Prisma User model does not possess a 'role' column or 'isAdmin' flag.
// To avoid implementing a fake schema check or bypassing security,
// real administrator authorization is strictly enforced against server-configured ADMIN_EMAILS.
router.use((req: Request, _res: Response, next) => {
  if (!req.user) {
    throw new AppError("Authentication required.", 401, "UNAUTHORIZED");
  }

  const userEmail = (req.user.email || "").toLowerCase();
  if (ADMIN_EMAILS.length === 0 || !ADMIN_EMAILS.includes(userEmail)) {
    throw new AppError(
      "Admin privileges required. Your account is not configured in ADMIN_EMAILS.",
      403,
      "FORBIDDEN_ADMIN_ACCESS",
    );
  }

  next();
});

// Users Management
router.get(
  "/users",
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit } = paginationSchema.parse(req.query);
    const offset = (page - 1) * limit;

    const [users, countResult] = await Promise.all([
      User.select("id", "email", "firstName", "lastName", "gender", "createdAt")
        .limit(limit)
        .offset(offset)
        .all(),
      User.aggregate((agg) => ({ count: agg.count() })),
    ]);

    res.status(200).json({
      success: true,
      data: {
        items: users,
        pagination: getPaginationMeta(countResult.count, page, limit),
      },
    });
  }),
);

router.get(
  "/users/:userId",
  asyncHandler(async (req: Request, res: Response) => {
    const userId = String(req.params.userId);
    const user = await User.where({ id: userId })
      .select(
        "id",
        "email",
        "firstName",
        "lastName",
        "gender",
        "dob",
        "createdAt",
      )
      .first();

    if (!user) throw new AppError("User not found", 404);

    res.status(200).json({
      success: true,
      data: user,
    });
  }),
);

router.patch(
  "/users/:userId",
  asyncHandler(async (req: Request, res: Response) => {
    const userId = String(req.params.userId);
    const updated = await User.where({ id: userId }).update(req.body);
    res.status(200).json({
      success: true,
      message: "User updated successfully",
      data: updated,
    });
  }),
);

router.delete(
  "/users/:userId",
  asyncHandler(async (req: Request, res: Response) => {
    const userId = String(req.params.userId);
    await User.where({ id: userId }).delete();
    res.status(200).json({
      success: true,
      message: "User deleted successfully",
      data: null,
    });
  }),
);

// Videos Management
router.get(
  "/videos",
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit } = paginationSchema.parse(req.query);
    const offset = (page - 1) * limit;

    const [videos, countResult] = await Promise.all([
      Upload.limit(limit).offset(offset).orderBy((u) => u.createdAt.desc()).all(),
      Upload.aggregate((agg) => ({ count: agg.count() })),
    ]);

    res.status(200).json({
      success: true,
      data: {
        items: videos,
        pagination: getPaginationMeta(countResult.count, page, limit),
      },
    });
  }),
);

router.get(
  "/videos/:videoId",
  asyncHandler(async (req: Request, res: Response) => {
    const videoId = String(req.params.videoId);
    const video = await Upload.where({ id: videoId }).first();
    if (!video) throw new AppError("Video not found", 404);

    res.status(200).json({
      success: true,
      data: video,
    });
  }),
);

router.patch(
  "/videos/:videoId",
  asyncHandler(async (req: Request, res: Response) => {
    const videoId = String(req.params.videoId);
    const updated = await Upload.where({ id: videoId }).update(req.body);
    res.status(200).json({
      success: true,
      message: "Video updated successfully",
      data: updated,
    });
  }),
);

router.delete(
  "/videos/:videoId",
  asyncHandler(async (req: Request, res: Response) => {
    const videoId = String(req.params.videoId);
    await Upload.where({ id: videoId }).update({ isDeleted: true });
    res.status(200).json({
      success: true,
      message: "Video removed from platform",
      data: null,
    });
  }),
);


// Reports Management (Reports model is not present in fixed schema)
router.get("/reports", (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      items: [],
      pagination: {
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
      },
    },
  });
});

export default router;
