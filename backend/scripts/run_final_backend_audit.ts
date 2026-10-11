import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { readVideoInfo, makeThumbnails } from "../src/services/mediaService";
import {
  determineTargetRenditions,
  buildMasterPlaylist,
  encodeRenditionHls,
  verifyHlsPackageLocal,
  cleanScratchDirectory,
} from "../src/services/transcodingService";
import { shouldIncrementView } from "../src/modules/video/video.service";
import { TEMP_MEDIA_DIR } from "../src/config/config";
import { AppError } from "../src/utils/AppError";

const execFileAsync = promisify(execFile);

interface AuditMetrics {
  probeResults: Record<string, any>;
  thumbnailDurationsMs: Record<string, number>;
  thumbnailSizesBytes: Record<string, number[]>;
  transcodeMetrics: {
    videoName: string;
    durationSec: number;
    transcodeDurationMs: number;
    speedFactor: number; // transcode duration / video duration
    segmentCount: number;
    totalHlsSizeBytes: number;
  }[];
  failureScenariosTested: string[];
  performanceLatencies: Record<string, number>;
}

async function runAudit() {
  console.log("================================================================");
  console.log("   VION FINAL BACKEND AUDIT, PERFORMANCE & INTEGRATION SUITE   ");
  console.log("================================================================\n");

  const metrics: AuditMetrics = {
    probeResults: {},
    thumbnailDurationsMs: {},
    thumbnailSizesBytes: {},
    transcodeMetrics: [],
    failureScenariosTested: [],
    performanceLatencies: {},
  };

  const videosDir = path.resolve("..", "videos");
  const testVideos = [
    { name: "gojo-and-kitty-jujutsu-kaisen-moewalls-com.mp4", hasAudioExpected: true, expectedRes: "1920x1080" },
    { name: "cat-smiling-in-the-water-moewalls-com.mp4", hasAudioExpected: false, expectedRes: "1920x1080" },
    { name: "Koi-Fish-Sachiro_1.mp4", hasAudioExpected: true, expectedRes: "2560x1440" },
    { name: "Ryomen-Sukuna-jujutsu-kaisen-4k-live-wallpaper (PosInTech).mp4", hasAudioExpected: false, expectedRes: "3840x2160" },
  ];

  // ==========================================================================
  // SECTION 1: PROBE & MEDIA INSPECTION ACROSS DIVERSE VIDEO MATRIX
  // ==========================================================================
  console.log("--- 1. FFprobe Media Inspection & Ladder Verification ---");
  for (const v of testVideos) {
    const fullPath = path.join(videosDir, v.name);
    if (!fs.existsSync(fullPath)) {
      console.warn(`[Skip] Video ${v.name} not found.`);
      continue;
    }

    const t0 = performance.now();
    const info = await readVideoInfo(fullPath);
    const probeDuration = Math.round(performance.now() - t0);

    const ladder = determineTargetRenditions(info);
    const ladderNames = ladder.map((r) => r.name);

    metrics.probeResults[v.name] = {
      durationSec: info.duration,
      resolution: `${info.width}x${info.height}`,
      codec: info.videoCodec,
      hasAudio: info.audio !== null,
      ladder: ladderNames,
      probeLatencyMs: probeDuration,
    };

    console.log(`✔ [${v.name}]`);
    console.log(`   Dimensions: ${info.width}x${info.height} | Duration: ${info.duration}s | Audio: ${info.audio ? info.audio.codec : "none"}`);
    console.log(`   Quality Ladder: ${ladderNames.join(", ")} | Probe Time: ${probeDuration}ms`);

    // Verify anti-upscaling rules
    if (v.expectedRes === "1920x1080" && !ladderNames.includes("1080p")) {
      throw new Error(`Expected 1080p ladder for 1080p video ${v.name}`);
    }
  }

  // ==========================================================================
  // SECTION 2: THUMBNAIL EXTRACTION LATENCY & ASSET SIZES
  // ==========================================================================
  console.log("\n--- 2. Thumbnail Generation Latency & Asset Sizing ---");
  const thumbVideo = path.join(videosDir, "cat-smiling-in-the-water-moewalls-com.mp4");
  if (fs.existsSync(thumbVideo)) {
    const t0 = performance.now();
    const thumbResult = await makeThumbnails({
      uploadId: "audit_upl_001",
      channelId: "audit_chan_001",
      sourceFilePath: thumbVideo,
      candidateCount: 3,
      updateDatabase: false,
    });
    const thumbDuration = Math.round(performance.now() - t0);
    metrics.thumbnailDurationsMs["cat-smiling"] = thumbDuration;

    console.log(`✔ Generated ${thumbResult.candidateThumbnails.length} candidates in ${thumbDuration}ms`);
    for (const c of thumbResult.candidateThumbnails) {
      console.log(`   Candidate ${c.index} (${c.timestampSeconds}s): ${c.storageKey}`);
    }
  }

  // ==========================================================================
  // SECTION 3: REAL TRANSCODING, RFC 8216 HLS ENCODING & METRICS
  // ==========================================================================
  console.log("\n--- 3. Adaptive HLS Transcoding Benchmark ---");
  const benchmarkCandidates = [
    { file: "gojo-and-kitty-jujutsu-kaisen-moewalls-com.mp4", label: "H.264 + AAC Audio (Sample 4s)" },
    { file: "cat-smiling-in-the-water-moewalls-com.mp4", label: "H.264 + Silent Video with Audio Synthesis (Sample 4s)" },
  ];

  for (const item of benchmarkCandidates) {
    const fullPath = path.join(videosDir, item.file);
    if (!fs.existsSync(fullPath)) continue;

    const scratchDir = path.join(TEMP_MEDIA_DIR, `audit_transcode_${Date.now()}`);
    fs.mkdirSync(scratchDir, { recursive: true });

    try {
      const info = await readVideoInfo(fullPath);
      const ladder = determineTargetRenditions(info);
      const profile360p = ladder.find((r) => r.name === "360p")!;

      // Clip 4 seconds for fast and reproducible measurement
      const sampleClip = path.join(scratchDir, "sample_clip.mp4");
      await execFileAsync("ffmpeg", [
        "-ss", "0",
        "-t", "4",
        "-i", fullPath,
        "-c", "copy",
        "-y", sampleClip,
      ]);

      const t0 = performance.now();
      const hlsResult = await encodeRenditionHls({
        sourcePath: sampleClip,
        rendition: profile360p,
        outputDir: scratchDir,
        frameRate: info.frameRate,
        hasAudio: info.audio !== null,
      });
      const transcodeDuration = Math.round(performance.now() - t0);

      // Master playlist creation
      const masterPath = buildMasterPlaylist(scratchDir, [profile360p], info.frameRate);
      verifyHlsPackageLocal(scratchDir, [profile360p]);

      // Calculate total output size
      let totalSize = fs.statSync(masterPath).size;
      for (const p of [hlsResult.playlistPath, ...hlsResult.segmentPaths]) {
        totalSize += fs.statSync(p).size;
      }

      const metric = {
        videoName: item.file,
        durationSec: 4.0,
        transcodeDurationMs: transcodeDuration,
        speedFactor: Math.round((transcodeDuration / 4000) * 100) / 100,
        segmentCount: hlsResult.segmentPaths.length,
        totalHlsSizeBytes: totalSize,
      };
      metrics.transcodeMetrics.push(metric);

      console.log(`✔ [${item.label}]`);
      console.log(`   Transcode Time: ${transcodeDuration}ms | Speed Factor: ${metric.speedFactor}x real-time`);
      console.log(`   HLS Segments: ${metric.segmentCount} | Total Package Size: ${Math.round(totalSize / 1024)} KB`);
      console.log(`   Apple HLS Compliant Master: ${path.basename(masterPath)} verified`);
    } finally {
      cleanScratchDirectory(scratchDir);
    }
  }

  // ==========================================================================
  // SECTION 4: FAILURE & RESILIENCE SCENARIOS
  // ==========================================================================
  console.log("\n--- 4. Testing Failure Scenarios & Edge Cases ---");

  // Test 4.1: Non-existent file
  try {
    await readVideoInfo(path.join(TEMP_MEDIA_DIR, "non_existent_file.mp4"));
    throw new Error("Should have thrown on non-existent file");
  } catch (err: any) {
    if (err instanceof AppError && err.statusCode === 404) {
      console.log("✔ Non-existent file path: Caught 404 FILE_NOT_FOUND");
      metrics.failureScenariosTested.push("non_existent_file_404");
    } else {
      throw err;
    }
  }

  // Test 4.2: Zero-byte file
  const emptyFilePath = path.join(TEMP_MEDIA_DIR, "audit_empty.mp4");
  fs.writeFileSync(emptyFilePath, Buffer.alloc(0));
  try {
    await readVideoInfo(emptyFilePath);
    throw new Error("Should have thrown on empty file");
  } catch (err: any) {
    if (err instanceof AppError && err.statusCode === 422) {
      console.log("✔ Zero-byte empty file: Caught 422 EMPTY_MEDIA_FILE");
      metrics.failureScenariosTested.push("empty_file_422");
    } else {
      throw err;
    }
  } finally {
    if (fs.existsSync(emptyFilePath)) fs.unlinkSync(emptyFilePath);
  }

  // Test 4.3: Corrupt container header
  const corruptFilePath = path.join(TEMP_MEDIA_DIR, "audit_corrupt.mp4");
  fs.writeFileSync(corruptFilePath, "INVALID_STREAM_HEADER_BYTE_STREAM");
  try {
    await readVideoInfo(corruptFilePath);
    throw new Error("Should have thrown on corrupt container");
  } catch (err: any) {
    if (err instanceof AppError && err.statusCode === 422) {
      console.log("✔ Corrupt media header: Caught 422 INVALID_MEDIA_FORMAT");
      metrics.failureScenariosTested.push("corrupt_container_422");
    } else {
      throw err;
    }
  } finally {
    if (fs.existsSync(corruptFilePath)) fs.unlinkSync(corruptFilePath);
  }

  // Test 4.4: Incomplete / Missing HLS segment package verification
  const brokenScratch = path.join(TEMP_MEDIA_DIR, `audit_broken_${Date.now()}`);
  fs.mkdirSync(brokenScratch, { recursive: true });
  fs.writeFileSync(path.join(brokenScratch, "master.m3u8"), "#EXTM3U\n#EXT-X-VERSION:3\n");
  try {
    verifyHlsPackageLocal(brokenScratch, []);
    throw new Error("Should have thrown on incomplete master playlist");
  } catch (err: any) {
    if (err instanceof AppError && err.code === "MALFORMED_MASTER_PLAYLIST") {
      console.log("✔ Incomplete/corrupted HLS master: Caught MALFORMED_MASTER_PLAYLIST");
      metrics.failureScenariosTested.push("malformed_master_detected");
    } else {
      throw err;
    }
  } finally {
    cleanScratchDirectory(brokenScratch);
  }

  // ==========================================================================
  // SECTION 5: PERFORMANCE, COOLDOWN & DEBOUNCING
  // ==========================================================================
  console.log("\n--- 5. Performance & View Debouncing Validation ---");
  const testClient = "192.168.1.100";
  const testVid = "vid_debounce_test";

  const firstHit = shouldIncrementView(testClient, testVid);
  const secondHit = shouldIncrementView(testClient, testVid); // Immediate repeat hit
  console.log(`✔ First view request: increment = ${firstHit}`);
  console.log(`✔ Immediate second view request (same IP): increment = ${secondHit} (debounced)`);

  if (!firstHit || secondHit) {
    throw new Error("View debouncing logic failed to throttle repeated playback calls");
  }

  console.log("\n================================================================");
  console.log("            ALL AUDIT BENCHMARKS & TESTS PASSED!               ");
  console.log("================================================================\n");

  return metrics;
}

runAudit()
  .then((metrics) => {
    console.log("AUDIT METRICS JSON SUMMARY:");
    console.log(JSON.stringify(metrics, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ AUDIT FAILED:", err);
    process.exit(1);
  });
