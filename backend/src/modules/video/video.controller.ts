import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { AppError } from "../../utils/AppError";
import { paginationSchema } from "../../utils/pagination";
import * as videoService from "./video.service";
import * as commentService from "../comment/comment.service";
import * as mediaService from "../../services/mediaService";

const publishVideo = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const video = await videoService.publishVideo(req.body, req.user.id);
  res.status(201).json({
    success: true,
    message: "Video published successfully",
    data: video,
  });
});

const getVideoById = asyncHandler(async (req: Request, res: Response) => {
  const { videoId, id } = req.params;
  const targetId = videoId || id;
  if (!targetId || typeof targetId !== "string") {
    throw new AppError("Video ID is required.", 400);
  }

  // Derive client identity for view rate-limiting
  const clientIdentifier = req.user?.id || req.ip || "unknown";
  // Record view on normal page loads; ignore if client signals polling (x-polling header or poll=true)
  const isPolling = req.headers["x-polling"] === "true" || req.query.poll === "true";
  const recordView = !isPolling;

  const video = await videoService.getVideoById(targetId, req.user?.id, {
    clientIdentifier,
    recordView,
  });
  res.status(200).json({
    success: true,
    message: "Video fetched successfully",
    data: video,
  });
});

const updateVideo = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const { videoId, id } = req.params;
  const targetId = videoId || id;
  if (!targetId || typeof targetId !== "string") {
    throw new AppError("Video ID is required.", 400);
  }

  const updated = await videoService.updateVideo(targetId, req.body, req.user.id);
  res.status(200).json({
    success: true,
    message: "Video metadata updated successfully",
    data: updated,
  });
});

const deleteVideo = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const { videoId, id } = req.params;
  const targetId = videoId || id;
  if (!targetId || typeof targetId !== "string") {
    throw new AppError("Video ID is required.", 400);
  }

  const result = await videoService.deleteVideo(targetId, req.user.id);
  res.status(200).json({
    success: true,
    message: result.message,
    data: null,
  });
});

const getPlayback = asyncHandler(async (req: Request, res: Response) => {
  const { videoId, id } = req.params;
  const targetId = videoId || id;
  if (!targetId || typeof targetId !== "string") {
    throw new AppError("Video ID is required.", 400);
  }

  const playback = await videoService.getPlayback(targetId, req.user?.id);
  res.status(200).json({
    success: true,
    message: "Playback configuration fetched successfully",
    data: playback,
  });
});

const getManifest = asyncHandler(async (req: Request, res: Response) => {
  const { videoId, id } = req.params;
  const targetId = videoId || id;
  if (!targetId || typeof targetId !== "string") {
    throw new AppError("Video ID is required.", 400);
  }

  const manifestData = await videoService.getManifest(targetId, req.user?.id);

  // If client expects JSON response (API client or frontend query)
  const acceptHeader = req.headers.accept || "";
  if (acceptHeader.includes("application/json") || req.query.format === "json") {
    return res.status(200).json({
      success: true,
      message: "HLS manifest fetched successfully",
      data: manifestData,
    });
  }

  // Redirect directly to the HLS master playlist URL for media players (Safari, Hls.js, ExoPlayer)
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.redirect(302, manifestData.manifestUrl);
});

const likeVideo = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const { videoId, id } = req.params;
  const targetId = videoId || id;
  if (!targetId || typeof targetId !== "string") {
    throw new AppError("Video ID is required.", 400);
  }

  const result = await videoService.likeVideo(targetId, req.user.id);
  res.status(200).json({
    success: true,
    message: "Video liked successfully",
    data: result,
  });
});

const unlikeVideo = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const { videoId, id } = req.params;
  const targetId = videoId || id;
  if (!targetId || typeof targetId !== "string") {
    throw new AppError("Video ID is required.", 400);
  }

  const result = await videoService.unlikeVideo(targetId, req.user.id);
  res.status(200).json({
    success: true,
    message: "Like removed successfully",
    data: result,
  });
});

const getVideoLikeStatus = asyncHandler(async (req: Request, res: Response) => {
  const { videoId, id } = req.params;
  const targetId = videoId || id;
  if (!targetId || typeof targetId !== "string") {
    throw new AppError("Video ID is required.", 400);
  }

  const counts = await videoService.getVideoLikeStatus(targetId, req.user?.id);
  res.status(200).json({
    success: true,
    message: "Video reaction status fetched successfully",
    data: counts,
  });
});

const createVideoComment = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const { videoId, id } = req.params;
  const targetId = videoId || id;
  if (!targetId || typeof targetId !== "string") {
    throw new AppError("Video ID is required.", 400);
  }

  const comment = await commentService.createComment(
    targetId,
    req.user.id,
    req.body,
  );
  res.status(201).json({
    success: true,
    message: "Comment created successfully",
    data: comment,
  });
});

const getVideoComments = asyncHandler(async (req: Request, res: Response) => {
  const { videoId, id } = req.params;
  const targetId = videoId || id;
  if (!targetId || typeof targetId !== "string") {
    throw new AppError("Video ID is required.", 400);
  }

  const pagination = paginationSchema.parse(req.query);
  const result = await commentService.getCommentsByUpload(
    targetId,
    pagination,
    req.user?.id,
  );
  res.status(200).json({
    success: true,
    message: "Comments fetched successfully",
    data: result,
    ...result,
  });
});

const getThumbnailPresignedUrl = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const { videoId, id } = req.params;
  const targetId = videoId || id;
  if (!targetId || typeof targetId !== "string") {
    throw new AppError("Video ID is required.", 400);
  }

  const result = await videoService.getThumbnailPresignedUrl(
    targetId,
    req.body,
    req.user.id,
  );
  res.status(201).json({
    success: true,
    message: "Thumbnail upload URL generated",
    data: result,
  });
});

const finalizeThumbnail = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }

  const { videoId, id } = req.params;
  const targetId = videoId || id;
  if (!targetId || typeof targetId !== "string") {
    throw new AppError("Video ID is required.", 400);
  }

  const updated = await videoService.finalizeThumbnail(
    targetId,
    req.body.thumbnailUrl,
    req.user.id,
  );
  res.status(200).json({
    success: true,
    message: "Thumbnail updated successfully",
    data: updated,
  });
});

const getThumbnails = asyncHandler(async (req: Request, res: Response) => {
  const { videoId, id } = req.params;
  const targetId = String(videoId || id || "");
  if (!targetId) {
    throw new AppError("Video ID is required.", 400);
  }

  const video = await videoService.getVideoById(targetId, req.user?.id);
  const stored = await mediaService.listStoredThumbnails(video.channel.id, targetId);

  const thumbnails = stored.thumbnails.map((t) => ({
    id: t.name,
    name: t.name,
    url: t.url,
    sizeBytes: t.sizeBytes,
    isActive: t.url === video.thumbnailUrl || (t.name === "default.jpg" && Boolean(video.thumbnailUrl)),
  }));

  res.status(200).json({
    success: true,
    message: "Thumbnails fetched successfully",
    data:
      thumbnails.length > 0
        ? thumbnails
        : video.thumbnailUrl
          ? [{ id: "default", name: "default.jpg", url: video.thumbnailUrl, isActive: true }]
          : [],
  });
});

const setActiveThumbnail = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }
  const { videoId, id } = req.params;
  const targetId = String(videoId || id || "");
  if (!targetId) {
    throw new AppError("Video ID is required.", 400);
  }

  const updated = await videoService.finalizeThumbnail(
    targetId,
    String(req.body?.thumbnailUrl || ""),
    req.user.id,
  );
  res.status(200).json({
    success: true,
    message: "Active thumbnail updated",
    data: updated,
  });
});

const deleteThumbnail = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized.", 401);
  }
  const { videoId, id } = req.params;
  const targetId = String(videoId || id || "");
  if (!targetId) {
    throw new AppError("Video ID is required.", 400);
  }

  await videoService.finalizeThumbnail(targetId, "", req.user.id);
  res.status(200).json({
    success: true,
    message: "Thumbnail removed",
    data: null,
  });
});


export {
  publishVideo,
  getVideoById,
  updateVideo,
  deleteVideo,
  getPlayback,
  getManifest,
  likeVideo,
  unlikeVideo,
  getVideoLikeStatus,
  createVideoComment,
  getVideoComments,
  getThumbnailPresignedUrl,
  finalizeThumbnail,
  getThumbnails,
  setActiveThumbnail,
  deleteThumbnail,
};
