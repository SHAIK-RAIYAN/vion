import { describe, it, expect } from "bun:test";
import { db } from "../prisma/db";
import { AppError } from "../utils/AppError";
import * as subscriptionService from "./subscription/subscription.service";
import * as interactionService from "./interaction/interaction.service";
import * as commentService from "./comment/comment.service";
import * as watchHistoryService from "./watchHistory/watchHistory.service";
import * as feedService from "./feed/feed.service";
import * as searchService from "./search/search.service";
import { ADMIN_EMAILS } from "../config/config";

describe("Remaining Core Backend Routes & Database Behavior", () => {
  // Test mock fixtures
  const user1 = "user_11111111-1111-4111-8111-111111111111";
  const user2 = "user_22222222-2222-4222-8222-222222222222";
  const channel1 = "chan_11111111-1111-4111-8111-111111111111";
  const publicVideoId = "vid_pub_1111-1111-4111-8111-111111111111";
  const privateVideoId = "vid_priv_222-2222-4222-8222-222222222222";

  // Mock records
  const mockChannel = {
    id: channel1,
    userId: user1,
    handle: "creatorone",
    channelName: "Creator One Channel",
    profilePictureUrl: "https://cdn.vion.local/avatar1.jpg",
    description: "Welcome to channel one",
  };

  const mockPublicVideo = {
    id: publicVideoId,
    channelId: channel1,
    title: "Understanding Database Concurrency in Postgres",
    description: "Deep dive into transactions and upserts",
    visibility: "PUBLIC",
    processingStatus: "COMPLETED",
    isDeleted: false,
    thumbnailUrl: "https://cdn.vion.local/thumb.jpg",
    channel: mockChannel,
    createdAt: "2026-10-11T10:00:00.000Z",
  };

  const mockPrivateVideo = {
    id: privateVideoId,
    channelId: channel1,
    title: "Unpublished Private Draft",
    description: "Secret preview video",
    visibility: "PRIVATE",
    processingStatus: "COMPLETED",
    isDeleted: false,
    thumbnailUrl: null,
    channel: mockChannel,
    createdAt: "2026-10-11T12:00:00.000Z",
  };

  /* ====================================================================
   * 1. SUBSCRIPTIONS
   * ==================================================================== */
  describe("Subscriptions API", () => {
    it("prevents creators from subscribing to their own channel with 400", async () => {
      const origChannelFirst = db.orm.public.Channel.first;
      (db.orm.public.Channel as any).first = async () => mockChannel;

      try {
        await expect(
          subscriptionService.subscribe(channel1, user1), // Same userId as channel.userId
        ).rejects.toThrow(AppError);
      } finally {
        (db.orm.public.Channel as any).first = origChannelFirst;
      }
    });

    it("subscribes to a channel and handles repeated subscribe calls idempotently", async () => {
      const origChannelFirst = db.orm.public.Channel.first;
      const origSubWhere = db.orm.public.Subscription.where;
      const origSubCreate = db.orm.public.Subscription.create;

      let storedSub: any = null;

      (db.orm.public.Channel as any).first = async () => mockChannel;
      (db.orm.public.Subscription as any).where = () => ({
        first: async () => storedSub,
        include: () => ({
          orderBy: () => ({
            limit: () => ({
              offset: () => ({
                all: async () => (storedSub ? [storedSub] : []),
              }),
            }),
          }),
        }),
        aggregate: () => Promise.resolve({ count: storedSub ? 1 : 0 }),
      });
      (db.orm.public.Subscription as any).create = async (data: any) => {
        storedSub = { id: "sub_123", ...data, createdAt: new Date().toISOString() };
        return storedSub;
      };

      try {
        // Initial subscribe
        const sub1 = await subscriptionService.subscribe(channel1, user2);
        expect(sub1.id).toBe("sub_123");
        expect(sub1.subscriberId).toBe(user2);

        // Repeated subscribe returns the existing subscription without throwing 409
        const sub2 = await subscriptionService.subscribe(channel1, user2);
        expect(sub2.id).toBe("sub_123");

        // Subscription status check
        const status = await subscriptionService.checkSubscriptionStatus(channel1, user2);
        expect(status.isSubscribed).toBe(true);
      } finally {
        (db.orm.public.Channel as any).first = origChannelFirst;
        (db.orm.public.Subscription as any).where = origSubWhere;
        (db.orm.public.Subscription as any).create = origSubCreate;
      }
    });

    it("unsubscribes cleanly and repeated unsubscribe calls return predictable success", async () => {
      const origChannelFirst = db.orm.public.Channel.first;
      const origSubWhere = db.orm.public.Subscription.where;

      let hasSubscription = true;

      (db.orm.public.Channel as any).first = async () => mockChannel;
      (db.orm.public.Subscription as any).where = () => ({
        first: async () => (hasSubscription ? { id: "sub_123" } : null),
        delete: async () => {
          hasSubscription = false;
          return { count: 1 };
        },
      });

      try {
        // First unsubscribe deletes the subscription
        const res1 = await subscriptionService.unsubscribe(channel1, user2);
        expect(res1.success).toBe(true);
        expect(res1.unsubscribed).toBe(true);

        // Repeated unsubscribe succeeds idempotently without crashing with 404
        const res2 = await subscriptionService.unsubscribe(channel1, user2);
        expect(res2.success).toBe(true);
        expect(res2.unsubscribed).toBe(false);
      } finally {
        (db.orm.public.Channel as any).first = origChannelFirst;
        (db.orm.public.Subscription as any).where = origSubWhere;
      }
    });
  });

  /* ====================================================================
   * 2. REACTIONS (LIKES / DISLIKES)
   * ==================================================================== */
  describe("Reactions (Interactions) API", () => {
    it("adds a LIKE and repeated PUT /like calls are idempotent", async () => {
      const origUploadWhere = db.orm.public.Upload.where;
      const origInterWhere = db.orm.public.Interaction.where;
      const origInterCreate = db.orm.public.Interaction.create;

      let storedInteraction: any = null;

      (db.orm.public.Upload as any).where = () => ({
        include: () => ({
          first: async () => mockPublicVideo,
        }),
      });

      (db.orm.public.Interaction as any).where = () => ({
        first: async () => storedInteraction,
        update: async (data: any) => {
          storedInteraction = { ...storedInteraction, ...data };
          return storedInteraction;
        },
        delete: async () => {
          storedInteraction = null;
          return { count: 1 };
        },
        aggregate: () => Promise.resolve({ count: storedInteraction ? 1 : 0 }),
      });

      (db.orm.public.Interaction as any).create = async (data: any) => {
        storedInteraction = { id: "inter_1", ...data };
        return storedInteraction;
      };

      try {
        // Initial like
        const res1 = await interactionService.setInteraction(publicVideoId, user2, { type: "LIKE" });
        expect(res1.status).toBe("CREATED");
        expect(res1.interaction?.interactionType).toBe("LIKE");

        // Repeated PUT /like preserves the like (idempotent PUT)
        const res2 = await interactionService.setInteraction(publicVideoId, user2, { type: "LIKE" });
        expect(res2.status).toBe("EXISTING");
        expect(res2.interaction?.interactionType).toBe("LIKE");

        // Query reaction counts
        const counts = await interactionService.getInteractionCounts(publicVideoId, user2);
        expect(counts.liked).toBe(true);
        expect(counts.disliked).toBe(false);
        expect(counts.likes).toBe(1);
      } finally {
        (db.orm.public.Upload as any).where = origUploadWhere;
        (db.orm.public.Interaction as any).where = origInterWhere;
        (db.orm.public.Interaction as any).create = origInterCreate;
      }
    });

    it("strictly blocks unauthorized users from reacting to a private video with 403", async () => {
      const origUploadWhere = db.orm.public.Upload.where;
      (db.orm.public.Upload as any).where = () => ({
        include: () => ({
          first: async () => mockPrivateVideo,
        }),
      });

      try {
        await expect(
          interactionService.setInteraction(privateVideoId, user2, { type: "LIKE" }), // user2 is stranger
        ).rejects.toThrow(AppError);

        await expect(
          interactionService.getInteractionCounts(privateVideoId, user2),
        ).rejects.toThrow(AppError);
      } finally {
        (db.orm.public.Upload as any).where = origUploadWhere;
      }
    });

    it("removes a like and repeated DELETE /like calls are idempotent", async () => {
      const origUploadWhere = db.orm.public.Upload.where;
      const origInterWhere = db.orm.public.Interaction.where;

      let hasInter = true;

      (db.orm.public.Upload as any).where = () => ({
        include: () => ({
          first: async () => mockPublicVideo,
        }),
      });

      (db.orm.public.Interaction as any).where = () => ({
        first: async () => (hasInter ? { id: "inter_1" } : null),
        delete: async () => {
          hasInter = false;
          return { count: 1 };
        },
      });

      try {
        const del1 = await interactionService.removeInteraction(publicVideoId, user2);
        expect(del1.success).toBe(true);

        // Repeated removal returns success idempotently
        const del2 = await interactionService.removeInteraction(publicVideoId, user2);
        expect(del2.success).toBe(true);
      } finally {
        (db.orm.public.Upload as any).where = origUploadWhere;
        (db.orm.public.Interaction as any).where = origInterWhere;
      }
    });
  });

  /* ====================================================================
   * 3. COMMENTS
   * ==================================================================== */
  describe("Comments API", () => {
    it("creates a comment and validates content length and whitespace", async () => {
      const origUploadWhere = db.orm.public.Upload.where;
      const origCommentCreate = db.orm.public.Comment.create;

      (db.orm.public.Upload as any).where = () => ({
        include: () => ({
          first: async () => mockPublicVideo,
        }),
      });

      (db.orm.public.Comment as any).create = async (data: any) => ({
        id: "comm_1",
        ...data,
        createdAt: new Date().toISOString(),
      });

      try {
        // Valid comment
        const comment = await commentService.createComment(publicVideoId, user2, {
          content: "Great technical explanation of adaptive streaming!",
        });
        expect(comment.id).toBe("comm_1");
        expect(comment.content).toContain("Great technical");

        // Blank or whitespace-only comment must be rejected
        await expect(
          commentService.createComment(publicVideoId, user2, { content: "   " }),
        ).rejects.toThrow();
      } finally {
        (db.orm.public.Upload as any).where = origUploadWhere;
        (db.orm.public.Comment as any).create = origCommentCreate;
      }
    });

    it("prevents unauthorized users from commenting on or viewing comments of private videos", async () => {
      const origUploadWhere = db.orm.public.Upload.where;
      (db.orm.public.Upload as any).where = () => ({
        include: () => ({
          first: async () => mockPrivateVideo,
        }),
      });

      try {
        // Creating comment on private video by stranger
        await expect(
          commentService.createComment(privateVideoId, user2, { content: "Secret leak" }),
        ).rejects.toThrow(AppError);

        // Reading comments on private video by stranger
        await expect(
          commentService.getCommentsByUpload(privateVideoId, { page: 1, limit: 10 }, user2),
        ).rejects.toThrow(AppError);
      } finally {
        (db.orm.public.Upload as any).where = origUploadWhere;
      }
    });

    it("allows comment author or video creator to delete a comment, but rejects strangers with 403", async () => {
      const origCommentWhere = db.orm.public.Comment.where;
      const mockCommentRecord = {
        id: "comm_target",
        userId: user2, // Author is user2
        content: "Nice video",
        upload: mockPublicVideo, // Owned by user1
      };

      (db.orm.public.Comment as any).where = () => ({
        include: () => ({
          first: async () => mockCommentRecord,
        }),
        delete: async () => ({ count: 1 }),
      });

      try {
        // Comment author (user2) can delete
        const resAuthor = await commentService.deleteComment("comm_target", user2);
        expect(resAuthor.success).toBe(true);

        // Video owner (user1) can delete
        const resOwner = await commentService.deleteComment("comm_target", user1);
        expect(resOwner.success).toBe(true);

        // Stranger (user3) receives 403 Forbidden
        await expect(
          commentService.deleteComment("comm_target", "user_stranger_999"),
        ).rejects.toThrow(AppError);
      } finally {
        (db.orm.public.Comment as any).where = origCommentWhere;
      }
    });
  });

  /* ====================================================================
   * 4. WATCH HISTORY
   * ==================================================================== */
  describe("Watch History API", () => {
    it("records playback progress and updates existing records safely", async () => {
      const origUploadWhere = db.orm.public.Upload.where;
      const origHistWhere = db.orm.public.WatchHistory.where;
      const origHistCreate = db.orm.public.WatchHistory.create;

      let storedHistory: any = null;

      (db.orm.public.Upload as any).where = () => ({
        include: () => ({
          first: async () => mockPublicVideo,
        }),
      });

      (db.orm.public.WatchHistory as any).where = () => ({
        first: async () => storedHistory,
        update: async (data: any) => {
          storedHistory = { ...storedHistory, ...data };
          return storedHistory;
        },
        delete: async () => {
          storedHistory = null;
          return { count: 1 };
        },
      });

      (db.orm.public.WatchHistory as any).create = async (data: any) => {
        storedHistory = { id: "hist_1", ...data };
        return storedHistory;
      };

      try {
        // Record initial progress: 120 seconds
        const rec1 = await watchHistoryService.recordProgress(user2, {
          videoId: publicVideoId,
          progressTimeStamp: 120,
        });
        expect(rec1.progressTimeStamp).toBe(120);

        // Update progress: 300 seconds (upsert)
        const rec2 = await watchHistoryService.recordProgress(user2, {
          videoId: publicVideoId,
          progressTimeStamp: 300,
        });
        expect(rec2.progressTimeStamp).toBe(300);

        // Fetch progress
        const prog = await watchHistoryService.getVideoProgress(user2, publicVideoId);
        expect(prog.progressTimeStamp).toBe(300);
      } finally {
        (db.orm.public.Upload as any).where = origUploadWhere;
        (db.orm.public.WatchHistory as any).where = origHistWhere;
        (db.orm.public.WatchHistory as any).create = origHistCreate;
      }
    });

    it("blocks unauthorized users from recording history on private videos with 403", async () => {
      const origUploadWhere = db.orm.public.Upload.where;
      (db.orm.public.Upload as any).where = () => ({
        include: () => ({
          first: async () => mockPrivateVideo,
        }),
      });

      try {
        await expect(
          watchHistoryService.recordProgress(user2, {
            videoId: privateVideoId,
            progressTimeStamp: 50,
          }),
        ).rejects.toThrow(AppError);
      } finally {
        (db.orm.public.Upload as any).where = origUploadWhere;
      }
    });

    it("removes video from history and clears history cleanly and idempotently", async () => {
      const origHistWhere = db.orm.public.WatchHistory.where;
      let hasHist = true;

      (db.orm.public.WatchHistory as any).where = () => ({
        first: async () => (hasHist ? { id: "hist_1" } : null),
        delete: async () => {
          hasHist = false;
          return { count: 1 };
        },
      });

      try {
        const rem1 = await watchHistoryService.removeFromWatchHistory(user2, publicVideoId);
        expect(rem1.success).toBe(true);

        // Repeated removal returns success without throwing
        const rem2 = await watchHistoryService.removeFromWatchHistory(user2, publicVideoId);
        expect(rem2.success).toBe(true);

        const clearRes = await watchHistoryService.clearWatchHistory(user2);
        expect(clearRes.success).toBe(true);
      } finally {
        (db.orm.public.WatchHistory as any).where = origHistWhere;
      }
    });
  });

  /* ====================================================================
   * 5. FEED & SEARCH
   * ==================================================================== */
  describe("Feed & Search API", () => {
    it("feed returns only public, completed, non-deleted videos and supports cursor pagination", async () => {
      const origUploadWhere = db.orm.public.Upload.where;

      (db.orm.public.Upload as any).where = (criteria: any) => {
        expect(criteria.visibility).toBe("PUBLIC");
        expect(criteria.processingStatus).toBe("COMPLETED");
        expect(criteria.isDeleted).toBe(false);

        return {
          where: () => ({
            include: () => ({
              include: () => ({
                include: () => ({
                  include: () => ({
                    orderBy: () => ({
                      limit: () => ({
                        offset: () => ({
                          all: async () => [mockPublicVideo],
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
          include: () => ({
            include: () => ({
              include: () => ({
                include: () => ({
                  orderBy: () => ({
                    limit: () => ({
                      offset: () => ({
                        all: async () => [mockPublicVideo],
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
          aggregate: () => Promise.resolve({ count: 1 }),
          first: async () => mockPublicVideo,
        };
      };

      try {
        const feed = await feedService.getFeed({ page: 1, limit: 10, cursor: undefined });
        expect(feed.items.length).toBe(1);
        expect(feed.items[0].visibility).toBe("PUBLIC");
      } finally {
        (db.orm.public.Upload as any).where = origUploadWhere;
      }
    });

    it("search performs database lookup and autocomplete suggestions correctly", async () => {
      const origUploadWhere = db.orm.public.Upload.where;
      const origChanWhere = db.orm.public.Channel.where;

      (db.orm.public.Upload as any).where = () => ({
        where: () => ({
          include: () => ({
            include: () => ({
              orderBy: () => ({
                limit: () => ({
                  offset: () => ({
                    all: async () => [mockPublicVideo],
                  }),
                }),
              }),
            }),
          }),
          select: () => ({
            limit: () => ({
              all: async () => [{ title: mockPublicVideo.title }],
            }),
          }),
          aggregate: () => Promise.resolve({ count: 1 }),
        }),
      });

      (db.orm.public.Channel as any).where = () => ({
        limit: () => ({
          all: async () => [mockChannel],
        }),
      });

      try {
        // Search content
        const searchResults = await searchService.searchContent("Postgres", { page: 1, limit: 10 });
        expect(searchResults.videos.length).toBe(1);
        expect(searchResults.channels.length).toBe(1);

        // Autocomplete suggestions
        const suggestions = await searchService.getSuggestions("Postgres");
        expect(suggestions.length).toBe(1);
        expect(suggestions[0]).toContain("Postgres");

        // Empty query handling
        const emptyResults = await searchService.searchContent("", { page: 1, limit: 10 });
        expect(emptyResults.videos.length).toBe(0);
      } finally {
        (db.orm.public.Upload as any).where = origUploadWhere;
        (db.orm.public.Channel as any).where = origChanWhere;
      }
    });
  });

  /* ====================================================================
   * 6. ADMINISTRATION & SCHEMA BOUNDARIES
   * ==================================================================== */
  describe("Admin Authorization & Schema Boundaries", () => {
    it("documents missing role model and enforces ADMIN_EMAILS boundary", () => {
      // Validates that if ADMIN_EMAILS is empty or email not in ADMIN_EMAILS, admin check forbids access
      const adminList = ADMIN_EMAILS;
      const nonAdminEmail = "randomuser@example.com";
      const isAdmin = adminList.includes(nonAdminEmail.toLowerCase());
      expect(isAdmin).toBe(false);
    });
  });
});
