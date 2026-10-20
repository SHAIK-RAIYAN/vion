"use client";

import { useCurtainTransition } from "@/components/transitions/CurtainTransitionContext";
import { useViewMode } from "@/context/ViewModeContext";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { animateCardToWatchPage } from "@/lib/heroTransition";
import type { Upload } from "@/types/api";
import { useGSAP } from "@gsap/react";
import Hls from "hls.js";
import { Play } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { memo, useCallback, useEffect, useRef, useState } from "react";

interface StackedVideoCardsProps {
  videos: Upload[];
  activeFeed?: "all" | "subscriptions";
  onLoadMore?: () => void;
  hasNextPage?: boolean;
}

// =========================================================================
// 3D SLOT DEPTH & PERSPECTIVE SYSTEM
// Stepped upward offsets with center-top origin so behind cards ascend
// gracefully into depth towards the plumb line, exposing top headers
// =========================================================================
function getSlotZ(slot: number): number {
  if (slot <= 0) return 0;
  if (slot === 1) return -60;
  if (slot === 2) return -115;
  if (slot === 3) return -165;
  if (slot === 4) return -210;
  if (slot === 5) return -250;
  return -290; // Slot 6
}

function getSlotY(slot: number): number {
  if (slot <= 0) return 0;
  if (slot === 1) return -24;
  if (slot === 2) return -48;
  if (slot === 3) return -70;
  if (slot === 4) return -92;
  if (slot === 5) return -112;
  return -130; // Slot 6
}

function getSlotScale(slot: number): number {
  if (slot <= 0) return 1;
  if (slot === 1) return 0.92;
  if (slot === 2) return 0.84;
  if (slot === 3) return 0.77;
  if (slot === 4) return 0.70;
  if (slot === 5) return 0.64;
  return 0.58; // Slot 6
}

function getSlotBrightness(slot: number): number {
  if (slot <= 0) return 1;
  if (slot === 1) return 0.90;
  if (slot === 2) return 0.80;
  if (slot === 3) return 0.70;
  if (slot === 4) return 0.58;
  if (slot === 5) return 0.46;
  return 0.32;
}

function getSlotBlur(slot: number): number {
  if (slot <= 0) return 0;
  if (slot === 1) return 0;
  if (slot === 2) return 0.3;
  if (slot === 3) return 0.7;
  if (slot === 4) return 1.1;
  if (slot === 5) return 1.5;
  return 2.2;
}

function getSlotOpacity(slot: number): number {
  if (slot < 0) return 0;
  if (slot === 0) return 1;
  if (slot === 1) return 0.98;
  if (slot === 2) return 0.94;
  if (slot === 3) return 0.88;
  if (slot === 4) return 0.75;
  if (slot === 5) return 0.60;
  return 0; // Slot 6 begins hidden until ascending into stack
}

function parseCardDate(dateString: string) {
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) {
      return {
        headerDate: "July 2022",
        year: "2023",
        day: "14th",
        month: "Nov",
      };
    }
    const headerDate = d.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
    const year = d.getFullYear().toString();
    const dayNum = d.getDate();
    const suffix =
      dayNum === 1 || dayNum === 21 || dayNum === 31
        ? "st"
        : dayNum === 2 || dayNum === 22
          ? "nd"
          : dayNum === 3 || dayNum === 23
            ? "rd"
            : "th";
    const day = `${dayNum}${suffix}`;
    const month = d.toLocaleDateString("en-US", { month: "short" });
    return { headerDate, year, day, month };
  } catch {
    return {
      headerDate: "July 2022",
      year: "2023",
      day: "14th",
      month: "Nov",
    };
  }
}

// =========================================================================
// HIGH-EFFICIENCY CARD VIDEO PLAYER
// Strictly limits playback to active window (max 6 active videos)
// =========================================================================
interface CardVideoPlayerProps {
  video: Upload;
  isActive: boolean;
  isFront: boolean;
}

const CardVideoPlayer = memo(function CardVideoPlayer({
  video,
  isActive,
  isFront,
}: CardVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Derive preferred video source (strictly capped at 720p or 480p)
  const videoSource = React.useMemo(() => {
    if (video.videos && video.videos.length > 0) {
      // 1. Look for 720p MP4 rendition first
      const mp4_720 = video.videos.find(
        (r) => r.resolution === "720p" && r.url?.endsWith(".mp4"),
      );
      if (mp4_720?.url) return { type: "mp4" as const, url: mp4_720.url };

      // 2. Look for 480p MP4 rendition
      const mp4_480 = video.videos.find(
        (r) => r.resolution === "480p" && r.url?.endsWith(".mp4"),
      );
      if (mp4_480?.url) return { type: "mp4" as const, url: mp4_480.url };

      // 3. Look for 720p or 480p HLS / other streams
      const stream_720 = video.videos.find((r) => r.resolution === "720p");
      if (stream_720?.url) {
        return stream_720.url.endsWith(".m3u8")
          ? { type: "hls" as const, url: stream_720.url }
          : { type: "mp4" as const, url: stream_720.url };
      }

      const stream_480 = video.videos.find((r) => r.resolution === "480p");
      if (stream_480?.url) {
        return stream_480.url.endsWith(".m3u8")
          ? { type: "hls" as const, url: stream_480.url }
          : { type: "mp4" as const, url: stream_480.url };
      }

      // 4. Fallback: 360p or lower (strictly avoiding 1080p, 1440p, or 4K if lower versions exist)
      const nonHd = video.videos.find(
        (r) =>
          r.resolution !== "1080p" &&
          r.resolution !== "1440p" &&
          r.resolution !== "4K" &&
          r.resolution !== "2160p",
      );
      if (nonHd?.url) {
        return nonHd.url.endsWith(".m3u8")
          ? { type: "hls" as const, url: nonHd.url }
          : { type: "mp4" as const, url: nonHd.url };
      }

      // 5. Fallback: Original source rendition (when transcoding is deferred)
      if (video.videos[0]?.url) {
        const first = video.videos[0];
        return first.url.endsWith(".m3u8")
          ? { type: "hls" as const, url: first.url }
          : { type: "mp4" as const, url: first.url };
      }
    }

    if (video.hlsManifestUrl) {
      return { type: "hls" as const, url: video.hlsManifestUrl };
    }
    return null;
  }, [video]);

  // Handle active video playback setup & teardown
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !videoSource || hasError) return;

    if (!isActive) {
      videoEl.pause();
      return;
    }

    // Video is active: initialize playback
    if (videoSource.type === "mp4") {
      videoEl.muted = true;
      videoEl.play().catch(() => {
        // Safe catch for autoplay constraints or unmounting
      });
    } else if (videoSource.type === "hls") {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          maxBufferLength: 4,
          maxMaxBufferLength: 8,
          maxBufferSize: 6 * 1024 * 1024,
          backBufferLength: 0,
          capLevelToPlayerSize: true,
        });
        hlsRef.current = hls;

        hls.loadSource(videoSource.url);
        hls.attachMedia(videoEl);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          // Strictly cap HLS quality level to 720p or 480p max
          if (hls.levels && hls.levels.length > 0) {
            const cappedLevels = hls.levels
              .map((lvl, idx) => ({ idx, height: lvl.height }))
              .filter((lvl) => lvl.height <= 720);
            if (cappedLevels.length > 0) {
              const bestLevel = cappedLevels.reduce((prev, curr) =>
                curr.height > prev.height ? curr : prev,
              );
              hls.autoLevelCapping = bestLevel.idx;
              hls.currentLevel = bestLevel.idx;
            }
          }
          videoEl.muted = true;
          videoEl.play().catch(() => {});
        });

        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            hls.destroy();
            setHasError(true);
          }
        });
      } else if (videoEl.canPlayType("application/vnd.apple.mpegurl")) {
        videoEl.src = videoSource.url;
        videoEl.muted = true;
        videoEl.play().catch(() => {});
      } else {
        setHasError(true);
      }
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [isActive, videoSource, hasError]);

  // Tab visibility change handler: pause on hidden, resume on visible if active
  useEffect(() => {
    const handleVisibility = () => {
      const videoEl = videoRef.current;
      if (!videoEl) return;
      if (document.hidden) {
        videoEl.pause();
      } else if (isActive) {
        videoEl.play().catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [isActive]);

  if (!videoSource || hasError) {
    return video.thumbnailUrl ? (
      <img
        src={video.thumbnailUrl}
        alt={video.title}
        className="w-full h-full object-cover"
        loading={isFront ? "eager" : "lazy"}
      />
    ) : (
      <div className="w-full h-full bg-neutral-900 flex items-center justify-center">
        <Play className="w-12 h-12 text-white/30" />
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      {/* High-definition poster thumbnail always visible during load */}
      {video.thumbnailUrl && (
        <img
          src={video.thumbnailUrl}
          alt={video.title}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 pointer-events-none ${
            isVideoReady ? "opacity-0" : "opacity-100"
          }`}
        />
      )}

      {/* HTML5 Video Element */}
      <video
        ref={videoRef}
        src={videoSource.type === "mp4" ? videoSource.url : undefined}
        poster={video.thumbnailUrl || undefined}
        muted
        loop
        playsInline
        autoPlay={isActive}
        preload={isFront ? "auto" : "metadata"}
        onPlaying={() => setIsVideoReady(true)}
        onLoadedData={() => setIsVideoReady(true)}
        onError={() => setHasError(true)}
        className={`relative w-full h-full object-cover transition-opacity duration-700 ${
          isVideoReady ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
});

// =========================================================================
// MAIN STACKED VIDEO CARDS COMPONENT
// =========================================================================
export function StackedVideoCards({
  videos,
  activeFeed = "all",
  onLoadMore,
  hasNextPage = false,
}: StackedVideoCardsProps) {
  const router = useRouter();
  const { skipNextTransition } = useCurtainTransition();
  const { getCardSnapshot, clearSnapshot } = useViewMode();

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);

  // 1. Virtual circular conveyor ring:
  // Ensures at least 8 distinct items exist in 3D depth space (slots 0..6 + offscreen buffer)
  // so infinite wrap-around never collides or runs out of behind cards
  const displayVideos = React.useMemo(() => {
    if (!videos || videos.length === 0) return [];
    if (videos.length >= 8) return videos;

    const result: Upload[] = [];
    let copyIndex = 0;
    while (result.length < 8) {
      for (const v of videos) {
        result.push(
          copyIndex === 0 ? v : { ...v, id: `${v.id}-rep-${copyIndex}` },
        );
      }
      copyIndex++;
    }
    return result;
  }, [videos]);

  // Resolves cloned/repeated video back to the original database video
  const getOriginalVideo = useCallback(
    (video: Upload): Upload => {
      const originalId = video.id.replace(/-rep-\d+$/, "");
      const found = videos.find((v) => v.id === originalId);
      return found || video;
    },
    [videos],
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const currentIndexRef = useRef(0);
  const isAnimating = useRef(false);
  const gestureLocked = useRef(false);
  const gestureUnlockTimer = useRef<NodeJS.Timeout | undefined>(undefined);
  const isNavigatingToWatch = useRef(false);

  // Velocity tracking & delta handling
  const accumulatedDelta = useRef(0);
  const deltaResetTimer = useRef<NodeJS.Timeout | undefined>(undefined);

  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);

  // Synchronize ref with state
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  const setCardRef = (index: number) => (el: HTMLDivElement | null) => {
    cardsRef.current[index] = el;
  };

  // Helper: Positions card according to its slot in 3D
  const applySlotTransform = useCallback((cardEl: HTMLElement, slot: number) => {
    gsap.set(cardEl, {
      x: 0,
      z: getSlotZ(slot),
      y: getSlotY(slot),
      scale: getSlotScale(slot),
      opacity: getSlotOpacity(slot),
      filter: `brightness(${getSlotBrightness(slot)}) blur(${getSlotBlur(slot)}px)`,
      zIndex: Math.max(1, 50 - slot),
      transformOrigin: "center top",
      force3D: true,
      visibility: slot <= 5 ? "visible" : "hidden",
      pointerEvents: slot === 0 ? "auto" : slot <= 4 ? "auto" : "none",
    });
  }, []);

  // Maximum number of visible cards in 3D stack (capped by number of database videos, max 5)
  const maxStackSlots = Math.min(
    displayVideos.length,
    Math.max(3, Math.min(videos.length, 5)),
  );
  const backSlot = maxStackSlots - 1;

  // =========================================================================
  // GSAP INITIAL ENTRANCE: Cascading forward from depth or FLIP from previous view
  // =========================================================================
  useGSAP(
    () => {
      if (displayVideos.length === 0) return;
      const reducedMotion = prefersReducedMotion();
      const N = displayVideos.length;

      if (reducedMotion) {
        cardsRef.current.forEach((cardEl, i) => {
          if (!cardEl) return;
          const relSlot = (i - (currentIndexRef.current % N) + N) % N;
          if (relSlot < maxStackSlots) {
            applySlotTransform(cardEl, relSlot);
          } else {
            gsap.set(cardEl, {
              y: "130vh",
              opacity: 0,
              visibility: "hidden",
              pointerEvents: "none",
            });
          }
        });
        return;
      }

      // Check if we have snapshot positions from previous view (e.g. Grid view)
      const snapshot = getCardSnapshot();
      const hasSnapshots = Boolean(snapshot && snapshot.size > 0);

      if (hasSnapshots && snapshot) {
        // FLIP ANIMATION: Animate cards from their previous grid positions & sizes into the 3D stack!
        cardsRef.current.forEach((cardEl, i) => {
          if (!cardEl || i >= displayVideos.length) return;
          const video = displayVideos[i];
          const rawId = video.id;
          const baseId = rawId.replace(/-rep-\d+$/, "");
          const firstRect = snapshot.get(rawId) || snapshot.get(baseId);
          const relSlot = (i - (currentIndexRef.current % N) + N) % N;

          if (relSlot < maxStackSlots && firstRect) {
            // Temporarily position card at natural (0, 0, 0) to measure coordinates
            gsap.set(cardEl, {
              x: 0,
              y: 0,
              z: 0,
              scale: 1,
              transformOrigin: "center center",
              zIndex: Math.max(1, 50 - relSlot),
              visibility: "visible",
              pointerEvents: "auto",
              willChange: "transform, opacity",
            });

            const naturalRect = cardEl.getBoundingClientRect();
            const cardCenterX = naturalRect.left + naturalRect.width / 2;
            const cardCenterY = naturalRect.top + naturalRect.height / 2;
            const firstCenterX = firstRect.left + firstRect.width / 2;
            const firstCenterY = firstRect.top + firstRect.height / 2;
            const dx = firstCenterX - cardCenterX;
            const dy = firstCenterY - cardCenterY;
            const scaleMultiplier = firstRect.width / Math.max(1, naturalRect.width);

            gsap.fromTo(
              cardEl,
              {
                x: dx,
                y: dy,
                z: 0,
                scale: scaleMultiplier,
                opacity: 1,
                filter: "brightness(1) blur(0px)",
                transformOrigin: "center center",
                force3D: true,
              },
              {
                x: 0,
                y: getSlotY(relSlot),
                z: getSlotZ(relSlot),
                scale: getSlotScale(relSlot),
                opacity: getSlotOpacity(relSlot),
                filter: `brightness(${getSlotBrightness(relSlot)}) blur(${getSlotBlur(relSlot)}px)`,
                duration: 0.82,
                ease: "cubic",
                force3D: true,
                onComplete: () => {
                  applySlotTransform(cardEl, relSlot);
                },
              },
            );
          } else if (relSlot < maxStackSlots) {
            applySlotTransform(cardEl, relSlot);
            gsap.fromTo(
              cardEl,
              { opacity: 0, scale: getSlotScale(relSlot) * 0.8 },
              {
                opacity: getSlotOpacity(relSlot),
                scale: getSlotScale(relSlot),
                duration: 0.65,
                ease: "cubic",
              },
            );
          } else {
            gsap.set(cardEl, {
              y: "130vh",
              opacity: 0,
              visibility: "hidden",
              pointerEvents: "none",
            });
          }
        });

        gsap.delayedCall(0.85, clearSnapshot);
      } else {
        // Default initial cascade: cards cascade forward from deep in z-space with cubic ease
        cardsRef.current.forEach((cardEl, i) => {
          if (!cardEl) return;
          const relSlot = (i - (currentIndexRef.current % N) + N) % N;
          if (relSlot < maxStackSlots) {
            gsap.set(cardEl, {
              z: getSlotZ(relSlot) - 300,
              y: getSlotY(relSlot) + 35,
              scale: getSlotScale(relSlot) * 0.82,
              opacity: 0,
              filter: `brightness(${getSlotBrightness(relSlot) * 0.5}) blur(6px)`,
              zIndex: Math.max(1, 50 - relSlot),
              transformOrigin: "center top",
              force3D: true,
            });
          } else {
            gsap.set(cardEl, {
              y: "130vh",
              opacity: 0,
              visibility: "hidden",
              pointerEvents: "none",
            });
          }
        });

        const tl = gsap.timeline({
          defaults: { ease: "cubic" },
          onComplete: () => {
            isAnimating.current = false;
          },
        });

        const visibleCards = cardsRef.current.filter((_, i) => {
          const relSlot = (i - (currentIndexRef.current % N) + N) % N;
          return relSlot < maxStackSlots;
        });

        tl.to(visibleCards, {
          z: (i) => getSlotZ(i),
          y: (i) => getSlotY(i),
          scale: (i) => getSlotScale(i),
          opacity: (i) => getSlotOpacity(i),
          filter: (i) =>
            `brightness(${getSlotBrightness(i)}) blur(${getSlotBlur(i)}px)`,
          duration: 0.95,
          stagger: 0.07,
        });

        tl.fromTo(
          ".decor-element",
          { opacity: 0, y: -6 },
          { opacity: 1, y: 0, duration: 0.7, ease: "cubic", stagger: 0.05 },
          0.2,
        );
      }

      isAnimating.current = false;
      isNavigatingToWatch.current = false;
    },
    {
      dependencies: [displayVideos.length, maxStackSlots],
      scope: containerRef,
    },
  );

  // =========================================================================
  // CARD DROP & CONVEYOR PROGRESSION (INFINITE LOOP WITH BACKSIDE ASCENSION)
  // Front card drops down (130vh) while backside card ascends up from bottom to top (joining the set)
  // All with smooth ease-in and ease-out ("power2.inOut") and controlled velocity
  // =========================================================================
  const dropNextCard = useCallback(
    (customDuration?: number) => {
      const N = displayVideos.length;
      if (N === 0 || isAnimating.current || gestureLocked.current || isNavigatingToWatch.current) return;
      isAnimating.current = true;
      gestureLocked.current = true;
      accumulatedDelta.current = 0;
      clearTimeout(gestureUnlockTimer.current);

      const fromIndex = currentIndexRef.current;
      const nextIndex = (fromIndex + 1) % N;
      const reducedMotion = prefersReducedMotion();
      const duration = customDuration ?? (reducedMotion ? 0.2 : 0.82);

      const activeCard = cardsRef.current[fromIndex];

      // 1. Elevate active front card so it strictly stays on top while plunging down
      if (activeCard) {
        gsap.set(activeCard, { zIndex: 60, pointerEvents: "none" });
      }

      // 2. Prepare the backside birth card before timeline begins
      // It starts at the bottom behind the stack and rises upwards into backSlot
      const birthIndex = (fromIndex + maxStackSlots) % N;
      const birthCard = cardsRef.current[birthIndex];
      if (birthCard) {
        gsap.set(birthCard, {
          z: getSlotZ(backSlot) - 35,
          y: getSlotY(backSlot) + 65,
          scale: getSlotScale(backSlot) * 0.9,
          opacity: 0,
          filter: `brightness(${getSlotBrightness(backSlot) * 0.4}) blur(3px)`,
          zIndex: Math.max(1, 50 - backSlot),
          visibility: "visible",
          pointerEvents: "none",
        });
      }

      const tl = gsap.timeline({
        onComplete: () => {
          currentIndexRef.current = nextIndex;
          setCurrentIndex(nextIndex);

          // Park fallen card offscreen
          if (activeCard) {
            gsap.set(activeCard, {
              zIndex: 0,
              pointerEvents: "none",
              visibility: "hidden",
              y: "130vh",
              opacity: 0,
            });
          }

          // Trigger pagination if nearing end of original feed
          if (nextIndex >= videos.length - 3 && hasNextPage && onLoadMore) {
            onLoadMore();
          }

          isAnimating.current = false;
          gestureUnlockTimer.current = setTimeout(() => {
            gestureLocked.current = false;
          }, 120);
        },
      });

      // 3. Front card plunges down out of screen with trademark Codegrid cubic curve
      if (activeCard) {
        tl.to(
          activeCard,
          {
            y: "130vh",
            z: 0,
            scale: 1.05,
            opacity: 0,
            duration,
            ease: "cubic",
          },
          0,
        );
      }

      // 4. Middle cards advance forward in 3D depth with cubic curve
      for (let step = 1; step <= backSlot; step++) {
        const cardIdx = (fromIndex + step) % N;
        const cardEl = cardsRef.current[cardIdx];
        if (!cardEl) continue;
        const targetSlot = step - 1;

        gsap.set(cardEl, {
          zIndex: Math.max(1, 50 - targetSlot),
          pointerEvents: targetSlot === 0 ? "auto" : "auto",
          visibility: "visible",
        });

        tl.to(
          cardEl,
          {
            z: getSlotZ(targetSlot),
            y: getSlotY(targetSlot),
            scale: getSlotScale(targetSlot),
            opacity: getSlotOpacity(targetSlot),
            filter: `brightness(${getSlotBrightness(targetSlot)}) blur(${getSlotBlur(targetSlot)}px)`,
            duration,
            ease: "cubic",
          },
          0,
        );
      }

      // 5. Backside card ascends up from bottom to top joining the set behind the last card!
      // Slated with a subtle 0.12s offset exactly matching Codegrid Directory animation
      if (birthCard) {
        tl.to(
          birthCard,
          {
            z: getSlotZ(backSlot),
            y: getSlotY(backSlot),
            scale: getSlotScale(backSlot),
            opacity: getSlotOpacity(backSlot),
            filter: `brightness(${getSlotBrightness(backSlot)}) blur(${getSlotBlur(backSlot)}px)`,
            duration: Math.max(0.45, duration - 0.08),
            ease: "cubic",
          },
          0.12,
        );
      }
    },
    [backSlot, displayVideos.length, hasNextPage, maxStackSlots, onLoadMore, videos.length],
  );

  // =========================================================================
  // CARD PICK / REVERSE SCROLL (INFINITE LOOP IN UPWARD DIRECTION)
  // Bottom card rises into Slot 0 while backside card recedes from top to bottom
  // =========================================================================
  const pickPrevCard = useCallback(
    (customDuration?: number) => {
      const N = displayVideos.length;
      if (N === 0 || isAnimating.current || gestureLocked.current || isNavigatingToWatch.current) return;
      isAnimating.current = true;
      gestureLocked.current = true;
      accumulatedDelta.current = 0;
      clearTimeout(gestureUnlockTimer.current);

      const fromIndex = currentIndexRef.current;
      const prevIndex = (fromIndex - 1 + N) % N;
      const reducedMotion = prefersReducedMotion();
      const duration = customDuration ?? (reducedMotion ? 0.2 : 0.82);

      // Card to restore: the card right before current front card
      const cardToRestore = cardsRef.current[prevIndex];

      if (cardToRestore) {
        gsap.set(cardToRestore, {
          y: "130vh",
          z: 0,
          scale: 1.05,
          opacity: 0,
          zIndex: 60,
          pointerEvents: "auto",
          visibility: "visible",
        });
      }

      const tl = gsap.timeline({
        onComplete: () => {
          currentIndexRef.current = prevIndex;
          setCurrentIndex(prevIndex);
          isAnimating.current = false;
          gestureUnlockTimer.current = setTimeout(() => {
            gestureLocked.current = false;
          }, 120);
        },
      });

      // 1. Previous card sweeps up from bottom into Slot 0
      if (cardToRestore) {
        tl.to(
          cardToRestore,
          {
            z: getSlotZ(0),
            y: getSlotY(0),
            scale: getSlotScale(0),
            opacity: getSlotOpacity(0),
            filter: `brightness(${getSlotBrightness(0)}) blur(${getSlotBlur(0)}px)`,
            duration,
            ease: "cubic",
          },
          0,
        );
      }

      // 2. Existing cards recede backward into depth with cubic curve
      for (let step = 0; step < backSlot; step++) {
        const cardIdx = (fromIndex + step) % N;
        const cardEl = cardsRef.current[cardIdx];
        if (!cardEl) continue;
        const targetSlot = step + 1;

        gsap.set(cardEl, {
          zIndex: Math.max(1, 50 - targetSlot),
          pointerEvents: targetSlot === 0 ? "auto" : "auto",
          visibility: "visible",
        });

        tl.to(
          cardEl,
          {
            z: getSlotZ(targetSlot),
            y: getSlotY(targetSlot),
            scale: getSlotScale(targetSlot),
            opacity: getSlotOpacity(targetSlot),
            filter: `brightness(${getSlotBrightness(targetSlot)}) blur(${getSlotBlur(targetSlot)}px)`,
            duration,
            ease: "cubic",
          },
          0,
        );
      }

      // 3. Backmost card in backSlot recedes down and backward into depth
      const backIdx = (fromIndex + backSlot) % N;
      const backCard = cardsRef.current[backIdx];
      if (backCard) {
        tl.to(
          backCard,
          {
            z: getSlotZ(backSlot) - 35,
            y: getSlotY(backSlot) + 65,
            scale: getSlotScale(backSlot) * 0.9,
            opacity: 0,
            filter: `brightness(${getSlotBrightness(backSlot) * 0.4}) blur(3px)`,
            duration: Math.max(0.45, duration - 0.08),
            ease: "cubic",
          },
          0,
        );
      }
    },
    [backSlot, displayVideos.length],
  );

  // =========================================================================
  // SEAMLESS HERO CLICK-TO-WATCH TRANSITION
  // Animates front card to the exact position and size of /watch player before navigation
  // =========================================================================
  const handleFrontCardClick = useCallback(
    (video: Upload) => {
      if (isAnimating.current || isNavigatingToWatch.current) return;
      isNavigatingToWatch.current = true;
      isAnimating.current = true;

      skipNextTransition();

      const activeIdx = currentIndexRef.current;
      const activeCard = cardsRef.current[activeIdx];
      const otherCards = cardsRef.current.filter((_, idx) => idx !== activeIdx);

      // Smoothly fade out remaining cards and stage decor with ease-in-and-out
      gsap.to([otherCards, ".decor-element"], {
        opacity: 0,
        scale: 0.94,
        y: "+=12",
        duration: 0.38,
        ease: "power2.inOut",
      });

      if (activeCard) {
        animateCardToWatchPage({
          cardElement: activeCard,
          video: getOriginalVideo(video),
          router,
          skipCurtainTransition: skipNextTransition,
        });
      } else {
        router.push(`/watch/${getOriginalVideo(video).id}`);
      }
    },
    [getOriginalVideo, router, skipNextTransition],
  );

  // =========================================================================
  // GESTURE & INPUT LISTENERS: CONTROLLED SENSITIVITY & VELOCITY ACCELERATION
  // Exactly ONE card per intentional scroll stroke; faster flick speeds up duration
  // =========================================================================
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      e.preventDefault();

      // If already animating or locked during settling cooldown, ignore further wheel events
      if (isAnimating.current || gestureLocked.current) {
        accumulatedDelta.current = 0;
        return;
      }

      accumulatedDelta.current += e.deltaY;
      clearTimeout(deltaResetTimer.current);
      deltaResetTimer.current = setTimeout(() => {
        accumulatedDelta.current = 0;
      }, 180);

      // Intentional threshold: prevents slight twitches or trackpad drift from firing
      const threshold = 75;
      if (accumulatedDelta.current > threshold) {
        const flickVelocity = Math.abs(accumulatedDelta.current);
        accumulatedDelta.current = 0;
        const flickSpeed = Math.min(2.2, Math.max(1.0, flickVelocity / 80));
        const dynamicDuration = Math.max(0.38, 0.72 / flickSpeed);
        dropNextCard(dynamicDuration);
      } else if (accumulatedDelta.current < -threshold) {
        const flickVelocity = Math.abs(accumulatedDelta.current);
        accumulatedDelta.current = 0;
        const flickSpeed = Math.min(2.2, Math.max(1.0, flickVelocity / 80));
        const dynamicDuration = Math.max(0.38, 0.72 / flickSpeed);
        pickPrevCard(dynamicDuration);
      }
    };

    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      stage.removeEventListener("wheel", handleWheel);
      clearTimeout(deltaResetTimer.current);
      clearTimeout(gestureUnlockTimer.current);
    };
  }, [dropNextCard, pickPrevCard]);

  // Touch gesture with swipe velocity
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartY.current = e.touches[0].clientY;
      touchStartTime.current = Date.now();
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (isAnimating.current || gestureLocked.current) return;
      const deltaY = touchStartY.current - e.changedTouches[0].clientY;
      const deltaTime = Date.now() - touchStartTime.current;

      if (Math.abs(deltaY) > 40 && deltaTime < 650) {
        const flickSpeed = Math.min(2.2, Math.max(1.0, Math.abs(deltaY) / 100));
        const dynamicDuration = Math.max(0.38, 0.72 / flickSpeed);

        if (deltaY > 0) {
          dropNextCard(dynamicDuration);
        } else {
          pickPrevCard(dynamicDuration);
        }
      }
    };

    stage.addEventListener("touchstart", handleTouchStart, { passive: true });
    stage.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      stage.removeEventListener("touchstart", handleTouchStart);
      stage.removeEventListener("touchend", handleTouchEnd);
    };
  }, [dropNextCard, pickPrevCard]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        isAnimating.current ||
        gestureLocked.current
      ) {
        return;
      }
      if (
        e.key === "ArrowDown" ||
        e.key === "ArrowRight" ||
        e.key === "PageDown" ||
        e.key === " "
      ) {
        e.preventDefault();
        dropNextCard(0.65);
      } else if (
        e.key === "ArrowUp" ||
        e.key === "ArrowLeft" ||
        e.key === "PageUp"
      ) {
        e.preventDefault();
        pickPrevCard(0.65);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dropNextCard, pickPrevCard]);

  const N = displayVideos.length;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[calc(100vh-3.5rem)] bg-[#f8f9fa] dark:bg-[#050505] select-none overflow-hidden transition-colors duration-300">
      {/* 3D Perspective Stage Container */}
      <div
        ref={stageRef}
        style={{ perspective: "1350px", perspectiveOrigin: "50% 28%" }}
        className="w-full h-full flex flex-col items-center justify-center bg-[#f8f9fa] dark:bg-[#050505] px-4 sm:px-6 relative overflow-hidden transition-colors duration-300">
        {/* Subtle Ambient Vignette */}
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.03)_0%,transparent_70%)] dark:bg-[radial-gradient(circle_at_center,rgba(255,60,0,0.025)_0%,transparent_70%)]" />

        {/* Top Plumb Line With Anchor Pin */}
        <div className="absolute top-2 sm:top-4 left-1/2 -z-20 -translate-x-1/2 flex flex-col items-center pointer-events-none decor-element">
          <div className="w-2.5 h-2.5 rounded-full border border-neutral-400 dark:border-white/40 flex items-center justify-center bg-white dark:bg-black shadow-[0_0_8px_rgba(0,0,0,0.15)] dark:shadow-[0_0_8px_rgba(255,255,255,0.4)]">
            <div className="w-1 h-1 rounded-full bg-neutral-900 dark:bg-white" />
          </div>
          <div className="w-px h-10 sm:h-14 bg-linear-to-b from-neutral-400/50 to-neutral-400/10 dark:from-white/35 dark:to-white/10" />
        </div>

        {/* Centered 3D 16:9 Cards Stack */}
        <div
          style={{ transformStyle: "preserve-3d" }}
          className="relative w-full max-w-[840px] sm:max-w-[960px] md:max-w-[1040px] lg:max-w-[1120px] aspect-video max-h-[70vh] flex items-center justify-center mt-6 sm:mt-8 translate-y-8 sm:translate-y-10">
          {displayVideos.map((video, index) => {
            const dateInfo = parseCardDate(video.createdAt);
            const channelName = video.channel?.channelName || "Cinema";
            const relIndex = (index - (currentIndex % N) + N) % N;

            // Enforce maximum active playing video window (Slots 0..3)
            const isActivePlaying = relIndex <= 3;
            const isFrontCard = relIndex === 0;

            // Only mount full video element for cards within active visible buffer
            const shouldMountVideo = relIndex < maxStackSlots;

            const cardZIndex =
              relIndex < maxStackSlots ? Math.max(1, 50 - relIndex) : 0;

            return (
              <div
                key={video.id}
                ref={setCardRef(index)}
                data-video-card-id={video.id}
                style={{
                  zIndex: cardZIndex,
                  transformStyle: "preserve-3d",
                  pointerEvents: relIndex < maxStackSlots ? "auto" : "none",
                }}
                onClick={() => {
                  if (relIndex > 0 && relIndex < maxStackSlots) {
                    dropNextCard();
                  } else if (isFrontCard) {
                    handleFrontCardClick(video);
                  }
                }}
                className={`absolute inset-0 rounded-lg sm:rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-neutral-950 overflow-hidden shadow-[0_24px_50px_-12px_rgba(0,0,0,0.15)] dark:shadow-[0_28px_80px_-15px_rgba(0,0,0,0.95)] will-change-transform flex flex-col ${
                  relIndex > 0 && relIndex < maxStackSlots
                    ? "cursor-pointer hover:border-black/25 dark:hover:border-white/30"
                    : "cursor-pointer"
                }`}>
                {/* 1. Slim Restrained Metadata Header (Upload Date | Title | Channel) */}
                <div className="w-full h-10 sm:h-11 bg-white/95 dark:bg-black/90 backdrop-blur-md border-b border-black/6 dark:border-white/8 px-4 sm:px-6 flex items-center justify-between gap-3 text-xs shrink-0 z-20">
                  {/* Left: Upload Date */}
                  <div className="text-[10px] sm:text-[11px] font-mono text-neutral-500 dark:text-neutral-400 tracking-wider uppercase shrink-0 truncate max-w-[120px] sm:max-w-none">
                    {dateInfo.headerDate}
                  </div>

                  {/* Center: Video Title */}
                  <div className="font-semibold text-xs sm:text-sm tracking-wide text-neutral-900 dark:text-white text-center truncate flex-1 px-2">
                    {video.title}
                  </div>

                  {/* Right: Channel / Genre Name */}
                  <div className="text-[10px] sm:text-[11px] font-mono text-neutral-700 dark:text-neutral-300 tracking-wider shrink-0 truncate max-w-[130px] sm:max-w-none text-right">
                    {channelName}
                  </div>
                </div>

                {/* 2. Large Widescreen Video Surface */}
                <div className="relative flex-1 w-full bg-black overflow-hidden group">
                  {shouldMountVideo ? (
                    <CardVideoPlayer
                      video={video}
                      isActive={isActivePlaying}
                      isFront={isFrontCard}
                    />
                  ) : video.thumbnailUrl ? (
                    <img
                      src={video.thumbnailUrl}
                      alt={video.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full bg-neutral-900 flex items-center justify-center">
                      <Play className="w-10 h-10 text-white/30" />
                    </div>
                  )}

                  {/* Vignette Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />

                  {/* Play Glyph on Front Card Hover */}
                  {isFrontCard && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                      <div className="w-14 h-14 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-2xl">
                        <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
