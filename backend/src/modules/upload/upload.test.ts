import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test";
import {
  createUploadSchema,
  presignedUrlSchema,
  remoteUrlSchema,
} from "./upload.schema";
import { validateRemoteVideoUrl } from "../../utils/ssrfValidator";
import { AppError } from "../../utils/AppError";
import * as uploadService from "./upload.service";
import * as storageService from "../../services/storageService";
import { MAX_UPLOAD_SIZE_BYTES } from "../../config/config";
import { db } from "../../prisma/db";

describe("Upload Module Safety & Validation", () => {
  describe("Schema Validation & Safety Limits", () => {
    it("rejects non-video MIME types", () => {
      const invalid = createUploadSchema.safeParse({
        title: "Bad File",
        contentType: "application/zip",
      });
      expect(invalid.success).toBe(false);
      if (!invalid.success) {
        expect(invalid.error?.issues[0]?.message).toContain("valid video format");
      }
    });

    it("rejects oversized declared file sizes (> 500 MB)", () => {
      const invalid = createUploadSchema.safeParse({
        title: "Too Large",
        contentType: "video/mp4",
        fileSize: MAX_UPLOAD_SIZE_BYTES + 1024,
      });
      expect(invalid.success).toBe(false);
      if (!invalid.success) {
        expect(invalid.error?.issues[0]?.message).toContain("exceeds the limit");
      }
    });

    it("accepts valid video upload parameters", () => {
      const valid = createUploadSchema.safeParse({
        title: "Sample Video",
        description: "A nice test video",
        visibility: "PUBLIC",
        contentType: "video/mp4",
        fileSize: 10 * 1024 * 1024, // 10 MB
      });
      expect(valid.success).toBe(true);
    });

    it("validates presigned URL inputs strictly", () => {
      const invalidNoName = presignedUrlSchema.safeParse({
        fileName: "",
        contentType: "video/mp4",
      });
      expect(invalidNoName.success).toBe(false);

      const invalidNonVideo = presignedUrlSchema.safeParse({
        fileName: "malicious.sh",
        contentType: "text/x-shellscript",
      });
      expect(invalidNonVideo.success).toBe(false);

      const valid = presignedUrlSchema.safeParse({
        fileName: "intro.mov",
        contentType: "video/quicktime",
        fileSize: 20 * 1024 * 1024,
      });
      expect(valid.success).toBe(true);
    });
  });

  describe("SSRF Prevention for Remote URLs", () => {
    it("blocks localhost, loopback, and private IPv4 addresses", async () => {
      await expect(validateRemoteVideoUrl("http://localhost:8080/video.mp4")).rejects.toThrow(
        AppError,
      );
      await expect(validateRemoteVideoUrl("http://127.0.0.1/video.mp4")).rejects.toThrow(
        AppError,
      );
      await expect(validateRemoteVideoUrl("http://192.168.1.50/video.mp4")).rejects.toThrow(
        AppError,
      );
      await expect(validateRemoteVideoUrl("http://10.0.0.1/video.mp4")).rejects.toThrow(
        AppError,
      );
    });

    it("blocks cloud instance metadata service (169.254.169.254)", async () => {
      await expect(
        validateRemoteVideoUrl("http://169.254.169.254/latest/meta-data/"),
      ).rejects.toThrow(AppError);
    });

    it("blocks non-HTTP protocols (file:, ftp:, gopher:)", async () => {
      await expect(validateRemoteVideoUrl("file:///etc/passwd")).rejects.toThrow(AppError);
      await expect(validateRemoteVideoUrl("ftp://files.example.com/video.mp4")).rejects.toThrow(
        AppError,
      );
    });

    it("blocks arbitrary non-approved destination domains", async () => {
      await expect(
        validateRemoteVideoUrl("https://random-unapproved-site.org/video.mp4"),
      ).rejects.toThrow(AppError);
    });

    it("allows approved video CDN domains", async () => {
      const result = await validateRemoteVideoUrl(
        "https://raw.githubusercontent.com/media/sample.mp4",
      );
      expect(result.hostname).toBe("raw.githubusercontent.com");
      expect(result.contentType).toBe("video/mp4");
    }, 15000);
  });

  describe("Upload Lifecycle & Business Logic", () => {
    const mockChannel = {
      id: "chan_owner_1",
      userId: "user_owner_1",
    };

    const mockUpload = {
      id: "upl_123",
      channelId: "chan_owner_1",
      title: "Test Upload",
      processingStatus: "UPLOADING",
      isDeleted: false,
      channel: mockChannel,
    };

    it("enforces ownership: non-owners cannot finalize uploads", async () => {
      // Mock Upload.where to return mockUpload
      const originalWhere = db.orm.public.Upload.where;
      (db.orm.public.Upload as any).where = () => ({
        include: () => ({
          first: async () => mockUpload,
        }),
      });

      try {
        await expect(
          uploadService.finalizeUpload("upl_123", "attacker_user_99"),
        ).rejects.toThrow(AppError);
      } finally {
        (db.orm.public.Upload as any).where = originalWhere;
      }
    });

    it("enforces ownership: non-owners cannot delete uploads", async () => {
      const originalWhere = db.orm.public.Upload.where;
      (db.orm.public.Upload as any).where = () => ({
        include: () => ({
          first: async () => mockUpload,
        }),
      });

      try {
        await expect(
          uploadService.deleteUpload("upl_123", "attacker_user_99"),
        ).rejects.toThrow(AppError);
      } finally {
        (db.orm.public.Upload as any).where = originalWhere;
      }
    });

    it("rejects forged storage keys not matching the upload folder", async () => {
      const originalWhere = db.orm.public.Upload.where;
      (db.orm.public.Upload as any).where = () => ({
        include: () => ({
          first: async () => mockUpload,
        }),
      });

      try {
        await expect(
          uploadService.finalizeUpload("upl_123", "user_owner_1", "raw/different_chan/different_up/fake.mp4"),
        ).rejects.toThrow(AppError);
      } finally {
        (db.orm.public.Upload as any).where = originalWhere;
      }
    });

    it("repeated finalization is idempotent and does not enqueue duplicate work", async () => {
      const transcodingUpload = {
        ...mockUpload,
        processingStatus: "TRANSCODING",
      };

      const originalWhere = db.orm.public.Upload.where;
      (db.orm.public.Upload as any).where = () => ({
        include: () => ({
          first: async () => transcodingUpload,
        }),
      });

      try {
        const result = await uploadService.finalizeUpload("upl_123", "user_owner_1");
        expect(result.status).toBe("TRANSCODING");
        expect(result.alreadyProcessing).toBe(true);
      } finally {
        (db.orm.public.Upload as any).where = originalWhere;
      }
    });

    it("handles completed upload finalization idempotently", async () => {
      const completedUpload = {
        ...mockUpload,
        processingStatus: "COMPLETED",
      };

      const originalWhere = db.orm.public.Upload.where;
      (db.orm.public.Upload as any).where = () => ({
        include: () => ({
          first: async () => completedUpload,
        }),
      });

      try {
        const result = await uploadService.finalizeUpload("upl_123", "user_owner_1");
        expect(result.status).toBe("COMPLETED");
        expect(result.alreadyCompleted).toBe(true);
      } finally {
        (db.orm.public.Upload as any).where = originalWhere;
      }
    });

    it("preserves UPLOADING status upon enqueuing and does not prematurely set TRANSCODING", async () => {
      const uploadingMock = {
        ...mockUpload,
        processingStatus: "UPLOADING",
      };

      const originalWhere = db.orm.public.Upload.where;
      let updatedStatus: string | null = null;
      (db.orm.public.Upload as any).where = () => ({
        include: () => ({
          first: async () => uploadingMock,
        }),
        update: async (data: any) => {
          if (data.processingStatus) updatedStatus = data.processingStatus;
          return { ...uploadingMock, ...data };
        },
      });

      const listSpy = spyOn(storageService, "listFiles").mockImplementation(async () => [
        { name: "source_video.mp4", metadata: { size: 1024 * 1024 } } as any,
      ]);

      try {
        const result = await uploadService.finalizeUpload("upl_123", "user_owner_1");
        expect(result.status).toBe("UPLOADING");
        expect(updatedStatus).toBeNull();
      } finally {
        (db.orm.public.Upload as any).where = originalWhere;
        listSpy.mockRestore();
      }
    });
  });
});
