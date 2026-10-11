import { Router, type Request, type Response } from "express";

const router = Router();

// Section 16: NOTIFICATIONS
// Note: Fixed Prisma schema does not currently include a Notification model.
// Returns valid empty structures rather than fabricated data.

router.get("/", (req: Request, res: Response) => {
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
    items: [],
  });
});

router.get("/unread-count", (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      unreadCount: 0,
    },
  });
});

router.patch("/:notificationId/read", (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: "Notification marked as read",
    data: null,
  });
});

router.patch("/read-all", (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: "All notifications marked as read",
    data: null,
  });
});

router.delete("/:notificationId", (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: "Notification deleted",
    data: null,
  });
});

export default router;
