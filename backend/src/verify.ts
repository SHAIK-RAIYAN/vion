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

console.log("=== ALL BACKEND VERIFICATION CHECKS PASSED ===");
process.exit(0);
