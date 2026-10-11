import { Router, type Request, type Response } from "express";

const router = Router();

const DEFAULT_CATEGORIES = [
  { id: "all", name: "All", slug: "all" },
  { id: "music", name: "Music", slug: "music" },
  { id: "gaming", name: "Gaming", slug: "gaming" },
  { id: "tech", name: "Technology", slug: "tech" },
  { id: "education", name: "Education", slug: "education" },
  { id: "entertainment", name: "Entertainment", slug: "entertainment" },
  { id: "news", name: "News", slug: "news" },
  { id: "sports", name: "Sports", slug: "sports" },
  { id: "podcasts", name: "Podcasts", slug: "podcasts" },
];

// Section 15: CATEGORIES
router.get("/", (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: DEFAULT_CATEGORIES,
  });
});

router.get("/:categoryId", (req: Request, res: Response) => {
  const { categoryId } = req.params;
  const found = DEFAULT_CATEGORIES.find(
    (c) => c.id === categoryId || c.slug === categoryId,
  );
  if (!found) {
    return res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Category not found",
      },
    });
  }

  return res.status(200).json({
    success: true,
    data: found,
  });
});

export default router;
