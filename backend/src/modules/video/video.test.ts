import { describe, it, expect } from "bun:test";
import {
  publishVideo,
  getVideoById,
  getPlayback,
  getManifest,
  shouldIncrementView,
} from "./video.service";
import { db } from "../../prisma/db";
import { AppError } from "../../utils/AppError";

describe("Video Publication, Visibility & HLS Playback Delivery", () => {
  const mockChannelOwner = "user_owner_123";
  const mockStranger = "user_stranger_456";

  const completedPublicUpload = {
    id: "upl_completed_pub",
    channelId: "chan_owner_1",
    title: "Awesome HLS Stream",
    description: "An adaptive bitrate video",
    processingStatus: "COMPLETED",
    visibility: "PUBLIC",
    hlsManifestUrl: "https://nnenbfpjtggrhamveeiw.supabase.co/storage/v1/object/public/processed-videos/processed/chan_owner_1/upl_completed_pub/hls/master.m3u8",
    thumbnailUrl: "https://nnenbfpjtggrhamveeiw.supabase.co/storage/v1/object/public/thumbnails/thumbnails/chan_owner_1/upl_completed_pub/default.jpg",
    viewCount: 10,
    isDeleted: false,
    channel: {
      id: "chan_owner_1",
      userId: mockChannelOwner,
      handle: "vioncreator",
      channelName: "Vion Creator",
      profilePictureUrl: null,
    },
    videos: [
      { id: "v_1080", resolution: "1080p", url: "https://nnenbfpjtggrhamveeiw.supabase.co/storage/v1/object/public/processed-videos/processed/chan_owner_1/upl_completed_pub/hls/1080p/index.m3u8" },
      { id: "v_720", resolution: "720p", url: "https://nnenbfpjtggrhamveeiw.supabase.co/storage/v1/object/public/processed-videos/processed/chan_owner_1/upl_completed_pub/hls/720p/index.m3u8" },
    ],
    comments: [],
    interactions: [],
  };

  const pendingUpload = {
    id: "upl_pending",
    channelId: "chan_owner_1",
    title: "Still Transcoding",
    description: null,
    processingStatus: "TRANSCODING",
    visibility: "PUBLIC",
    hlsManifestUrl: null,
    thumbnailUrl: null,
    viewCount: 0,
    isDeleted: false,
    channel: {
      id: "chan_owner_1",
      userId: mockChannelOwner,
      handle: "vioncreator",
      channelName: "Vion Creator",
      profilePictureUrl: null,
    },
    videos: [],
    comments: [],
    interactions: [],
  };

  const completedPrivateUpload = {
    id: "upl_completed_priv",
    channelId: "chan_owner_1",
    title: "Secret Family Video",
    description: "Private video for owner only",
    processingStatus: "COMPLETED",
    visibility: "PRIVATE",
    hlsManifestUrl: "https://nnenbfpjtggrhamveeiw.supabase.co/storage/v1/object/public/processed-videos/processed/chan_owner_1/upl_completed_priv/hls/master.m3u8",
    thumbnailUrl: "https://nnenbfpjtggrhamveeiw.supabase.co/storage/v1/object/public/thumbnails/thumbnails/chan_owner_1/upl_completed_priv/default.jpg",
    viewCount: 5,
    isDeleted: false,
    channel: {
      id: "chan_owner_1",
      userId: mockChannelOwner,
      handle: "vioncreator",
      channelName: "Vion Creator",
      profilePictureUrl: null,
    },
    videos: [
      { id: "v_720", resolution: "720p", url: "https://nnenbfpjtggrhamveeiw.supabase.co/storage/v1/object/public/processed-videos/processed/chan_owner_1/upl_completed_priv/hls/720p/index.m3u8" },
    ],
    comments: [],
    interactions: [],
  };

  const completedUnlistedUpload = {
    id: "upl_completed_unlisted",
    channelId: "chan_owner_1",
    title: "Unlisted Video",
    description: "Accessible via direct link",
    processingStatus: "COMPLETED",
    visibility: "UNLISTED",
    hlsManifestUrl: "https://nnenbfpjtggrhamveeiw.supabase.co/storage/v1/object/public/processed-videos/processed/chan_owner_1/upl_completed_unlisted/hls/master.m3u8",
    thumbnailUrl: "https://nnenbfpjtggrhamveeiw.supabase.co/storage/v1/object/public/thumbnails/thumbnails/chan_owner_1/upl_completed_unlisted/default.jpg",
    viewCount: 20,
    isDeleted: false,
    channel: {
      id: "chan_owner_1",
      userId: mockChannelOwner,
      handle: "vioncreator",
      channelName: "Vion Creator",
      profilePictureUrl: null,
    },
    videos: [],
    comments: [],
    interactions: [],
  };

  // ==========================================================================
  // 1. Publication Lifecycle Gate
  // ==========================================================================
  describe("publishVideo (Publication Readiness Gate)", () => {
    it("successfully publishes an upload once transcoding is COMPLETED and HLS manifest is ready", async () => {
      const originalChannelWhere = db.orm.public.Channel.where;
      const originalUploadWhere = db.orm.public.Upload.where;

      let updatedFields: any = null;
      (db.orm.public.Channel as any).where = () => ({
        first: async () => ({ id: "chan_owner_1", userId: mockChannelOwner }),
      });
      (db.orm.public.Upload as any).where = () => ({
        first: async () => completedPublicUpload,
        update: async (data: any) => {
          updatedFields = data;
          return { ...completedPublicUpload, ...data };
        },
      });

      try {
        const result = await publishVideo(
          {
            uploadId: "upl_completed_pub",
            title: "Published Final Title",
            description: "Final Description",
            visibility: "PUBLIC",
          },
          mockChannelOwner,
        );

        expect(result?.processingStatus).toBe("COMPLETED");
        expect(updatedFields.title).toBe("Published Final Title");
        expect(updatedFields.visibility).toBe("PUBLIC");
      } finally {
        (db.orm.public.Channel as any).where = originalChannelWhere;
        (db.orm.public.Upload as any).where = originalUploadWhere;
      }
    });

    it("rejects publishing an incomplete or transcoding upload with 409 Conflict", async () => {
      const originalChannelWhere = db.orm.public.Channel.where;
      const originalUploadWhere = db.orm.public.Upload.where;

      (db.orm.public.Channel as any).where = () => ({
        first: async () => ({ id: "chan_owner_1", userId: mockChannelOwner }),
      });
      (db.orm.public.Upload as any).where = () => ({
        first: async () => pendingUpload,
      });

      try {
        await expect(
          publishVideo(
            { uploadId: "upl_pending", title: "Premature Publish", visibility: "PUBLIC" },
            mockChannelOwner,
          ),
        ).rejects.toThrow(AppError);
      } finally {
        (db.orm.public.Channel as any).where = originalChannelWhere;
        (db.orm.public.Upload as any).where = originalUploadWhere;
      }
    });

    it("rejects publishing if non-owner attempts to publish someone else's upload", async () => {
      const originalChannelWhere = db.orm.public.Channel.where;
      const originalUploadWhere = db.orm.public.Upload.where;

      (db.orm.public.Channel as any).where = () => ({
        first: async () => ({ id: "chan_stranger", userId: mockStranger }),
      });
      (db.orm.public.Upload as any).where = () => ({
        first: async () => completedPublicUpload,
      });

      try {
        await expect(
          publishVideo(
            { uploadId: "upl_completed_pub", visibility: "PUBLIC" },
            mockStranger, // Stranger
          ),
        ).rejects.toThrow(AppError);
      } finally {
        (db.orm.public.Channel as any).where = originalChannelWhere;
        (db.orm.public.Upload as any).where = originalUploadWhere;
      }
    });
  });

  // ==========================================================================
  // 2. Video Details & Visibility Authorization
  // ==========================================================================
  describe("getVideoById (Visibility & Access Control)", () => {
    it("allows anyone (including unauthenticated) to access PUBLIC videos", async () => {
      const originalUploadWhere = db.orm.public.Upload.where;
      (db.orm.public.Upload as any).where = () => ({
        include: () => ({
          include: () => ({
            include: () => ({
              include: () => ({
                first: async () => completedPublicUpload,
              }),
            }),
          }),
        }),
      });

      try {
        const video = await getVideoById("upl_completed_pub", undefined);
        expect(video.id).toBe("upl_completed_pub");
        expect(video.visibility).toBe("PUBLIC");
        expect(video.isReady).toBe(true);
      } finally {
        (db.orm.public.Upload as any).where = originalUploadWhere;
      }
    });

    it("allows link-based access to UNLISTED videos", async () => {
      const originalUploadWhere = db.orm.public.Upload.where;
      (db.orm.public.Upload as any).where = () => ({
        include: () => ({
          include: () => ({
            include: () => ({
              include: () => ({
                first: async () => completedUnlistedUpload,
              }),
            }),
          }),
        }),
      });

      try {
        const video = await getVideoById("upl_completed_unlisted", undefined);
        expect(video.id).toBe("upl_completed_unlisted");
        expect(video.visibility).toBe("UNLISTED");
      } finally {
        (db.orm.public.Upload as any).where = originalUploadWhere;
      }
    });

    it("allows the channel owner to access their own PRIVATE video", async () => {
      const originalUploadWhere = db.orm.public.Upload.where;
      (db.orm.public.Upload as any).where = () => ({
        include: () => ({
          include: () => ({
            include: () => ({
              include: () => ({
                first: async () => completedPrivateUpload,
              }),
            }),
          }),
        }),
      });

      try {
        const video = await getVideoById("upl_completed_priv", mockChannelOwner);
        expect(video.id).toBe("upl_completed_priv");
        expect(video.visibility).toBe("PRIVATE");
      } finally {
        (db.orm.public.Upload as any).where = originalUploadWhere;
      }
    });

    it("strictly blocks unauthorized users and guests from viewing PRIVATE videos with 403 Forbidden", async () => {
      const originalUploadWhere = db.orm.public.Upload.where;
      (db.orm.public.Upload as any).where = () => ({
        include: () => ({
          include: () => ({
            include: () => ({
              include: () => ({
                first: async () => completedPrivateUpload,
              }),
            }),
          }),
        }),
      });

      try {
        // Stranger attempt
        await expect(
          getVideoById("upl_completed_priv", mockStranger),
        ).rejects.toThrow(AppError);

        // Guest (unauthenticated) attempt
        await expect(
          getVideoById("upl_completed_priv", undefined),
        ).rejects.toThrow(AppError);
      } finally {
        (db.orm.public.Upload as any).where = originalUploadWhere;
      }
    });

    it("throws 404 Not Found for non-existent video IDs", async () => {
      const originalUploadWhere = db.orm.public.Upload.where;
      (db.orm.public.Upload as any).where = () => ({
        include: () => ({
          include: () => ({
            include: () => ({
              include: () => ({
                first: async () => null,
              }),
            }),
          }),
        }),
      });

      try {
        await expect(getVideoById("non_existent_id")).rejects.toThrow(AppError);
      } finally {
        (db.orm.public.Upload as any).where = originalUploadWhere;
      }
    });
  });

  // ==========================================================================
  // 3. Playback Configuration Delivery
  // ==========================================================================
  describe("getPlayback (Player Configuration)", () => {
    it("returns complete player configuration with streamType, hlsManifestUrl, renditions and channel", async () => {
      const originalUploadWhere = db.orm.public.Upload.where;
      (db.orm.public.Upload as any).where = () => ({
        include: () => ({
          include: () => ({
            first: async () => completedPublicUpload,
          }),
        }),
      });

      try {
        const playback = await getPlayback("upl_completed_pub", undefined);

        expect(playback.videoId).toBe("upl_completed_pub");
        expect(playback.streamType).toBe("HLS");
        expect(playback.hlsManifestUrl).toContain("master.m3u8");
        expect(playback.manifestRoute).toBe("/api/v1/videos/upl_completed_pub/manifest");
        expect(playback.isReady).toBe(true);
        expect(playback.renditions.length).toBe(2);
        expect(playback.renditions[0]?.resolution).toBe("1080p");
        expect(playback.channel?.handle).toBe("vioncreator");
      } finally {
        (db.orm.public.Upload as any).where = originalUploadWhere;
      }
    });

    it("blocks unauthorized playback of PRIVATE videos with 403 Forbidden", async () => {
      const originalUploadWhere = db.orm.public.Upload.where;
      (db.orm.public.Upload as any).where = () => ({
        include: () => ({
          include: () => ({
            first: async () => completedPrivateUpload,
          }),
        }),
      });

      try {
        await expect(getPlayback("upl_completed_priv", mockStranger)).rejects.toThrow(AppError);
      } finally {
        (db.orm.public.Upload as any).where = originalUploadWhere;
      }
    });
  });

  // ==========================================================================
  // 4. HLS Manifest Delivery
  // ==========================================================================
  describe("getManifest", () => {
    it("returns manifest URL for processed public video", async () => {
      const originalUploadWhere = db.orm.public.Upload.where;
      (db.orm.public.Upload as any).where = () => ({
        include: () => ({
          first: async () => completedPublicUpload,
        }),
      });

      try {
        const manifest = await getManifest("upl_completed_pub", undefined);
        expect(manifest.videoId).toBe("upl_completed_pub");
        expect(manifest.manifestUrl).toContain("master.m3u8");
      } finally {
        (db.orm.public.Upload as any).where = originalUploadWhere;
      }
    });

    it("blocks manifest access for PRIVATE videos from unauthorized callers", async () => {
      const originalUploadWhere = db.orm.public.Upload.where;
      (db.orm.public.Upload as any).where = () => ({
        include: () => ({
          first: async () => completedPrivateUpload,
        }),
      });

      try {
        await expect(getManifest("upl_completed_priv", mockStranger)).rejects.toThrow(AppError);
      } finally {
        (db.orm.public.Upload as any).where = originalUploadWhere;
      }
    });

    it("rejects manifest requests for videos that are still processing", async () => {
      const originalUploadWhere = db.orm.public.Upload.where;
      (db.orm.public.Upload as any).where = () => ({
        include: () => ({
          first: async () => pendingUpload,
        }),
      });

      try {
        await expect(getManifest("upl_pending", mockChannelOwner)).rejects.toThrow(AppError);
      } finally {
        (db.orm.public.Upload as any).where = originalUploadWhere;
      }
    });
  });

  // ==========================================================================
  // 5. Deliberate View Counting & Cooldown Strategy
  // ==========================================================================
  describe("View Count Debouncing & Cooldown", () => {
    it("increments view once and avoids duplicate counts during rapid polling within 60 seconds", () => {
      const clientId = "client_test_view_1";
      const vid = "video_view_test";

      // First call should increment
      const first = shouldIncrementView(clientId, vid);
      expect(first).toBe(true);

      // Immediate second call should be ignored by cooldown
      const second = shouldIncrementView(clientId, vid);
      expect(second).toBe(false);

      // Another client watching the same video should increment independently
      const otherClient = shouldIncrementView("client_test_view_2", vid);
      expect(otherClient).toBe(true);
    });
  });
});
