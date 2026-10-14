/**
 * Centralized Configuration for Curtain Transition & Preloader
 *
 * References:
 * - Codegrid / Good Fella cinematic reveal
 * - Brand vibrant red-orange palette (#FF3C00)
 */

export const CURTAIN_CONFIG = {
  // Vibrant Brand Orange from reference screenshots
  color: "#FF3C00",
  // Dark text/block color from reference screenshots
  darkForeground: "#0A0A0A",
  // Site background behind the curtain
  darkBackground: "#141314",

  // Animation Timings (in seconds)
  timings: {
    // Reveal (curtain falls away): ~0.85s matching reference
    revealDuration: 0.85,
    // Cover (curtain sweeps in): ~0.65s for responsive navigation
    coverDuration: 0.65,
    // Text exit slide duration
    textExitDuration: 0.4,
    // Center loader group fade out
    loaderFadeDuration: 0.25,
    // Minimum initial display beat for tumbling blocks rhythm
    minPreloaderBeat: 0.9,
    // Maximum safety timeout for readiness to avoid trapping user
    safetyTimeout: 4.0,
  },

  // GSAP Easing Functions
  easings: {
    curtainReveal: "expo.inOut",
    curtainCover: "expo.inOut",
    textExit: "power3.in",
    loaderFade: "power3.out",
    blockTumble: "expo.inOut",
  },
} as const;

/**
 * Calculates the exact polygon clip-path for revealing the site.
 * 
 * Geometry:
 * The dividing line hinges on the bottom-left corner (0% 100%) and sweeps
 * clockwise like a rigid curtain falling away.
 * 
 * - progress = 0: Full screen orange rectangle polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)
 * - progress = 0.5: Ray hits top-right corner polygon(0% 100%, 100% 0%, 100% 0%, 100% 100%)
 * - progress = 0.75: Exact Screenshot 2 state polygon(0% 100%, 100% 50%, 100% 100%)
 * - progress = 1.0: Completely collapsed polygon(0% 100%, 0% 100%, 0% 100%)
 */
export function getCurtainRevealClipPath(progress: number): string {
  const p = Math.max(0, Math.min(1, progress));
  if (p <= 0) {
    return "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)";
  }
  if (p >= 1) {
    return "polygon(0% 100%, 0% 100%, 0% 100%)";
  }
  if (p <= 0.5) {
    const topX = 2 * p * 100;
    return `polygon(0% 100%, ${topX.toFixed(2)}% 0%, 100% 0%, 100% 100%)`;
  }
  const rightY = (p - 0.5) * 200;
  return `polygon(0% 100%, 100% ${rightY.toFixed(2)}%, 100% 100%)`;
}

/**
 * Calculates the exact polygon clip-path for covering the site on route transitions.
 * Sweeps from bottom-left corner up across the viewport.
 * 
 * - progress = 0: Completely collapsed (page visible)
 * - progress = 0.5: Ray from bottom-left to top-right
 * - progress = 1.0: Full screen orange rectangle
 */
export function getCurtainCoverClipPath(progress: number): string {
  const p = Math.max(0, Math.min(1, progress));
  if (p <= 0) {
    return "polygon(0% 100%, 0% 100%, 0% 100%)";
  }
  if (p >= 1) {
    return "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)";
  }
  if (p <= 0.5) {
    const rightY = (1 - 2 * p) * 100;
    return `polygon(0% 100%, 100% ${rightY.toFixed(2)}%, 100% 100%)`;
  }
  const topX = (1 - (p - 0.5) * 2) * 100;
  return `polygon(0% 100%, ${topX.toFixed(2)}% 0%, 100% 0%, 100% 100%)`;
}
