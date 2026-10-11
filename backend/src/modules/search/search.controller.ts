import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { paginationSchema } from "../../utils/pagination";
import * as searchService from "./search.service";

export const searchContent = asyncHandler(async (req: Request, res: Response) => {
  const query = typeof req.query.q === "string" ? req.query.q : "";
  const pagination = paginationSchema.parse(req.query);

  const result = await searchService.searchContent(query, pagination);
  res.status(200).json({
    success: true,
    message: "Search results fetched successfully",
    data: result,
    ...result,
  });
});

export const getSuggestions = asyncHandler(async (req: Request, res: Response) => {
  const query = typeof req.query.q === "string" ? req.query.q : "";
  const suggestions = await searchService.getSuggestions(query);

  res.status(200).json({
    success: true,
    message: "Search suggestions fetched successfully",
    data: suggestions,
  });
});
