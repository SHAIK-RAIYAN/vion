import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { paginationSchema } from "../../utils/pagination";
import * as feedService from "./feed.service";

export const getFeed = asyncHandler(async (req: Request, res: Response) => {
  const pagination = paginationSchema.parse(req.query);
  const result = await feedService.getFeed(pagination, req.user?.id);

  res.status(200).json({
    success: true,
    message: "Feed fetched successfully",
    data: result,
    ...result,
  });
});
