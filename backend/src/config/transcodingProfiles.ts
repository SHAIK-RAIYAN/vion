/**
 * Vion — Transcoding Profiles and Adaptive Streaming Ladder
 *
 * Simple English Definitions:
 * - Resolution: The pixel dimensions of each video frame (width × height, e.g. 1920×1080).
 * - Bitrate: The amount of media data transferred per second (e.g. 2,500 kbps). Higher bitrate preserves more detail.
 * - Rendition: One specific encoded version of a video at a particular resolution and bitrate.
 * - Transcoding: Decoding the source video and re-encoding it into multiple renditions to match varying viewer network conditions.
 */

export interface RenditionProfile {
  name: string; // e.g. "1080p", "720p", "480p", "360p"
  resolution: string; // e.g. "1920x1080"
  width: number;
  height: number;
  videoBitrate: string; // e.g. "4500k"
  maxrate: string; // e.g. "5000k" (peak bitrate)
  bufsize: string; // e.g. "9000k" (rate control buffer size, typically 2x bitrate)
  audioBitrate: string; // e.g. "128k"
  audioSampleRate: number; // e.g. 48000
  bandwidth: number; // Total bits/sec for HLS #EXT-X-STREAM-INF (video + audio + 10% container overhead)
  avgBandwidth: number; // Average bits/sec
  codecs: string; // e.g. "avc1.4d4028,mp4a.40.2"
}

/**
 * Standard 16:9 adaptive streaming quality ladder.
 * Target video codec: H.264 (Main / High profile, Level 3.1 - 4.1).
 * Target audio codec: AAC-LC (mp4a.40.2).
 */
export const STANDARD_QUALITY_LADDER: RenditionProfile[] = [
  {
    name: "1080p",
    resolution: "1920x1080",
    width: 1920,
    height: 1080,
    videoBitrate: "4500k",
    maxrate: "5000k",
    bufsize: "9000k",
    audioBitrate: "128k",
    audioSampleRate: 48000,
    bandwidth: 5200000, // ~5.2 Mbps
    avgBandwidth: 4800000,
    codecs: 'avc1.4d4028,mp4a.40.2', // H.264 Main Profile Level 4.0, AAC-LC
  },
  {
    name: "720p",
    resolution: "1280x720",
    width: 1280,
    height: 720,
    videoBitrate: "2500k",
    maxrate: "2800k",
    bufsize: "5000k",
    audioBitrate: "128k",
    audioSampleRate: 48000,
    bandwidth: 2950000, // ~2.95 Mbps
    avgBandwidth: 2650000,
    codecs: 'avc1.4d401f,mp4a.40.2', // H.264 Main Profile Level 3.1, AAC-LC
  },
  {
    name: "480p",
    resolution: "854x480",
    width: 854,
    height: 480,
    videoBitrate: "1200k",
    maxrate: "1400k",
    bufsize: "2400k",
    audioBitrate: "96k",
    audioSampleRate: 48000,
    bandwidth: 1450000, // ~1.45 Mbps
    avgBandwidth: 1320000,
    codecs: 'avc1.4d401e,mp4a.40.2', // H.264 Main Profile Level 3.0, AAC-LC
  },
  {
    name: "360p",
    resolution: "640x360",
    width: 640,
    height: 360,
    videoBitrate: "700k",
    maxrate: "800k",
    bufsize: "1400k",
    audioBitrate: "96k",
    audioSampleRate: 48000,
    bandwidth: 890000, // ~890 kbps
    avgBandwidth: 800000,
    codecs: 'avc1.4d401e,mp4a.40.2', // H.264 Main Profile Level 3.0, AAC-LC
  },
];

/**
 * Ensures dimensions are even numbers (divisible by 2).
 * H.264/libx264 chroma subsampling (yuv420p) strictly requires even dimensions.
 */
export function makeEven(val: number): number {
  const rounded = Math.round(val);
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

/**
 * Evaluates the source video height and returns the eligible quality ladder.
 *
 * Rules:
 * 1. NEVER UPSCALE: If source height is 720p, we only generate 720p, 480p, and 360p.
 * 2. If source height is below 360p (e.g. 240p or 144p):
 *    Generates a custom baseline rendition matching the source dimensions so the stream
 *    can be watched without error or unnatural stretching.
 */
export function getEligibleRenditions(
  sourceWidth: number,
  sourceHeight: number,
  maxRenditions?: number,
): RenditionProfile[] {
  // Filter all standard profiles where profile.height <= sourceHeight (Anti-upscaling)
  const eligible = STANDARD_QUALITY_LADDER.filter(
    (profile) => profile.height <= sourceHeight,
  );

  // If source height is equal to or greater than 360p, return filtered profiles
  if (eligible.length > 0) {
    if (typeof maxRenditions === "number" && maxRenditions > 0 && maxRenditions < eligible.length) {
      if (maxRenditions === 1) {
        return [eligible[0]!];
      }
      if (maxRenditions === 2) {
        // Return highest eligible resolution and lowest baseline (360p) for optimal adaptive range
        return [eligible[0]!, eligible[eligible.length - 1]!];
      }
      // General distribution across available ladder
      const step = (eligible.length - 1) / (maxRenditions - 1);
      const selected: RenditionProfile[] = [];
      for (let i = 0; i < maxRenditions; i++) {
        const idx = Math.round(i * step);
        const item = eligible[idx]!;
        if (!selected.includes(item)) {
          selected.push(item);
        }
      }
      return selected;
    }
    return eligible;
  }

  // Edge case: source video resolution is below 360p (e.g. 240p or 144p).
  // Generate a custom baseline rendition matching source dimensions to avoid upscaling.
  const safeHeight = makeEven(Math.max(sourceHeight, 144));
  const safeWidth = makeEven(Math.max(sourceWidth, 176));
  const name = `${safeHeight}p`;

  const baselineProfile: RenditionProfile = {
    name,
    resolution: `${safeWidth}x${safeHeight}`,
    width: safeWidth,
    height: safeHeight,
    videoBitrate: "400k",
    maxrate: "500k",
    bufsize: "800k",
    audioBitrate: "64k",
    audioSampleRate: 48000,
    bandwidth: 520000,
    avgBandwidth: 480000,
    codecs: 'avc1.4d4015,mp4a.40.2',
  };

  return [baselineProfile];
}
