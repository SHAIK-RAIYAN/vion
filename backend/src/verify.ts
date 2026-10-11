import express from "express";
import router from "./routes/index";
import { errorHandler } from "./middlewares/errorHandler";
import { AppError } from "./utils/AppError";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "./config/config";
import { createChannelSchema } from "./modules/channel/channel.schema";
import { createUploadSchema } from "./modules/upload/upload.schema";
import { setInteractionSchema } from "./modules/interaction/interaction.schema";
import { createCommentSchema } from "./modules/comment/comment.schema";
import { recordHistorySchema } from "./modules/watchHistory/watchHistory.schema";

console.log("=== VION YOUTUBE BACKEND VERIFICATION ===");

// 1. Verify App Initialization and Router Mounting
const testApp = express();
testApp.use(express.json());
testApp.use("/api/v1", router);
testApp.use(errorHandler);

console.log("✔ Express app and all route modules mounted successfully.");

// 2. Extract and inspect all registered endpoints
const routes: { method: string; path: string }[] = [];

function extractRoutes(r: any, basePath = "") {
  for (const layer of r.stack || []) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).join(", ").toUpperCase();
      routes.push({ method: methods, path: basePath + layer.route.path });
    } else if (layer.name === "router" && layer.handle) {
      extractRoutes(layer.handle, basePath);
    }
  }
}

extractRoutes(router, "/api/v1");
console.log(`✔ Found ${routes.length} registered route endpoints.`);

// 3. Verify Schemas
const sampleChannel = createChannelSchema.safeParse({
  handle: "test_channel-1",
  channelName: "Test Channel",
  description: "A test channel",
});
if (!sampleChannel.success) {
  throw new Error("Channel schema validation failed!");
}
console.log("✔ Channel schema validated successfully.");

const sampleUpload = createUploadSchema.safeParse({
  title: "Test Video",
  visibility: "PUBLIC",
});
if (!sampleUpload.success) {
  throw new Error("Upload schema validation failed!");
}
console.log("✔ Upload schema validated successfully.");

const sampleInteraction = setInteractionSchema.safeParse({
  type: "LIKE",
});
if (!sampleInteraction.success) {
  throw new Error("Interaction schema validation failed!");
}
console.log("✔ Interaction schema validated successfully.");

const sampleComment = createCommentSchema.safeParse({
  content: "This is a great video!",
});
if (!sampleComment.success) {
  throw new Error("Comment schema validation failed!");
}
console.log("✔ Comment schema validated successfully.");

const sampleHistory = recordHistorySchema.safeParse({
  uploadId: "123e4567-e89b-12d3-a456-426614174000",
  progressTimeStamp: 120,
});
if (!sampleHistory.success) {
  throw new Error("Watch history schema validation failed!");
}
console.log("✔ Watch history schema validated successfully.");

// 4. Verify Auth Token & Error Handling
const token = jwt.sign(
  {
    id: "usr_123",
    email: "test@example.com",
    firstName: "Test",
    lastName: "User",
    gender: "OTHER",
    createdAt: new Date().toISOString(),
  },
  JWT_SECRET,
  { expiresIn: "1h" },
);

const decoded = jwt.verify(token, JWT_SECRET) as any;
if (decoded.id !== "usr_123") {
  throw new Error("JWT signing/decoding failed!");
}
console.log("✔ JWT authentication cycle verified.");

const appErr = new AppError("Test 404", 404);
if (appErr.statusCode !== 404) {
  throw new Error("AppError status code check failed!");
}
console.log("✔ AppError and HTTP error flow verified.");

// 5. Verify Storage Layout Path Helpers & Sanitation
import * as storageService from "./services/storageService";
import { getSanitizedConfigSummary } from "./config/config";
import { getVideoQueue, VIDEO_TRANSCODE_QUEUE_NAME } from "./queue/videoQueue";

const rawKey = storageService.generateRawVideoKey("chan_1", "up_1", "my-video.mp4");
if (!rawKey.startsWith("raw/chan_1/up_1/") || !rawKey.endsWith("my-video.mp4")) {
  throw new Error(`Raw video storage path generation failed: ${rawKey}`);
}
console.log(`✔ Storage raw video key generated: ${rawKey}`);

const hlsPath = storageService.generateHlsMasterPlaylistPath("chan_1", "vid_1");
if (hlsPath !== "processed/chan_1/vid_1/hls/master.m3u8") {
  throw new Error(`HLS playlist path generation failed: ${hlsPath}`);
}
console.log(`✔ Storage HLS manifest path generated: ${hlsPath}`);

const thumbKey = storageService.generateThumbnailKey("chan_1", "vid_1", "thumb.jpg");
if (!thumbKey.startsWith("thumbnails/chan_1/vid_1/") || !thumbKey.endsWith("thumb.jpg")) {
  throw new Error(`Thumbnail storage path generation failed: ${thumbKey}`);
}
console.log(`✔ Storage thumbnail path generated: ${thumbKey}`);

// 6. Verify Sanitized Config (Security Redaction)
const configSummary = getSanitizedConfigSummary();
const configJson = JSON.stringify(configSummary);
if (configJson.includes("postgres://") || configJson.includes("postgresql://") || configJson.includes("eyJ")) {
  throw new Error("Sanitized config summary leaked secrets!");
}
console.log("✔ Sanitized config summary verified (no leaked credentials).");

// 7. Verify BullMQ Video Queue Initialization
const queue = getVideoQueue();
if (queue.name !== VIDEO_TRANSCODE_QUEUE_NAME) {
  throw new Error(`Queue name mismatch: expected ${VIDEO_TRANSCODE_QUEUE_NAME}, got ${queue.name}`);
}
console.log(`✔ Video queue initialized with name '${queue.name}'.`);

console.log("=== ALL BACKEND VERIFICATION CHECKS PASSED ===");
process.exit(0);
