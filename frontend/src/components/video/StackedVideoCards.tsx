"use client";

import React, { useRef, useState, useEffect, useCallback, memo } from "react";
import { useRouter } from "next/navigation";
import { useCurtainTransition } from "@/components/transitions/CurtainTransitionContext";
import type { Upload } from "@/types/api";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { useGSAP } from "@gsap/react";
import Hls from "hls.js";
import {
  Play,
  RotateCcw,
  Sparkles,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";

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
  if (slot === 1) return -105;
  if (slot === 2) return -205;
  if (slot === 3) return -295;
  if (slot === 4) return -375;
  if (slot === 5) return -445;
  return -510;
}

function getSlotY(slot: number): number {
  if (slot <= 0) return 0;
  if (slot === 1) return -76;
  if (slot === 2) return -142;
  if (slot === 3) return -198;
  if (slot === 4) return -246;
  if (slot === 5) return -286;
  return -318;
}

function getSlotScale(slot: number): number {
  if (slot <= 0) return 1;
  if (slot === 1) return 0.885;
  if (slot === 2) return 0.78;
  if (slot === 3) return 0.685;
  if (slot === 4) return 0.60;
  if (slot === 5) return 0.52;
  return 0.45;
}

function getSlotBrightness(slot: number): number {
  if (slot <= 0) return 1;
  if (slot === 1) return 0.88;
  if (slot === 2) return 0.76;
  if (slot === 3) return 0.64;
  if (slot === 4) return 0.52;
  if (slot === 5) return 0.40;
  return 0.28;
}

function getSlotBlur(slot: number): number {
  if (slot <= 0) return 0;
  if (slot === 1) return 0;
  if (slot === 2) return 0.4;
  if (slot === 3) return 0.8;
  if (slot === 4) return 1.2;
  if (slot === 5) return 1.6;
  return 2.0;
}

function getSlotOpacity(slot: number): number {
  if (slot < 0) return 0;
  if (slot === 0) return 1;
  if (slot === 1) return 0.98;
  if (slot === 2) return 0.94;
  if (slot === 3) return 0.85;
  if (slot === 4) return 0.72;
  if (slot === 5) return 0.58;
  return 0;
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

      // 4. Fallback: 360p or lower (strictly avoiding 1080p, 1440p, or 4K)
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

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);
  const endOfFeedRef = useRef<HTMLDivElement>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const currentIndexRef = useRef(0);
  const isAnimating = useRef(false);
  const isNavigatingToWatch = useRef(false);
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);

  // Keep ref synchronized with state to prevent stale closure issues during rapid scroll
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // Reset index only if the underlying videos list actually changes
  const prevVideosRef = useRef(videos);
  useEffect(() => {
    if (prevVideosRef.current !== videos) {
      prevVideosRef.current = videos;
      if (currentIndexRef.current >= videos.length) {
        const clamped = Math.max(0, videos.length - 1);
        setCurrentIndex(clamped);
        currentIndexRef.current = clamped;
      }
    }
  }, [videos]);

  const setCardRef = (index: number) => (el: HTMLDivElement | null) => {
    cardsRef.current[index] = el;
  };

  // =========================================================================
  // GSAP INITIAL ENTRANCE: Cascading forward from depth in 3D space
  // =========================================================================
  useGSAP(
    () => {
      if (videos.length === 0) return;
      const reducedMotion = prefersReducedMotion();

      if (reducedMotion) {
        cardsRef.current.forEach((cardEl, i) => {
          if (!cardEl) return;
          gsap.set(cardEl, {
            z: getSlotZ(i),
            y: getSlotY(i),
            scale: getSlotScale(i),
            opacity: getSlotOpacity(i),
            filter: `brightness(${getSlotBrightness(i)}) blur(${getSlotBlur(i)}px)`,
            zIndex: Math.max(1, 50 - i),
            transformOrigin: "center top",
            force3D: true,
          });
        });
        return;
      }

      // Initial placement deep in z-space with strict initial zIndex
      cardsRef.current.forEach((cardEl, i) => {
        if (!cardEl) return;
        gsap.set(cardEl, {
          z: getSlotZ(i) - 450,
          y: getSlotY(i) + 40,
          scale: getSlotScale(i) * 0.82,
          opacity: 0,
          filter: `brightness(${getSlotBrightness(i) * 0.6}) blur(8px)`,
          zIndex: Math.max(1, 50 - i),
          transformOrigin: "center top",
          force3D: true,
        });
      });

      if (endOfFeedRef.current) {
        gsap.set(endOfFeedRef.current, {
          autoAlpha: 0,
          scale: 0.95,
          y: 25,
        });
      }

      // Timeline for cascading appear animation
      const tl = gsap.timeline({
        defaults: { ease: "power3.out" },
        onComplete: () => {
          isAnimating.current = false;
        },
      });

      // Front cards cascade forward into their slots
      tl.to(cardsRef.current.slice(0, 7), {
        z: (i) => getSlotZ(i),
        y: (i) => getSlotY(i),
        scale: (i) => getSlotScale(i),
        opacity: (i) => getSlotOpacity(i),
        filter: (i) =>
          `brightness(${getSlotBrightness(i)}) blur(${getSlotBlur(i)}px)`,
        duration: 1.1,
        stagger: 0.08,
      });

      // Plumb line anchor pin fades in smoothly
      tl.fromTo(
        ".decor-element",
        { opacity: 0, y: -6 },
        { opacity: 1, y: 0, duration: 0.75, ease: "power2.out", stagger: 0.05 },
        0.3,
      );

      setCurrentIndex(0);
      currentIndexRef.current = 0;
      isAnimating.current = false;
      isNavigatingToWatch.current = false;
    },
    {
      dependencies: [videos.length],
      scope: containerRef,
      revertOnUpdate: true,
    },
  );

  // =========================================================================
  // CARD DROP & DEPTH PROGRESSION (Guaranteed Front-Card Drop)
  // =========================================================================
  const dropNextCard = useCallback(() => {
    const fromIndex = currentIndexRef.current;
    if (
      isAnimating.current ||
      isNavigatingToWatch.current ||
      fromIndex >= videos.length
    ) {
      return;
    }
    isAnimating.current = true;

    const reducedMotion = prefersReducedMotion();
    const nextIndex = fromIndex + 1;
    const activeCard = cardsRef.current[fromIndex];
    const duration = reducedMotion ? 0.2 : 0.75;

    // 1. Immediately elevate the active front card so it strictly stays on top while falling down
    if (activeCard) {
      gsap.set(activeCard, { zIndex: 60 });
    }

    const tl = gsap.timeline({
      onComplete: () => {
        currentIndexRef.current = nextIndex;
        setCurrentIndex(nextIndex);

        // Lower the fallen card's zIndex to 0 and disable pointer events & visibility
        if (activeCard) {
          gsap.set(activeCard, { zIndex: 0, pointerEvents: "none", visibility: "hidden" });
        }

        if (nextIndex >= videos.length - 1 && hasNextPage && onLoadMore) {
          onLoadMore();
        }

        setTimeout(() => {
          isAnimating.current = false;
        }, 80);
      },
    });

    // 2. Front card falls down straight out of screen
    if (activeCard) {
      tl.to(
        activeCard,
        {
          y: "130vh",
          z: 0,
          rotation: 0,
          scale: 1,
          opacity: 1,
          duration,
          ease: "power2.inOut",
        },
        0,
      );
    }

    // 3. All subsequent cards advance forward by one slot in 3D
    for (let j = nextIndex; j < videos.length; j++) {
      const nextCard = cardsRef.current[j];
      if (!nextCard) continue;
      const targetSlot = j - nextIndex;

      // Update z-index dynamically: Slot 0 gets 50, slot 1 gets 49, etc.
      gsap.set(nextCard, {
        zIndex: Math.max(1, 50 - targetSlot),
        pointerEvents: "auto",
        visibility: "visible",
      });

      tl.to(
        nextCard,
        {
          z: getSlotZ(targetSlot),
          y: getSlotY(targetSlot),
          scale: getSlotScale(targetSlot),
          opacity: getSlotOpacity(targetSlot),
          filter: `brightness(${getSlotBrightness(targetSlot)}) blur(${getSlotBlur(targetSlot)}px)`,
          duration,
          ease: "power2.inOut",
        },
        0,
      );
    }

    // 4. Reveal End of Feed screen ONLY if all cards have fallen
    if (nextIndex >= videos.length && endOfFeedRef.current) {
      gsap.set(endOfFeedRef.current, {
        zIndex: 40,
        pointerEvents: "auto",
        visibility: "visible",
      });
      tl.to(
        endOfFeedRef.current,
        {
          autoAlpha: 1,
          scale: 1,
          y: 0,
          duration: 0.75,
          ease: "power2.out",
        },
        0.15,
      );
    }
  }, [videos.length, hasNextPage, onLoadMore]);

  // Restore previous card back into stack
  const pickPrevCard = useCallback(() => {
    const fromIndex = currentIndexRef.current;
    if (
      isAnimating.current ||
      isNavigatingToWatch.current ||
      fromIndex <= 0
    ) {
      return;
    }
    isAnimating.current = true;

    const reducedMotion = prefersReducedMotion();
    const prevIndex = fromIndex - 1;
    const cardToRestore = cardsRef.current[prevIndex];
    const duration = reducedMotion ? 0.2 : 0.75;

    // Elevate restored card to slot 0 zIndex and ensure visibility
    if (cardToRestore) {
      gsap.set(cardToRestore, { zIndex: 50, pointerEvents: "auto", visibility: "visible" });
    }

    const tl = gsap.timeline({
      onComplete: () => {
        currentIndexRef.current = prevIndex;
        setCurrentIndex(prevIndex);
        setTimeout(() => {
          isAnimating.current = false;
        }, 80);
      },
    });

    if (fromIndex >= videos.length && endOfFeedRef.current) {
      tl.to(
        endOfFeedRef.current,
        {
          autoAlpha: 0,
          scale: 0.95,
          y: 20,
          duration: 0.35,
          ease: "power2.in",
          onComplete: () => {
            if (endOfFeedRef.current) {
              gsap.set(endOfFeedRef.current, {
                zIndex: -1,
                pointerEvents: "none",
                visibility: "hidden",
              });
            }
          },
        },
        0,
      );
    }

    // 1. Previous card returns up into Slot 0
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
          ease: "power2.inOut",
        },
        0,
      );
    }

    // 2. Subsequent cards push back by one slot in 3D
    for (let j = fromIndex; j < videos.length; j++) {
      const cardEl = cardsRef.current[j];
      if (!cardEl) continue;
      const targetSlot = j - prevIndex;

      gsap.set(cardEl, {
        zIndex: Math.max(1, 50 - targetSlot),
        pointerEvents: "auto",
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
          ease: "power2.inOut",
        },
        0,
      );
    }
  }, [videos.length]);

  // Rewind to beginning action
  const rewindToBeginning = () => {
    if (isAnimating.current) return;
    isAnimating.current = true;

    const tl = gsap.timeline({
      onComplete: () => {
        setCurrentIndex(0);
        currentIndexRef.current = 0;
        isAnimating.current = false;
      },
    });

    if (endOfFeedRef.current) {
      tl.to(
        endOfFeedRef.current,
        {
          autoAlpha: 0,
          scale: 0.95,
          y: 20,
          duration: 0.3,
          onComplete: () => {
            if (endOfFeedRef.current) {
              gsap.set(endOfFeedRef.current, {
                zIndex: -1,
                pointerEvents: "none",
                visibility: "hidden",
              });
            }
          },
        },
        0,
      );
    }

    cardsRef.current.forEach((cardEl, i) => {
      if (!cardEl) return;
      const targetSlot = i;
      gsap.set(cardEl, {
        zIndex: Math.max(1, 50 - targetSlot),
        pointerEvents: "auto",
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
          duration: 0.7,
          ease: "power2.inOut",
        },
        0.03 * i,
      );
    });
  };

  // =========================================================================
  // SEAMLESS HERO CLICK-TO-WATCH TRANSITION
  // =========================================================================
  const handleFrontCardClick = useCallback(
    (video: Upload) => {
      if (isAnimating.current || isNavigatingToWatch.current) return;
      isNavigatingToWatch.current = true;
      isAnimating.current = true;

      // 1. Tell curtain transition system not to trigger the wipe
      skipNextTransition();

      // 2. Cache video data in sessionStorage for instant watch page mount
      try {
        sessionStorage.setItem(
          `vion_hero_video_${video.id}`,
          JSON.stringify(video),
        );
      } catch {}

      const currentIdx = currentIndexRef.current;
      const activeCard = cardsRef.current[currentIdx];
      const otherCards = cardsRef.current.filter(
        (_, idx) => idx !== currentIdx,
      );

      const tl = gsap.timeline({
        onComplete: () => {
          router.push(`/watch/${video.id}`);
        },
      });

      // 3. Smoothly fade out remaining cards and stage decor
      tl.to(
        [otherCards, ".decor-element"],
        {
          opacity: 0,
          scale: 0.94,
          y: "+=12",
          duration: 0.38,
          ease: "power2.inOut",
        },
        0,
      );

      // 4. Hero card remains on screen and expands smoothly
      if (activeCard) {
        tl.to(
          activeCard,
          {
            scale: 1.035,
            duration: 0.42,
            ease: "power2.out",
          },
          0,
        );
      }
    },
    [router, skipNextTransition],
  );

  // =========================================================================
  // GESTURE & INPUT LISTENERS
  // =========================================================================
  // Wheel / Scroll gesture
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    let accumulatedDelta = 0;
    let deltaResetTimer: NodeJS.Timeout;

    const handleWheel = (e: WheelEvent) => {
      // 1. Critical: Ignore zoom gestures (Ctrl/Meta + wheel, trackpad pinch)
      if (e.ctrlKey || e.metaKey) {
        return;
      }

      if (isAnimating.current) return;

      // 2. When at the end of the feed, lock further downward scroll completely
      if (currentIndexRef.current >= videos.length) {
        if (e.deltaY > 0) return;
      }

      e.preventDefault();

      accumulatedDelta += e.deltaY;
      clearTimeout(deltaResetTimer);
      deltaResetTimer = setTimeout(() => {
        accumulatedDelta = 0;
      }, 180);

      // 3. At the end of the feed, require an intentional deliberate upward scroll
      // to avoid inertia recoil or trackpad bounce accidentally pulling up the last card
      if (currentIndexRef.current >= videos.length) {
        if (accumulatedDelta < -75) {
          accumulatedDelta = 0;
          pickPrevCard();
        }
        return;
      }

      if (accumulatedDelta > 35) {
        accumulatedDelta = 0;
        dropNextCard();
      } else if (accumulatedDelta < -35) {
        accumulatedDelta = 0;
        pickPrevCard();
      }
    };

    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      stage.removeEventListener("wheel", handleWheel);
      clearTimeout(deltaResetTimer);
    };
  }, [dropNextCard, pickPrevCard, videos.length]);

  // Touch gesture for mobile / tablet
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartY.current = e.touches[0].clientY;
      touchStartTime.current = Date.now();
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (isAnimating.current) return;
      const deltaY = touchStartY.current - e.changedTouches[0].clientY;
      const deltaTime = Date.now() - touchStartTime.current;

      if (Math.abs(deltaY) > 30 && deltaTime < 600) {
        if (deltaY > 0) {
          dropNextCard();
        } else {
          pickPrevCard();
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

  // Keyboard navigation (Supports ArrowDown, ArrowUp, ArrowRight, ArrowLeft, Space, PageDown, PageUp)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        isAnimating.current
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
        dropNextCard();
      } else if (
        e.key === "ArrowUp" ||
        e.key === "ArrowLeft" ||
        e.key === "PageUp"
      ) {
        e.preventDefault();
        pickPrevCard();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dropNextCard, pickPrevCard]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[calc(100vh-3.5rem)] bg-[#f8f9fa] dark:bg-[#050505] select-none overflow-hidden transition-colors duration-300"
    >
      {/* 3D Perspective Stage Container */}
      <div
        ref={stageRef}
        style={{ perspective: "1350px", perspectiveOrigin: "50% 28%" }}
        className="w-full h-full flex flex-col items-center justify-center bg-[#f8f9fa] dark:bg-[#050505] px-4 sm:px-6 relative overflow-hidden transition-colors duration-300"
      >
        {/* Subtle Ambient Vignette */}
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.03)_0%,transparent_70%)] dark:bg-[radial-gradient(circle_at_center,rgba(255,60,0,0.025)_0%,transparent_70%)]" />

        {/* Top Plumb Line With Anchor Pin */}
        <div className="absolute top-2 sm:top-4 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none z-30 decor-element">
          <div className="w-2.5 h-2.5 rounded-full border border-neutral-400 dark:border-white/40 flex items-center justify-center bg-white dark:bg-black shadow-[0_0_8px_rgba(0,0,0,0.15)] dark:shadow-[0_0_8px_rgba(255,255,255,0.4)]">
            <div className="w-1 h-1 rounded-full bg-neutral-900 dark:bg-white" />
          </div>
          <div className="w-[1px] h-10 sm:h-14 bg-gradient-to-b from-neutral-400/50 to-neutral-400/10 dark:from-white/35 dark:to-white/10" />
        </div>

        {/* Centered 3D Widescreen Cards Stack (Enhanced Height & Aspect Ratio) */}
        <div
          style={{ transformStyle: "preserve-3d" }}
          className="relative w-full max-w-[980px] lg:max-w-[1100px] xl:max-w-[1200px] aspect-[16/9.8] max-h-[72vh] sm:max-h-[76vh] md:max-h-[78vh] flex items-center justify-center mt-6 sm:mt-8"
        >
          {videos.map((video, index) => {
            const dateInfo = parseCardDate(video.createdAt);
            const channelName = video.channel?.channelName || "Cinema";

            // Enforce maximum 6 playing videos: active window is [currentIndex, currentIndex + 6)
            const isActivePlaying =
              index >= currentIndex && index < currentIndex + 6;
            const isFrontCard = index === currentIndex;

            // Only mount full video element for cards within active and near buffer
            const shouldMountVideo =
              index >= currentIndex - 1 && index <= currentIndex + 7;

            const cardZIndex =
              index < currentIndex
                ? 0
                : Math.max(1, 50 - (index - currentIndex));

            return (
              <div
                key={video.id}
                ref={setCardRef(index)}
                style={{
                  zIndex: cardZIndex,
                  transformStyle: "preserve-3d",
                  pointerEvents: index < currentIndex ? "none" : "auto",
                }}
                onClick={() => {
                  if (index > currentIndex) {
                    dropNextCard();
                  } else if (isFrontCard) {
                    handleFrontCardClick(video);
                  }
                }}
                className={`absolute inset-0 rounded-lg sm:rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-neutral-950 overflow-hidden shadow-[0_24px_50px_-12px_rgba(0,0,0,0.15)] dark:shadow-[0_28px_80px_-15px_rgba(0,0,0,0.95)] will-change-transform flex flex-col ${
                  index > currentIndex
                    ? "cursor-pointer hover:border-black/25 dark:hover:border-white/30"
                    : "cursor-pointer"
                }`}
              >
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

          {/* =========================================================================
              END-OF-FEED REVEAL SCREEN (Strictly protected z-index & visibility)
              ========================================================================= */}
          <div
            ref={endOfFeedRef}
            style={{
              zIndex: currentIndex >= videos.length ? 40 : -1,
              pointerEvents: currentIndex >= videos.length ? "auto" : "none",
              visibility: currentIndex >= videos.length ? "visible" : "hidden",
            }}
            className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 select-text"
          >
            <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-mono font-bold uppercase tracking-[0.25em] text-[#ff3c00] mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>VION WALLPAPER DISCOVERY</span>
            </div>

            <h2 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-neutral-900 dark:text-white uppercase mb-2">
              YOU&apos;VE REACHED THE END.
            </h2>

            <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 max-w-md mx-auto mb-8 leading-relaxed font-light">
              You&apos;ve seen every frame for now. Stay tuned as independent creators publish new high-definition live wallpapers.
            </p>

            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={rewindToBeginning}
                className="rounded-full text-xs font-semibold px-6 h-9 border-black/15 dark:border-white/20 bg-black/5 dark:bg-white/5 text-neutral-900 dark:text-white hover:bg-black/10 dark:hover:bg-white/15 gap-2 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Rewind to Beginning
              </Button>

              {activeFeed === "subscriptions" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push("/")}
                  className="rounded-full text-xs text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white px-4 h-9 cursor-pointer"
                >
                  Explore All Wallpapers
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
