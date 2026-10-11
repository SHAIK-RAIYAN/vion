import { Router } from "express";
import {
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
} from "./video.controller";
import {
  authMiddleware,
  optionalAuthMiddleware,
} from "../../middlewares/authMiddleware";

const router = Router();

// Section 6: VIDEOS / PUBLICATION
router.post("/", authMiddleware, publishVideo);

// Section 8: PLAYBACK
router.get("/:videoId/playback", optionalAuthMiddleware, getPlayback);
router.get("/:videoId/manifest", getManifest);

// Section 9: REACTIONS
router.put("/:videoId/like", authMiddleware, likeVideo);
router.delete("/:videoId/like", authMiddleware, unlikeVideo);
router.get("/:videoId/like", optionalAuthMiddleware, getVideoLikeStatus);

// Section 10: COMMENTS (Video-scoped)
router.post("/:videoId/comments", authMiddleware, createVideoComment);
router.get("/:videoId/comments", getVideoComments);

// Section 14: THUMBNAILS
router.post("/:videoId/thumbnails/presigned-url", authMiddleware, getThumbnailPresignedUrl);
router.post("/:videoId/thumbnails/finalize", authMiddleware, finalizeThumbnail);
router.get("/:videoId/thumbnails", optionalAuthMiddleware, getThumbnails);
router.put("/:videoId/thumbnail", authMiddleware, setActiveThumbnail);
router.delete("/:videoId/thumbnails/:thumbnailId", authMiddleware, deleteThumbnail);

// Get video detail by ID (must come after subpaths like /playback, /manifest)
router.get("/:videoId", optionalAuthMiddleware, getVideoById);
router.patch("/:videoId", authMiddleware, updateVideo);
router.delete("/:videoId", authMiddleware, deleteVideo);

export default router;
