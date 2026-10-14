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
  ExternalLink,
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
  if (slot === 1) return -70;
  if (slot === 2) return -140;
  if (slot === 3) return -210;
  if (slot === 4) return -280;
  if (slot === 5) return -350;
  return -420;
}

function getSlotY(slot: number): number {
  if (slot <= 0) return 0;
  if (slot === 1) return -58;
  if (slot === 2) return -112;
  if (slot === 3) return -162;
  if (slot === 4) return -208;
  if (slot === 5) return -250;
  return -288;
}

function getSlotScale(slot: number): number {
  if (slot <= 0) return 1;
  if (slot === 1) return 0.94;
  if (slot === 2) return 0.88;
  if (slot === 3) return 0.82;
  if (slot === 4) return 0.76;
  if (slot === 5) return 0.7;
  return 0.64;
}

function getSlotBrightness(slot: number): number {
  if (slot <= 0) return 1;
  if (slot === 1) return 0.88;
  if (slot === 2) return 0.75;
  if (slot === 3) return 0.62;
  if (slot === 4) return 0.5;
  if (slot === 5) return 0.38;
  return 0.26;
}

function getSlotBlur(slot: number): number {
  if (slot <= 0) return 0;
  if (slot === 1) return 0.4;
  if (slot === 2) return 0.8;
  if (slot === 3) return 1.3;
  if (slot === 4) return 1.8;
  if (slot === 5) return 2.3;
  return 3.0;
}

function getSlotOpacity(slot: number): number {
  if (slot < 0) return 0;
  if (slot === 0) return 1;
  if (slot === 1) return 0.98;
  if (slot === 2) return 0.92;
  if (slot === 3) return 0.82;
  if (slot === 4) return 0.7;
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

  // Derive preferred video source (MP4 progressive download or HLS stream)
  const videoSource = React.useMemo(() => {
    if (video.videos && video.videos.length > 0) {
      const preferred =
        video.videos.find(
          (r) => r.resolution === "720p" && r.url?.endsWith(".mp4"),
        ) ||
        video.videos.find((r) => r.url?.endsWith(".mp4")) ||
        video.videos.find((r) => r.resolution === "720p") ||
        video.videos[0];
      if (preferred?.url) {
        if (preferred.url.endsWith(".mp4")) {
          return { type: "mp4" as const, url: preferred.url };
        }
        if (preferred.url.endsWith(".m3u8")) {
          return { type: "hls" as const, url: preferred.url };
        }
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
  const isAnimating = useRef(false);
  const isNavigatingToWatch = useRef(false);
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);

  const setCardRef = (index: number) => (el: HTMLDivElement | null) => {
    cardsRef.current[index] = el;
  };

  const activeVideo = videos[currentIndex] || null;
  const activeDateInfo = activeVideo
    ? parseCardDate(activeVideo.createdAt)
    : { year: "2023", day: "14th", month: "Nov", headerDate: "July 2022" };

  // =========================================================================
  // GSAP INITIAL ENTRANCE: Cascading forward from far behind in 3D space
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
            zIndex: (videos.length - i) * 10,
            transformOrigin: "center top",
            force3D: true,
          });
        });
        return;
      }

      // Initial placement deep in z-space
      cardsRef.current.forEach((cardEl, i) => {
        if (!cardEl) return;
        gsap.set(cardEl, {
          z: getSlotZ(i) - 450,
          y: getSlotY(i) + 40,
          scale: getSlotScale(i) * 0.82,
          opacity: 0,
          filter: `brightness(${getSlotBrightness(i) * 0.6}) blur(8px)`,
          zIndex: (videos.length - i) * 10,
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

      // Front 7 cards cascade forward into their slots
      tl.to(cardsRef.current.slice(0, 7), {
        z: (i) => getSlotZ(i),
        y: (i) => getSlotY(i),
        scale: (i) => getSlotScale(i),
        opacity: (i) => getSlotOpacity(i),
        filter: (i) =>
          `brightness(${getSlotBrightness(i)}) blur(${getSlotBlur(i)}px)`,
        duration: 1.2,
        stagger: 0.08,
      });

      // Plumb line, side nodes, tick ruler, and bottom pill fade in smoothly
      tl.fromTo(
        ".decor-element",
        { opacity: 0, y: -6 },
        { opacity: 1, y: 0, duration: 0.75, ease: "power2.out", stagger: 0.05 },
        0.3,
      );

      setCurrentIndex(0);
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
  // CARD DROP & DEPTH PROGRESSION
  // =========================================================================
  const dropNextCard = useCallback(() => {
    if (
      isAnimating.current ||
      isNavigatingToWatch.current ||
      currentIndex >= videos.length
    )
      return;
    isAnimating.current = true;

    const reducedMotion = prefersReducedMotion();
    const activeCard = cardsRef.current[currentIndex];
    const duration = reducedMotion ? 0.2 : 0.8;

    const tl = gsap.timeline({
      onComplete: () => {
        const nextIndex = currentIndex + 1;
        setCurrentIndex(nextIndex);

        if (nextIndex >= videos.length - 1 && hasNextPage && onLoadMore) {
          onLoadMore();
        }

        setTimeout(() => {
          isAnimating.current = false;
        }, 60);
      },
    });

    // 1. Current card falls down straight (no angle, opacity 1)
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

    // 2. All subsequent cards advance forward by one slot in 3D
    for (let j = currentIndex + 1; j < videos.length; j++) {
      const nextCard = cardsRef.current[j];
      if (!nextCard) continue;
      const targetSlot = j - (currentIndex + 1);

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

    // 3. Reveal End of Feed screen if last card just fell
    if (currentIndex + 1 >= videos.length && endOfFeedRef.current) {
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
  }, [currentIndex, videos.length, hasNextPage, onLoadMore]);

  // Restore previous card back into stack
  const pickPrevCard = useCallback(() => {
    if (
      isAnimating.current ||
      isNavigatingToWatch.current ||
      currentIndex <= 0
    )
      return;
    isAnimating.current = true;

    const reducedMotion = prefersReducedMotion();
    const prevIndex = currentIndex - 1;
    const cardToRestore = cardsRef.current[prevIndex];
    const duration = reducedMotion ? 0.2 : 0.75;

    const tl = gsap.timeline({
      onComplete: () => {
        setCurrentIndex(prevIndex);
        setTimeout(() => {
          isAnimating.current = false;
        }, 60);
      },
    });

    if (currentIndex === videos.length && endOfFeedRef.current) {
      tl.to(
        endOfFeedRef.current,
        {
          autoAlpha: 0,
          scale: 0.95,
          y: 20,
          duration: 0.35,
          ease: "power2.in",
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
    for (let j = currentIndex; j < videos.length; j++) {
      const cardEl = cardsRef.current[j];
      if (!cardEl) continue;
      const targetSlot = j - prevIndex;

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
  }, [currentIndex, videos.length]);

  // Rewind to beginning action
  const rewindToBeginning = () => {
    if (isAnimating.current) return;
    isAnimating.current = true;

    const tl = gsap.timeline({
      onComplete: () => {
        setCurrentIndex(0);
        isAnimating.current = false;
      },
    });

    if (endOfFeedRef.current) {
      tl.to(
        endOfFeedRef.current,
        { autoAlpha: 0, scale: 0.95, y: 20, duration: 0.3 },
        0,
      );
    }

    cardsRef.current.forEach((cardEl, i) => {
      if (!cardEl) return;
      tl.to(
        cardEl,
        {
          z: getSlotZ(i),
          y: getSlotY(i),
          scale: getSlotScale(i),
          opacity: getSlotOpacity(i),
          filter: `brightness(${getSlotBrightness(i)}) blur(${getSlotBlur(i)}px)`,
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

      const activeCard = cardsRef.current[currentIndex];
      const otherCards = cardsRef.current.filter(
        (_, idx) => idx !== currentIndex,
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
    [currentIndex, router, skipNextTransition],
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
      if (currentIndex >= videos.length && e.deltaY > 0) return;
      e.preventDefault();

      accumulatedDelta += e.deltaY;
      clearTimeout(deltaResetTimer);
      deltaResetTimer = setTimeout(() => {
        accumulatedDelta = 0;
      }, 180);

      if (accumulatedDelta > 20) {
        accumulatedDelta = 0;
        dropNextCard();
      } else if (accumulatedDelta < -20) {
        accumulatedDelta = 0;
        pickPrevCard();
      }
    };

    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      stage.removeEventListener("wheel", handleWheel);
      clearTimeout(deltaResetTimer);
    };
  }, [dropNextCard, pickPrevCard, currentIndex, videos.length]);

  // Touch gesture for mobile / tablet
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartY.current = e.touches[0].clientY;
      touchStartTime.current = Date.now();
    };

    const handleTouchEnd = (e: TouchEvent) => {
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

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        dropNextCard();
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
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
      className="relative w-full h-[calc(100vh-3.5rem)] bg-[#050505] select-none overflow-hidden"
    >
      {/* 3D Perspective Stage Container */}
      <div
        ref={stageRef}
        style={{ perspective: "1400px", perspectiveOrigin: "50% 36%" }}
        className="w-full h-full flex flex-col items-center justify-center bg-[#050505] px-4 sm:px-6 relative overflow-hidden"
      >
        {/* Subtle Ambient Vignette */}
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,rgba(255,60,0,0.025)_0%,transparent_70%)]" />

        {/* =========================================================================
            DECORATION: TOP PLUMB LINE WITH ANCHOR PIN (From Screenshot)
            ========================================================================= */}
        <div className="absolute top-2 sm:top-4 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none z-30 decor-element">
          <div className="w-2.5 h-2.5 rounded-full border border-white/40 flex items-center justify-center bg-black shadow-[0_0_8px_rgba(255,255,255,0.4)]">
            <div className="w-1 h-1 rounded-full bg-white" />
          </div>
          <div className="w-[1px] h-10 sm:h-14 bg-gradient-to-b from-white/35 to-white/10" />
        </div>

        {/* =========================================================================
            DECORATION: SIDE WIREFRAME NODES Z.IN & Z.OUT (From Screenshot)
            ========================================================================= */}
        <div className="hidden lg:flex absolute left-8 top-1/2 -translate-y-1/2 flex-col items-center pointer-events-none z-20 decor-element">
          <div className="w-3 h-3 rounded-full border border-white/30 flex items-center justify-center">
            <div className="w-1 h-1 rounded-full bg-white/70" />
          </div>
          <span className="mt-1.5 text-[9px] font-mono tracking-[0.25em] text-neutral-400 uppercase">
            Z.IN
          </span>
        </div>

        <div className="hidden lg:flex absolute right-8 top-1/2 -translate-y-1/2 flex-col items-center pointer-events-none z-20 decor-element">
          <div className="w-3 h-3 rounded-full border border-white/30 flex items-center justify-center">
            <div className="w-1 h-1 rounded-full bg-white/70" />
          </div>
          <span className="mt-1.5 text-[9px] font-mono tracking-[0.25em] text-neutral-400 uppercase">
            Z.OUT
          </span>
        </div>

        {/* =========================================================================
            CENTERED 3D WIDESCREEN CARDS STACK
            ========================================================================= */}
        <div
          style={{ transformStyle: "preserve-3d" }}
          className="relative w-full max-w-[850px] aspect-[16/9.6] max-h-[50vh] sm:max-h-[53vh] flex items-center justify-center mt-10 sm:mt-14"
        >
          {videos.map((video, index) => {
            const dateInfo = parseCardDate(video.createdAt);
            const channelName = video.channel?.channelName || "Cinema";
            const topResolution = video.videos?.[0]?.resolution || "4K";

            // Enforce maximum 6 playing videos: active window is [currentIndex, currentIndex + 6)
            const isActivePlaying =
              index >= currentIndex && index < currentIndex + 6;
            const isFrontCard = index === currentIndex;

            // Only mount full video element for cards within active and near buffer
            const shouldMountVideo =
              index >= currentIndex - 1 && index <= currentIndex + 7;

            return (
              <div
                key={video.id}
                ref={setCardRef(index)}
                style={{ transformStyle: "preserve-3d" }}
                onClick={() => {
                  if (index > currentIndex) {
                    // Clicking a visible behind card advances directly to it
                    dropNextCard();
                  } else if (isFrontCard) {
                    // Clicking the front card triggers the seamless hero transition
                    handleFrontCardClick(video);
                  }
                }}
                className={`absolute inset-0 rounded-xl sm:rounded-2xl border border-white/12 bg-neutral-950 overflow-hidden shadow-[0_24px_70px_-15px_rgba(0,0,0,0.95)] will-change-transform flex flex-col ${
                  index > currentIndex
                    ? "cursor-pointer hover:border-white/30"
                    : "cursor-pointer"
                }`}
              >
                {/* 1. Slim Restrained Metadata Header (Upload Date | Title | Channel) */}
                <div className="w-full h-10 sm:h-11 bg-black/90 backdrop-blur-md border-b border-white/8 px-4 sm:px-6 flex items-center justify-between gap-3 text-xs shrink-0 z-20">
                  {/* Left: Upload Date */}
                  <div className="text-[10px] sm:text-[11px] font-mono text-neutral-400 tracking-wider uppercase shrink-0 truncate max-w-[120px] sm:max-w-none">
                    {dateInfo.headerDate}
                  </div>

                  {/* Center: Video Title */}
                  <div className="font-semibold text-xs sm:text-sm tracking-wide text-white text-center truncate flex-1 px-2">
                    {video.title}
                  </div>

                  {/* Right: Channel / Genre Name */}
                  <div className="text-[10px] sm:text-[11px] font-mono text-neutral-300 tracking-wider shrink-0 truncate max-w-[130px] sm:max-w-none text-right">
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

                  {/* Bottom Badges */}
                  <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-xs text-white/90 pointer-events-none">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-[9px] font-mono font-bold tracking-wider text-white">
                        {topResolution} LIVE WALLPAPER
                      </span>
                    </div>

                    {isFrontCard && (
                      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-[10px] font-medium text-white group-hover:bg-[#ff3c00] group-hover:border-[#ff3c00] transition-colors">
                        <span>Open Preview</span>
                        <ExternalLink className="w-3 h-3" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* =========================================================================
              END-OF-FEED REVEAL SCREEN
              ========================================================================= */}
          <div
            ref={endOfFeedRef}
            className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 z-0"
          >
            <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-mono font-bold uppercase tracking-[0.25em] text-[#ff3c00] mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>VION WALLPAPER DISCOVERY</span>
            </div>

            <h2 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-white uppercase mb-2">
              YOU&apos;VE REACHED THE END.
            </h2>

            <p className="text-xs sm:text-sm text-neutral-400 max-w-md mx-auto mb-8 leading-relaxed font-light">
              You&apos;ve seen every frame for now. Stay tuned as independent creators publish new high-definition live wallpapers.
            </p>

            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={rewindToBeginning}
                className="rounded-full text-xs font-semibold px-6 h-9 border-white/20 bg-white/5 text-white hover:bg-white/15 gap-2 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Rewind to Beginning
              </Button>

              {activeFeed === "subscriptions" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push("/")}
                  className="rounded-full text-xs text-neutral-400 hover:text-white px-4 h-9 cursor-pointer"
                >
                  Explore All Wallpapers
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* =========================================================================
            DECORATION: TICK RULER GAUGE (Under the Front Card)
            ========================================================================= */}
        <div className="w-full max-w-[420px] mx-auto flex items-center justify-between text-neutral-400 px-3 mt-3 sm:mt-4 select-none pointer-events-none decor-element">
          <span className="font-mono text-xs font-bold text-neutral-400">L</span>
          <div className="flex items-center gap-[3px] sm:gap-1.5 px-3">
            {Array.from({ length: 27 }).map((_, i) => {
              const activeRatio =
                videos.length > 1
                  ? Math.round(
                      (currentIndex / Math.max(1, videos.length - 1)) * 26,
                    )
                  : 13;
              const isCurrent = activeRatio === i;
              const isCenter = i === 13;
              return (
                <div
                  key={i}
                  className={`transition-all duration-300 ${
                    isCurrent
                      ? "w-[2px] h-3.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"
                      : isCenter
                      ? "w-[1px] h-2.5 bg-white/40"
                      : i % 2 === 0
                      ? "w-[1px] h-1.5 bg-white/20"
                      : "w-[1px] h-1 bg-white/10"
                  }`}
                />
              );
            })}
          </div>
          <span className="font-mono text-xs font-bold text-neutral-400">R</span>
        </div>

        {/* =========================================================================
            DECORATION: BOTTOM FLOATING SIGNATURE PILL (From Screenshot)
            ========================================================================= */}
        {activeVideo && (
          <div
            onClick={() => handleFrontCardClick(activeVideo)}
            className="w-[94%] sm:w-[88%] max-w-[850px] h-13 sm:h-14 rounded-2xl bg-[#090909]/90 backdrop-blur-xl border border-white/10 px-5 sm:px-8 flex items-center justify-between shadow-[0_12px_45px_rgba(0,0,0,0.9)] z-30 decor-element mt-3 sm:mt-3.5 mb-1 cursor-pointer hover:border-white/25 transition-colors"
          >
            {/* Left: Year | Date | Title */}
            <div className="flex items-center gap-3 sm:gap-4 truncate">
              <div className="text-xl sm:text-2xl font-black text-white tracking-tight shrink-0 font-sans">
                {activeDateInfo.year}
              </div>
              <div className="h-6 w-[1px] bg-white/15 shrink-0" />
              <div className="flex flex-col text-[10px] leading-tight font-mono shrink-0">
                <span className="text-white font-bold">{activeDateInfo.day}</span>
                <span className="text-neutral-400 uppercase">{activeDateInfo.month}</span>
              </div>
              <div className="text-xs sm:text-sm font-semibold text-neutral-200 tracking-wide truncate ml-2 sm:ml-4">
                {activeVideo.title}
              </div>
            </div>

            {/* Right: Abstract Tech Glyph & Creator Name */}
            <div className="flex items-center gap-2.5 shrink-0 ml-4">
              <svg
                viewBox="0 0 24 16"
                className="w-5 h-3.5 text-white/70 fill-current shrink-0"
              >
                <path d="M0 0h4v4H0zm6 0h4v4H6zm0 6h4v4H6zm0 6h4v4H6zm6-6h4v4h-4zm6-6h4v4h-4zm0 6h4v4h-4zm0 6h4v4h-4z" />
              </svg>
              <span className="text-xs sm:text-sm font-medium text-white tracking-wide truncate max-w-[130px] sm:max-w-[200px]">
                {activeVideo.channel?.channelName || "Ali Zafar Iqbal"}
              </span>
            </div>
          </div>
        )}

        {/* Scroll Hint */}
        {currentIndex === 0 && (
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-[9px] font-mono tracking-widest uppercase text-neutral-400 pointer-events-none opacity-60">
            <span>Scroll or swipe</span>
            <ChevronDown className="w-3 h-3 text-[#ff3c00]" />
          </div>
        )}
      </div>
    </div>
  );
}
