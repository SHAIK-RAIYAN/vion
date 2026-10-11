import { describe, it, expect } from "bun:test";
import { db } from "../prisma/db";
import * as interactionService from "./interaction/interaction.service";
import * as commentService from "./comment/comment.service";
import * as watchHistoryService from "./watchHistory/watchHistory.service";
import { updateProgressSchema, recordHistorySchema } from "./watchHistory/watchHistory.schema";
import { AppError } from "../utils/AppError";

describe("Vion Integration Fixes Verification", () => {
  const testUserId = "user_fix_test_1111-1111-4111-8111-111111111111";
  const otherUserId = "user_fix_test_2222-2222-4222-8222-222222222222";
  const testVideoId = "vid_fix_test_1111-1111-4111-8111-111111111111";

  const mockChannel = {
    id: "chan_fix_1111-1111-4111-8111-111111111111",
    userId: testUserId,
    handle: "testcreator",
    channelName: "Test Creator",
    profilePictureUrl: "https://example.com/avatar.jpg",
  };

  const mockUpload = {
    id: testVideoId,
    channelId: mockChannel.id,
    title: "Test Video For Fixes",
    visibility: "PUBLIC",
    isDeleted: false,
    channel: mockChannel,
  };

  /* ====================================================================
   * 1. INTERACTIONS & LIKE UPDATEDAT
   * ==================================================================== */
  describe("1. Like / Interaction Fixes", () => {
    it("creates a LIKE interaction with updatedAt and returns CREATED", async () => {
      // Mock db queries
      const origUploadWhere = db.orm.public.Upload.where;
      const origInteractionWhere = db.orm.public.Interaction.where;
      const origInteractionCreate = db.orm.public.Interaction.create;

      (db.orm.public.Upload as any).where = () => ({
        include: () => ({
          first: async () => mockUpload,
        }),
      });

      let interactionState: any = null;
      (db.orm.public.Interaction as any).where = () => ({
        first: async () => interactionState,
      });

      (db.orm.public.Interaction as any).create = async (data: any) => {
        interactionState = {
          id: "inter_123",
          ...data,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        return interactionState;
      };

      const result = await interactionService.setInteraction(testVideoId, testUserId, { type: "LIKE" });
      expect(result.status).toBe("CREATED");
      expect(result.interaction?.interactionType).toBe("LIKE");
      expect(result.interaction?.updatedAt).toBeDefined();

      // Repeated like is idempotent and returns EXISTING
      const repeat = await interactionService.setInteraction(testVideoId, testUserId, { type: "LIKE" });
      expect(repeat.status).toBe("EXISTING");
      expect(repeat.interaction?.interactionType).toBe("LIKE");

      // Cleanup mocks
      (db.orm.public.Upload as any).where = origUploadWhere;
      (db.orm.public.Interaction as any).where = origInteractionWhere;
      (db.orm.public.Interaction as any).create = origInteractionCreate;
    });

    it("removes a like cleanly and reports accurate interaction status", async () => {
      const origUploadWhere = db.orm.public.Upload.where;
      const origInteractionWhere = db.orm.public.Interaction.where;

      (db.orm.public.Upload as any).where = () => ({
        include: () => ({
          first: async () => mockUpload,
        }),
      });

      let deleted = false;
      (db.orm.public.Interaction as any).where = () => ({
        first: async () => ({ id: "inter_123", interactionType: "LIKE" }),
        delete: async () => {
          deleted = true;
          return { count: 1 };
        },
      });

      const removeRes = await interactionService.removeInteraction(testVideoId, testUserId);
      expect(removeRes.success).toBe(true);
      expect(deleted).toBe(true);

      (db.orm.public.Upload as any).where = origUploadWhere;
      (db.orm.public.Interaction as any).where = origInteractionWhere;
    });
  });

  /* ====================================================================
   * 2. COMMENT AUTHOR INFORMATION
   * ==================================================================== */
  describe("2. Comment Author Information Fixes", () => {
    it("returns newly created comment populated with author user and channel", async () => {
      const origUploadWhere = db.orm.public.Upload.where;
      const origCommentCreate = db.orm.public.Comment.create;
      const origCommentWhere = db.orm.public.Comment.where;

      (db.orm.public.Upload as any).where = () => ({
        include: () => ({
          first: async () => mockUpload,
        }),
      });

      const fakeComment = {
        id: "comm_999",
        uploadId: testVideoId,
        userId: testUserId,
        content: "Awesome video!",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      (db.orm.public.Comment as any).create = async () => fakeComment;

      (db.orm.public.Comment as any).where = () => ({
        include: () => ({
          first: async () => ({
            ...fakeComment,
            user: {
              id: testUserId,
              firstName: "Shaik",
              lastName: "Raiyan",
              channel: mockChannel,
            },
          }),
        }),
      });

      const res = await commentService.createComment(testVideoId, testUserId, {
        content: "Awesome video!",
      });

      expect(res.id).toBe("comm_999");
      expect(res.content).toBe("Awesome video!");
      expect((res as any).user).toBeDefined();
      expect((res as any).user.firstName).toBe("Shaik");
      expect((res as any).user.lastName).toBe("Raiyan");
      expect((res as any).user.channel.channelName).toBe("Test Creator");

      // Restore mocks
      (db.orm.public.Upload as any).where = origUploadWhere;
      (db.orm.public.Comment as any).create = origCommentCreate;
      (db.orm.public.Comment as any).where = origCommentWhere;
    });

    it("enforces ownership when deleting comments", async () => {
      const origCommentWhere = db.orm.public.Comment.where;

      (db.orm.public.Comment as any).where = () => ({
        include: () => ({
          first: async () => ({
            id: "comm_999",
            userId: testUserId,
            upload: { channel: { userId: testUserId } },
          }),
        }),
      });

      // Unauthorized user fails with 403
      expect(commentService.deleteComment("comm_999", otherUserId)).rejects.toThrow(
        AppError,
      );

      (db.orm.public.Comment as any).where = origCommentWhere;
    });
  });

  /* ====================================================================
   * 3. WATCH HISTORY SCHEMA & PROGRESS PERSISTENCE
   * ==================================================================== */
  describe("3. Watch History Progress Fixes", () => {
    it("updateProgressSchema handles both progressTimeStamp and progressTimestamp and coerces floats", () => {
      // 1. Accepts capital S
      const res1 = updateProgressSchema.parse({ progressTimeStamp: 42 });
      expect(res1.progressTimeStamp).toBe(42);

      // 2. Accepts lowercase s
      const res2 = updateProgressSchema.parse({ progressTimestamp: 85 });
      expect(res2.progressTimeStamp).toBe(85);

      // 3. Coerces floating seconds from video.currentTime
      const res3 = updateProgressSchema.parse({ progressTimeStamp: 19.8394 });
      expect(res3.progressTimeStamp).toBe(19);

      // 4. Defaults negative numbers to 0
      const res4 = updateProgressSchema.parse({ progressTimeStamp: -5 });
      expect(res4.progressTimeStamp).toBe(0);
    });

    it("recordHistorySchema accepts both formats and extracts valid uploadId", () => {
      const res = recordHistorySchema.parse({
        videoId: testVideoId,
        progressTimestamp: 60.5,
      });
      expect(res.uploadId).toBe(testVideoId);
      expect(res.progressTimeStamp).toBe(60);
    });

    it("prevents out-of-order network updates from regressing watch progress", async () => {
      const origUploadWhere = db.orm.public.Upload.where;
      const origHistoryWhere = db.orm.public.WatchHistory.where;

      (db.orm.public.Upload as any).where = () => ({
        include: () => ({
          first: async () => mockUpload,
        }),
      });

      let savedProgress = 50;
      (db.orm.public.WatchHistory as any).where = () => ({
        first: async () => ({
          id: "wh_1",
          userId: testUserId,
          uploadId: testVideoId,
          progressTimeStamp: savedProgress,
        }),
        update: async (data: any) => {
          savedProgress = data.progressTimeStamp;
          return { id: "wh_1", ...data };
        },
      });

      // 1. Advance to 60s
      await watchHistoryService.recordProgress(testUserId, {
        uploadId: testVideoId,
        progressTimeStamp: 60,
      });
      expect(savedProgress).toBe(60);

      // 2. Delayed packet arrives with 45s (out of order) -> does NOT regress progress
      await watchHistoryService.recordProgress(testUserId, {
        uploadId: testVideoId,
        progressTimeStamp: 45,
      });
      expect(savedProgress).toBe(60);

      // 3. User restarts from beginning (0s or <= 5s) -> allows rewind
      await watchHistoryService.recordProgress(testUserId, {
        uploadId: testVideoId,
        progressTimeStamp: 2,
      });
      expect(savedProgress).toBe(2);

      (db.orm.public.Upload as any).where = origUploadWhere;
      (db.orm.public.WatchHistory as any).where = origHistoryWhere;
    });

    it("getWatchHistory filters out deleted/null uploads safely", async () => {
      const origHistoryWhere = db.orm.public.WatchHistory.where;

      (db.orm.public.WatchHistory as any).where = () => ({
        include: () => ({
          orderBy: () => ({
            limit: () => ({
              offset: () => ({
                all: async () => [
                  { id: "wh_1", upload: mockUpload, progressTimeStamp: 30 },
                  { id: "wh_2", upload: null, progressTimeStamp: 10 }, // deleted video
                ],
              }),
            }),
          }),
        }),
        aggregate: async () => ({ count: 2 }),
      });

      const history = await watchHistoryService.getWatchHistory(testUserId, {
        page: 1,
        limit: 10,
      });

      expect(history.items.length).toBe(1);
      expect(history.items[0]?.id).toBe("wh_1");

      (db.orm.public.WatchHistory as any).where = origHistoryWhere;
    });
  });
});
