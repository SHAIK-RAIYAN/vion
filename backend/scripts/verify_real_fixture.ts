import path from "path";
import fs from "fs";
import { readVideoInfo, makeThumbnails } from "../src/services/mediaService";
import {
  determineTargetRenditions,
  buildMasterPlaylist,
  encodeRenditionHls,
  verifyHlsPackageLocal,
} from "../src/services/transcodingService";
import { TEMP_MEDIA_DIR } from "../src/config/config";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

async function runFixtureVerification() {
  console.log("=== REAL VIDEO FIXTURE PIPELINE TEST ===");
  const videoPath = path.resolve("..", "videos", "cat-smiling-in-the-water-moewalls-com.mp4");
  console.log("Source video:", videoPath);

  if (!fs.existsSync(videoPath)) {
    throw new Error(`Fixture video not found at ${videoPath}`);
  }

  // 1. Media Inspection
  console.log("\n[Step 1] Inspecting media with FFprobe...");
  const info = await readVideoInfo(videoPath);
  console.log("✔ FFprobe output:", {
    format: info.formatName,
    duration: `${info.duration}s`,
    resolution: `${info.width}x${info.height}`,
    aspectRatio: info.aspectRatio,
    frameRate: `${info.frameRate} fps`,
    videoCodec: info.videoCodec,
    audioCodec: info.audio ? info.audio.codec : "none (silent video)",
    hasAudio: info.audio !== null,
  });

  if (info.width !== 1920 || info.height !== 1080) {
    throw new Error(`Expected 1920x1080, got ${info.width}x${info.height}`);
  }

  // 2. Thumbnail Generation
  console.log("\n[Step 2] Generating thumbnails with FFmpeg...");
  const thumbResult = await makeThumbnails({
    uploadId: "upl_fixture_test",
    channelId: "chan_fixture_test",
    sourceFilePath: videoPath,
    candidateCount: 3,
    updateDatabase: false,
  });
  console.log("✔ Thumbnails generated:", thumbResult.candidateThumbnails.length);
  for (const cand of thumbResult.candidateThumbnails) {
    console.log(`  - Candidate ${cand.index} (${cand.timestampSeconds}s): ${cand.storageKey}`);
  }

  // 3. Quality Ladder Selection
  console.log("\n[Step 3] Selecting adaptive quality ladder...");
  const targetRenditions = determineTargetRenditions(info);
  console.log("✔ Target renditions:", targetRenditions.map((r) => r.name).join(", "));
  if (!targetRenditions.some((r) => r.name === "1080p") || !targetRenditions.some((r) => r.name === "360p")) {
    throw new Error("Expected quality ladder to contain both 1080p and 360p");
  }

  // 4. Test Single Rendition Transcoding (360p with audio synthesis for silent video)
  console.log("\n[Step 4] Transcoding 360p HLS rendition (3s sample) with FFmpeg...");
  const scratchDir = path.join(TEMP_MEDIA_DIR, `fixture_test_${Date.now()}`);
  fs.mkdirSync(scratchDir, { recursive: true });

  const profile360p = targetRenditions.find((r) => r.name === "360p")!;

  // Clip to 3s to keep verification fast while producing valid HLS segments
  const clippedSample = path.join(scratchDir, "sample_3s.mp4");

  await execFileAsync("ffmpeg", [
    "-ss", "0",
    "-t", "3",
    "-i", videoPath,
    "-c", "copy",
    "-y", clippedSample,
  ]);

  const hlsResult = await encodeRenditionHls({
    sourcePath: clippedSample,
    rendition: profile360p,
    outputDir: scratchDir,
    frameRate: info.frameRate,
    hasAudio: info.audio !== null,
  });

  console.log("✔ 360p HLS rendition created:");
  console.log(`  - Playlist: ${hlsResult.playlistPath}`);
  console.log(`  - Segment count: ${hlsResult.segmentPaths.length}`);

  // 5. Author Master Playlist
  console.log("\n[Step 5] Authoring RFC 8216 / Apple compliant Master Playlist...");
  const masterPath = buildMasterPlaylist(scratchDir, [profile360p], info.frameRate);
  const masterContent = fs.readFileSync(masterPath, "utf8");
  console.log("✔ Master playlist authored at:", masterPath);
  console.log("✔ Master playlist content preview:\n" + masterContent.trim());

  // 6. Verify Local Package
  console.log("\n[Step 6] Verifying HLS package integrity...");
  verifyHlsPackageLocal(scratchDir, [profile360p]);
  console.log("✔ Package verification passed without errors.");

  // Clean scratch
  fs.rmSync(scratchDir, { recursive: true, force: true });
  console.log("\n✔ Scratch directory cleaned up successfully.");
  console.log("\n=== ALL MEDIA PIPELINE FIXTURE CHECKS VERIFIED SUCCESSFULLY ===");
}

runFixtureVerification().catch((err) => {
  console.error("❌ Pipeline test failed:", err);
  process.exit(1);
});
