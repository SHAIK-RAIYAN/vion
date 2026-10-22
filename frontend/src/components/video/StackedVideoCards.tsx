"use client";

import { useGSAP } from "@gsap/react";
import Hls from "hls.js";
import { Play } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useCurtainTransition } from "@/components/transitions/CurtainTransitionContext";
import { useViewMode } from "@/context/ViewModeContext";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { animateCardToWatchPage } from "@/lib/heroTransition";
import { useLenisContext } from "@/providers/LenisProvider";
import type { Upload } from "@/types/api";

interface StackedVideoCardsProps {
  videos: Upload[];
  activeFeed?: "all" | "subscriptions";
  onLoadMore?: () => void;
  hasNextPage?: boolean;
}

// =========================================================================
// 3D STACK SLOT CONFIGURATION
// Progressive depth, scale, elevation, brightness, and camera depth-of-field blur
// Reveals roughly 60-85px of separation between successive visible card tops
// =========================================================================
const STACK_SLOTS = [
  { y: 0, z: 0, scale: 1, opacity: 1, brightness: 1, blur: 0 },
  { y: -62, z: -70, scale: 0.92, opacity: 0.98, brightness: 0.9, blur: 0 },
  { y: -120, z: -138, scale: 0.84, opacity: 0.94, brightness: 0.79, blur: 0.25 },
  { y: -174, z: -204, scale: 0.76, opacity: 0.88, brightness: 0.68, blur: 0.55 },
  { y: -224, z: -266, scale: 0.68, opacity: 0.76, brightness: 0.56, blur: 0.9 },
  { y: -270, z: -324, scale: 0.61, opacity: 0.6, brightness: 0.46, blur: 1.25 },
] as const;

// Maximum number of visible cards in the 3D stack (front card + 3 stacked behind)
const MAX_VISIBLE_CARDS = 4;
// Play video stream on front visible cards
const PLAYBACK_SLOTS = MAX_VISIBLE_CARDS;

// Velocity-based dynamic scroll acceleration constants
const SLOW_DURATION = 0.76;        // Base duration for slow, deliberate scrolling
const FAST_DURATION = 0.28;        // Duration during rapid continuous flick / spin
const MIN_ALLOWED_DURATION = 0.24;  // Lower clamp to preserve visual depth integrity
const MAX_PENDING_QUEUE = 4;       // Bounded queue prevents runaway trackpad inertia
const BASE_SCROLL_THRESHOLD = 60;  // Pixels of normalized delta to commit 1 card step
const WHEEL_WINDOW_MS = 220;       // Rolling window for velocity calculation

function getTransitionEase(duration: number): string {
  return duration < 0.44 ? "power2.inOut" : "power3.inOut";
}

function computeTransitionDuration(velocity: number, pendingCount: number): number {
  if (prefersReducedMotion()) return 0.15;

  // Normalized intensity based on velocity (0 - 2800+ px/s) and queue depth (1 - 4)
  const normVelocity = Math.min(Math.max(velocity, 0), 2800) / 2800;
  const normQueue = Math.min(Math.max(pendingCount - 1, 0), 3) / 3;

  // Intensity increases with higher velocity or queued backlog
  const intensity = Math.max(normVelocity * 0.92, normQueue * 0.88);

  const duration = SLOW_DURATION - intensity * (SLOW_DURATION - FAST_DURATION);
  return Math.max(MIN_ALLOWED_DURATION, Math.min(SLOW_DURATION, duration));
}

type Slot = (typeof STACK_SLOTS)[number];

function getSlotVars(slotIndex: number, visibleCount: number) {
  const slot = STACK_SLOTS[Math.min(slotIndex, visibleCount - 1)] as Slot;
  return {
    x: 0,
    y: slot.y,
    z: slot.z,
    scale: slot.scale,
    opacity: slot.opacity,
    filter: `brightness(${slot.brightness}) blur(${slot.blur}px)`,
    zIndex: 50 - slotIndex,
    transformOrigin: "center top",
    transformStyle: "preserve-3d" as const,
    force3D: true,
    visibility: "visible" as const,
    pointerEvents: "auto" as const,
  };
}

function getHiddenVars() {
  return {
    x: 0,
    y: "125vh",
    z: -420,
    scale: 0.5,
    opacity: 0,
    filter: "brightness(0.3) blur(3px)",
    zIndex: 0,
    visibility: "hidden" as const,
    pointerEvents: "none" as const,
  };
}

function getEntryVars(slotIndex: number, visibleCount: number) {
  const target = STACK_SLOTS[Math.min(slotIndex, visibleCount - 1)];
  return {
    x: 0,
    y: target.y + 155,
    z: target.z - 170,
    scale: target.scale * 0.78,
    opacity: 0,
    filter: `brightness(${target.brightness * 0.45}) blur(3px)`,
    zIndex: 50 - slotIndex,
    transformOrigin: "center top",
    transformStyle: "preserve-3d" as const,
    force3D: true,
    visibility: "visible" as const,
    pointerEvents: "none" as const,
  };
}

function relativeSlot(index: number, currentIndex: number, total: number) {
  return total === 0 ? 0 : (index - currentIndex + total) % total;
}

function formatCardDate(value?: string) {
  if (!value) return "Recent";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";
  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

type VideoSource = { type: "mp4" | "hls"; url: string } | null;

interface CardVideoPlayerProps {
  video: Upload;
  isActive: boolean;
  isFront: boolean;
}

// =========================================================================
// HIGH-PERFORMANCE CARD VIDEO PLAYER
// Strictly caps stream resolution to 720p/480p to conserve memory & bandwidth
// Automatically pauses playback when inactive or when document is hidden
// =========================================================================
const CardVideoPlayer = memo(function CardVideoPlayer({
  video,
  isActive,
  isFront,
}: CardVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [hasError, setHasError] = useState(false);

  const source = useMemo<VideoSource>(() => {
    const renditions = video.videos ?? [];

    const preferredMp4 =
      renditions.find((item) => item.resolution === "720p" && item.url?.includes(".mp4")) ??
      renditions.find((item) => item.resolution === "480p" && item.url?.includes(".mp4"));

    if (preferredMp4?.url) return { type: "mp4", url: preferredMp4.url };

    const preferredStream =
      renditions.find((item) => item.resolution === "720p" && item.url) ??
      renditions.find((item) => item.resolution === "480p" && item.url) ??
      renditions.find((item) => item.url);

    if (preferredStream?.url) {
      return {
        type: preferredStream.url.includes(".m3u8") ? "hls" : "mp4",
        url: preferredStream.url,
      };
    }

    if (video.hlsManifestUrl) {
      return { type: "hls", url: video.hlsManifestUrl };
    }

    return null;
  }, [video]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !source || hasError || !isActive) {
      element?.pause();
      return;
    }

    element.muted = true;
    let hls: Hls | null = null;

    const play = () => {
      element.play().catch(() => {
        // Safe catch for autoplay constraints or unmounting
      });
    };

    if (source.type === "hls") {
      if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          maxBufferLength: 4,
          maxMaxBufferLength: 8,
          maxBufferSize: 6 * 1024 * 1024,
          backBufferLength: 0,
          capLevelToPlayerSize: true,
        });

        hls.loadSource(source.url);
        hls.attachMedia(element);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          const eligible =
            hls?.levels
              .map((level, index) => ({ index, height: level.height }))
              .filter((level) => level.height <= 720) ?? [];

          if (hls && eligible.length > 0) {
            const best = eligible.reduce((a, b) => (b.height > a.height ? b : a));
            hls.autoLevelCapping = best.index;
            hls.currentLevel = best.index;
          }
          play();
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) setHasError(true);
        });
      } else if (element.canPlayType("application/vnd.apple.mpegurl")) {
        element.src = source.url;
        element.load();
        play();
      } else {
        setHasError(true);
      }
    } else {
      if (element.src !== source.url) {
        element.src = source.url;
        element.load();
      }
      play();
    }

    return () => {
      element.pause();
      if (hls) hls.destroy();
    };
  }, [hasError, isActive, source]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;

    const onVisibilityChange = () => {
      if (document.hidden || !isActive) {
        element.pause();
      } else {
        element.play().catch(() => { });
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [isActive]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {video.thumbnailUrl ? (
        <img
          src={video.thumbnailUrl}
          alt={video.title}
          className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${isReady ? "opacity-0" : "opacity-100"
            }`}
          loading={isFront ? "eager" : "lazy"}
        />
      ) : (
        <div
          className={`pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-radial from-neutral-200 to-neutral-100 text-neutral-600 transition-opacity duration-500 dark:from-neutral-900 dark:to-black dark:text-neutral-500 ${isReady ? "opacity-0" : "opacity-100"
            }`}
        >
          <Play className="h-10 w-10 opacity-30 text-neutral-600 dark:text-white/40" />
          <span className="mt-2 font-mono text-[10px] uppercase tracking-widest text-neutral-600 dark:text-neutral-400 opacity-60">
            Live Wallpaper
          </span>
        </div>
      )}

      {source && !hasError && (
        <video
          ref={videoRef}
          src={source.type === "mp4" ? source.url : undefined}
          poster={video.thumbnailUrl || undefined}
          muted
          loop
          playsInline
          autoPlay={isActive}
          preload={isFront ? "auto" : "metadata"}
          onPlaying={() => setIsReady(true)}
          onLoadedData={() => setIsReady(true)}
          onError={() => setHasError(true)}
          className={`h-full w-full object-cover transition-opacity duration-500 ${isReady ? "opacity-100" : "opacity-0"
            }`}
        />
      )}
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
  const { lenis } = useLenisContext();

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<Array<HTMLDivElement | null>>([]);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const didInitializeRef = useRef(false);
  const currentIndexRef = useRef(0);
  const isAnimatingRef = useRef(false);
  const isNavigatingRef = useRef(false);
  const pendingIntentRef = useRef(0);
  const wheelSamplesRef = useRef<Array<{ delta: number; time: number }>>([]);
  const lastWheelTimeRef = useRef(0);
  const accumulatedDeltaRef = useRef(0);
  const deltaResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failsafeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLoadMoreLengthRef = useRef(-1);
  const touchStartYRef = useRef(0);
  const touchStartAtRef = useRef(0);
  const touchRecentSamplesRef = useRef<Array<{ y: number; time: number }>>([]);
  const processQueueRef = useRef<() => void>(() => {});
  const [currentIndex, setCurrentIndex] = useState(0);

  const videoSignature = videos.map((video) => video.id).join("|");
  const videoCount = videos.length;
  const visibleCount = Math.min(videoCount, MAX_VISIBLE_CARDS);

  // Stop Lenis while StackedVideoCards is active so it does not intercept or conflict with gestures
  useEffect(() => {
    if (!lenis) return;
    lenis.stop();
    return () => {
      lenis.start();
    };
  }, [lenis]);

  const setCardRef = useCallback(
    (index: number) => (element: HTMLDivElement | null) => {
      cardsRef.current[index] = element;
    },
    [],
  );

  const applySlot = useCallback((element: HTMLElement, slot: number, count: number) => {
    gsap.set(element, getSlotVars(slot, count));
  }, []);

  const syncStack = useCallback(
    (index: number) => {
      if (videoCount === 0) return;
      const normalizedIndex = ((index % videoCount) + videoCount) % videoCount;

      cardsRef.current.forEach((element, cardIndex) => {
        if (!element) return;
        const slot = relativeSlot(cardIndex, normalizedIndex, videoCount);
        if (slot < visibleCount) {
          applySlot(element, slot, visibleCount);
        } else {
          gsap.set(element, getHiddenVars());
        }
      });
    },
    [applySlot, videoCount, visibleCount],
  );

  // =========================================================================
  // GSAP INITIAL ENTRANCE / VIEW-MODE FLIP
  // Cascades forward from deep in Z space or morphs smoothly from previous grid layout
  // =========================================================================
  useGSAP(
    () => {
      if (videoCount === 0) return;

      const normalizedIndex = ((currentIndexRef.current % videoCount) + videoCount) % videoCount;
      currentIndexRef.current = normalizedIndex;
      setCurrentIndex(normalizedIndex);

      if (didInitializeRef.current) {
        syncStack(normalizedIndex);
        isAnimatingRef.current = false;
        return;
      }

      didInitializeRef.current = true;
      const reducedMotion = prefersReducedMotion();
      const snapshot = getCardSnapshot();
      const intro = gsap.timeline({
        onComplete: () => {
          isAnimatingRef.current = false;
          clearSnapshot();
        },
        onInterrupt: () => {
          isAnimatingRef.current = false;
        },
      });

      isAnimatingRef.current = !reducedMotion;

      cardsRef.current.forEach((element, cardIndex) => {
        if (!element) return;
        const slot = relativeSlot(cardIndex, normalizedIndex, videoCount);

        if (slot >= visibleCount) {
          gsap.set(element, getHiddenVars());
          return;
        }

        const target = getSlotVars(slot, visibleCount);
        if (reducedMotion) {
          gsap.set(element, target);
          return;
        }

        const rect = snapshot?.get(videos[cardIndex]?.id);
        if (rect) {
          const natural = element.getBoundingClientRect();
          const naturalCenterX = natural.left + natural.width / 2;
          const naturalCenterY = natural.top + natural.height / 2;
          const snapshotCenterX = rect.left + rect.width / 2;
          const snapshotCenterY = rect.top + rect.height / 2;
          const start = {
            x: snapshotCenterX - naturalCenterX,
            y: snapshotCenterY - naturalCenterY,
            z: target.z - 100,
            scale: rect.width / Math.max(1, natural.width),
            opacity: 0,
            filter: "brightness(0.5) blur(2px)",
          };
          gsap.set(element, { ...start, ...{ visibility: "visible", zIndex: 50 - slot } });
        } else {
          gsap.set(element, {
            ...getEntryVars(slot, visibleCount),
            y: target.y + 65,
            z: target.z - 300,
            scale: target.scale * 0.76,
            filter: `brightness(${Math.max(0.2, STACK_SLOTS[slot].brightness * 0.5)}) blur(5px)`,
          });
        }

        const delay = Math.max(0, 0.24 - slot * 0.045);
        intro.to(
          element,
          {
            ...target,
            duration: reducedMotion ? 0 : 0.86,
            ease: "power3.inOut",
            clearProps: "willChange",
          },
          delay,
        );
      });

      intro.fromTo(
        ".decor-element",
        { opacity: 0, y: -8 },
        { opacity: 1, y: 0, duration: reducedMotion ? 0 : 0.65, ease: "power3.inOut" },
        0.1,
      );

      if (reducedMotion) {
        intro.progress(1).kill();
        isAnimatingRef.current = false;
        clearSnapshot();
      } else {
        timelineRef.current = intro;
      }

      return () => {
        isAnimatingRef.current = false;
      };
    },
    {
      scope: containerRef,
      dependencies: [videoSignature],
      revertOnUpdate: false,
    },
  );

  // =========================================================================
  // CARD FINALIZE & STACK RE-SYNC
  // =========================================================================
  const finishTransition = useCallback(
    (nextIndex: number, shouldLoadMore = false) => {
      currentIndexRef.current = nextIndex;
      setCurrentIndex(nextIndex);
      syncStack(nextIndex);

      if (failsafeTimerRef.current) clearTimeout(failsafeTimerRef.current);

      if (shouldLoadMore && hasNextPage && onLoadMore && lastLoadMoreLengthRef.current !== videoCount) {
        lastLoadMoreLengthRef.current = videoCount;
        onLoadMore();
      }
    },
    [hasNextPage, onLoadMore, syncStack, videoCount],
  );

  // =========================================================================
  // CARD DROP & CONVEYOR PROGRESSION (FORWARD / DOWN)
  // Front card plunges downward, middle cards step forward, new card rises into backSlot
  // =========================================================================
  const executeDropNext = useCallback(
    (duration: number) => {
      const total = videos.length;
      const count = Math.min(total, MAX_VISIBLE_CARDS);
      if (total < 2 || count < 2 || isNavigatingRef.current) return;

      isAnimatingRef.current = true;
      timelineRef.current?.kill();

      // Failsafe watchdog to prevent lockouts
      if (failsafeTimerRef.current) clearTimeout(failsafeTimerRef.current);
      failsafeTimerRef.current = setTimeout(() => {
        isAnimatingRef.current = false;
        pendingIntentRef.current = 0;
        syncStack(currentIndexRef.current);
      }, 1400);

      const fromIndex = currentIndexRef.current % total;
      const nextIndex = (fromIndex + 1) % total;
      const ease = getTransitionEase(duration);
      const activeCard = cardsRef.current[fromIndex];
      const hasNewBackCard = total > count;
      const birthIndex = hasNewBackCard ? (fromIndex + count) % total : fromIndex;
      const birthCard = cardsRef.current[birthIndex];
      const backSlot = count - 1;

      const timeline = gsap.timeline({
        onComplete: () => {
          if (activeCard && hasNewBackCard) gsap.set(activeCard, getHiddenVars());
          finishTransition(nextIndex, nextIndex >= total - 3);
          isAnimatingRef.current = false;

          // Process next queued intent if any remains
          if (pendingIntentRef.current !== 0) {
            processQueueRef.current();
          }
        },
        onInterrupt: () => {
          isAnimatingRef.current = false;
          pendingIntentRef.current = 0;
        },
      });
      timelineRef.current = timeline;

      // 1. Front card drops down and out
      if (activeCard) {
        timeline.to(
          activeCard,
          {
            y: "125vh",
            z: 0,
            scale: 1.04,
            opacity: 0,
            filter: "brightness(0.4) blur(2px)",
            zIndex: 100,
            pointerEvents: "none",
            duration: duration * (hasNewBackCard ? 1 : 0.58),
            ease,
          },
          0,
        );
      }

      // 2. Middle cards advance one slot towards foreground
      for (let step = 1; step < count; step++) {
        const cardIndex = (fromIndex + step) % total;
        const card = cardsRef.current[cardIndex];
        if (!card) continue;
        timeline.to(
          card,
          {
            ...getSlotVars(step - 1, count),
            duration,
            ease,
          },
          0,
        );
      }

      // 3. Backside card enters from behind and below the stack
      if (birthCard) {
        if (hasNewBackCard) {
          gsap.set(birthCard, getEntryVars(backSlot, count));
          timeline.to(
            birthCard,
            { ...getSlotVars(backSlot, count), duration: duration * 0.9, ease },
            duration * 0.1,
          );
        } else {
          // Wrap-around mode when total <= count: fallen front card resets and ascends to back
          timeline.set(birthCard, getEntryVars(backSlot, count), duration * 0.58);
          timeline.to(
            birthCard,
            { ...getSlotVars(backSlot, count), duration: duration * 0.42, ease },
            duration * 0.58,
          );
        }
      }
    },
    [finishTransition, videos.length],
  );

  // =========================================================================
  // CARD PICK / REVERSE CONVEYOR PROGRESSION (BACKWARD / UP)
  // Previous card sweeps up into Slot 0, existing cards push backward into depth
  // =========================================================================
  const executePickPrev = useCallback(
    (duration: number) => {
      const total = videos.length;
      const count = Math.min(total, MAX_VISIBLE_CARDS);
      if (total < 2 || count < 2 || isNavigatingRef.current) return;

      isAnimatingRef.current = true;
      timelineRef.current?.kill();

      // Failsafe watchdog to prevent lockouts
      if (failsafeTimerRef.current) clearTimeout(failsafeTimerRef.current);
      failsafeTimerRef.current = setTimeout(() => {
        isAnimatingRef.current = false;
        pendingIntentRef.current = 0;
        syncStack(currentIndexRef.current);
      }, 1400);

      const fromIndex = currentIndexRef.current % total;
      const previousIndex = (fromIndex - 1 + total) % total;
      const ease = getTransitionEase(duration);
      const previousCard = cardsRef.current[previousIndex];

      const timeline = gsap.timeline({
        onComplete: () => {
          finishTransition(previousIndex);
          isAnimatingRef.current = false;

          // Process next queued intent if any remains
          if (pendingIntentRef.current !== 0) {
            processQueueRef.current();
          }
        },
        onInterrupt: () => {
          isAnimatingRef.current = false;
          pendingIntentRef.current = 0;
        },
      });
      timelineRef.current = timeline;

      // 1. Previous card sweeps up from bottom into front Slot 0
      if (previousCard) {
        gsap.set(previousCard, {
          ...getEntryVars(0, count),
          y: "110vh",
          z: -80,
          scale: 1.04,
          opacity: 0,
          zIndex: 100,
          visibility: "visible",
          pointerEvents: "auto",
        });
        timeline.to(
          previousCard,
          { ...getSlotVars(0, count), duration, ease },
          0,
        );
      }

      // 2. Existing cards step backward by one slot in depth
      for (let step = 0; step < count; step++) {
        const cardIndex = (fromIndex + step) % total;
        if (cardIndex === previousIndex) continue;
        const card = cardsRef.current[cardIndex];
        if (!card) continue;

        if (step === count - 1) {
          // Rearest card recedes down and backward
          timeline.to(
            card,
            {
              y: STACK_SLOTS[count - 1].y + 140,
              z: STACK_SLOTS[count - 1].z - 150,
              scale: STACK_SLOTS[count - 1].scale * 0.82,
              opacity: 0,
              filter: "brightness(0.3) blur(3px)",
              duration: duration * 0.8,
              ease,
            },
            0,
          );
        } else {
          timeline.to(
            card,
            { ...getSlotVars(step + 1, count), duration, ease },
            0,
          );
        }
      }
    },
    [finishTransition, videos.length],
  );

  // =========================================================================
  // QUEUE PROCESSOR: Sequentially processes accumulated scroll intent with dynamic duration
  // =========================================================================
  const processQueue = useCallback(() => {
    if (isNavigatingRef.current) {
      pendingIntentRef.current = 0;
      return;
    }

    if (isAnimatingRef.current || pendingIntentRef.current === 0) return;

    const direction = pendingIntentRef.current > 0 ? 1 : -1;
    const queueDepth = Math.abs(pendingIntentRef.current);

    // Consume 1 unit of intent
    pendingIntentRef.current -= direction;

    // Calculate current velocity from recent samples
    const now = performance.now();
    const cutoff = now - WHEEL_WINDOW_MS;
    const recent = wheelSamplesRef.current.filter((s) => s.time > cutoff);
    let deltaSum = 0;
    for (const s of recent) deltaSum += Math.abs(s.delta);
    const span = Math.max(30, now - (recent[0]?.time ?? now));
    const currentVelocity = deltaSum / (span / 1000);

    const duration = computeTransitionDuration(currentVelocity, queueDepth);

    if (direction > 0) {
      executeDropNext(duration);
    } else {
      executePickPrev(duration);
    }
  }, [executeDropNext, executePickPrev]);

  useEffect(() => {
    processQueueRef.current = processQueue;
  }, [processQueue]);

  const dropNextCard = useCallback(
    (requestedDuration?: number) => {
      if (isNavigatingRef.current || videos.length < 2) return;
      if (requestedDuration) {
        wheelSamplesRef.current.push({ delta: 200, time: performance.now() });
      }
      if (pendingIntentRef.current < MAX_PENDING_QUEUE) {
        pendingIntentRef.current++;
      }
      if (!isAnimatingRef.current) {
        processQueueRef.current();
      }
    },
    [videos.length],
  );

  const pickPrevCard = useCallback(
    (requestedDuration?: number) => {
      if (isNavigatingRef.current || videos.length < 2) return;
      if (requestedDuration) {
        wheelSamplesRef.current.push({ delta: -200, time: performance.now() });
      }
      if (pendingIntentRef.current > -MAX_PENDING_QUEUE) {
        pendingIntentRef.current--;
      }
      if (!isAnimatingRef.current) {
        processQueueRef.current();
      }
    },
    [videos.length],
  );

  // =========================================================================
  // SEAMLESS HERO CLICK-TO-WATCH TRANSITION
  // Preserves existing seamless hero transition into the /watch/[id] player
  // =========================================================================
  const handleFrontCardClick = useCallback(
    (video: Upload) => {
      if (isAnimatingRef.current || isNavigatingRef.current) return;
      isNavigatingRef.current = true;
      isAnimatingRef.current = true;
      pendingIntentRef.current = 0;
      skipNextTransition();

      const activeCard = cardsRef.current[currentIndexRef.current];
      const otherCards = cardsRef.current.filter((_, index) => index !== currentIndexRef.current);
      gsap.to([...otherCards, ".decor-element"], {
        opacity: 0,
        scale: 0.96,
        y: "+=10",
        duration: 0.32,
        ease: "power2.inOut",
      });

      if (activeCard) {
        animateCardToWatchPage({
          cardElement: activeCard,
          video,
          router,
          skipCurtainTransition: skipNextTransition,
        });
      } else {
        router.push(`/watch/${video.id}`);
      }
    },
    [router, skipNextTransition],
  );

  // =========================================================================
  // WHEEL & TOUCH GESTURE HANDLING WITH SCROLL ACCELERATION & QUEUEING
  // =========================================================================
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || videos.length < 2) return;
      event.preventDefault();
      event.stopPropagation();
      if (isNavigatingRef.current) return;

      const now = performance.now();
      const unit = event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? window.innerHeight : 1;
      const rawDelta = event.deltaY * unit;
      if (Math.abs(rawDelta) < 0.5) return;

      lastWheelTimeRef.current = now;

      // Direction reversal handling: adjust or cancel pending intent if opposite scroll arrives
      if (
        (rawDelta > 0 && accumulatedDeltaRef.current < 0) ||
        (rawDelta < 0 && accumulatedDeltaRef.current > 0)
      ) {
        accumulatedDeltaRef.current = 0;
        if (rawDelta < 0 && pendingIntentRef.current > 0) {
          pendingIntentRef.current = Math.max(0, pendingIntentRef.current - 1);
        } else if (rawDelta > 0 && pendingIntentRef.current < 0) {
          pendingIntentRef.current = Math.min(0, pendingIntentRef.current + 1);
        }
      }

      // Record sample in rolling velocity window
      const cutoff = now - WHEEL_WINDOW_MS;
      wheelSamplesRef.current = wheelSamplesRef.current.filter((s) => s.time > cutoff);
      wheelSamplesRef.current.push({ delta: rawDelta, time: now });

      accumulatedDeltaRef.current += rawDelta;

      if (deltaResetTimerRef.current) clearTimeout(deltaResetTimerRef.current);
      deltaResetTimerRef.current = setTimeout(() => {
        accumulatedDeltaRef.current = 0;
        wheelSamplesRef.current = [];
      }, 140);

      while (Math.abs(accumulatedDeltaRef.current) >= BASE_SCROLL_THRESHOLD) {
        const dir = accumulatedDeltaRef.current > 0 ? 1 : -1;
        accumulatedDeltaRef.current -= dir * BASE_SCROLL_THRESHOLD;

        if (dir > 0) {
          if (pendingIntentRef.current < 0) {
            pendingIntentRef.current++;
          } else if (pendingIntentRef.current < MAX_PENDING_QUEUE) {
            pendingIntentRef.current++;
          }
        } else {
          if (pendingIntentRef.current > 0) {
            pendingIntentRef.current--;
          } else if (pendingIntentRef.current > -MAX_PENDING_QUEUE) {
            pendingIntentRef.current--;
          }
        }
      }

      if (!isAnimatingRef.current && pendingIntentRef.current !== 0) {
        processQueueRef.current();
      }
    };

    const onTouchStart = (event: TouchEvent) => {
      touchStartYRef.current = event.touches[0]?.clientY ?? 0;
      touchStartAtRef.current = performance.now();
      touchRecentSamplesRef.current = [{ y: touchStartYRef.current, time: touchStartAtRef.current }];
    };

    const onTouchMove = (event: TouchEvent) => {
      const currentY = event.touches[0]?.clientY ?? 0;
      const now = performance.now();
      touchRecentSamplesRef.current.push({ y: currentY, time: now });
      if (touchRecentSamplesRef.current.length > 5) {
        touchRecentSamplesRef.current.shift();
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (isNavigatingRef.current || videos.length < 2) return;
      const endY = event.changedTouches[0]?.clientY ?? touchStartYRef.current;
      const totalDistance = touchStartYRef.current - endY;

      if (Math.abs(totalDistance) < 35) return;

      const firstSample = touchRecentSamplesRef.current[0] || {
        y: touchStartYRef.current,
        time: touchStartAtRef.current,
      };
      const recentDistance = firstSample.y - endY;
      const recentElapsed = Math.max(10, performance.now() - firstSample.time);
      const velocity = Math.abs(recentDistance) / (recentElapsed / 1000);

      const dir = totalDistance > 0 ? 1 : -1;
      const steps = velocity > 1800 ? 2 : 1;

      const now = performance.now();
      wheelSamplesRef.current = [{ delta: dir * velocity * 0.35, time: now }];

      if (dir > 0) {
        pendingIntentRef.current = Math.min(
          MAX_PENDING_QUEUE,
          Math.max(1, pendingIntentRef.current + steps),
        );
      } else {
        pendingIntentRef.current = Math.max(
          -MAX_PENDING_QUEUE,
          Math.min(-1, pendingIntentRef.current - steps),
        );
      }

      if (!isAnimatingRef.current) {
        processQueueRef.current();
      }
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: true });
    container.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      if (deltaResetTimerRef.current) clearTimeout(deltaResetTimerRef.current);
    };
  }, [videos.length]);

  // Keyboard navigation (Arrow keys, PageUp/Down, Space)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, select, button, a, [contenteditable='true']")
      ) return;
      if (isNavigatingRef.current || videos.length < 2) return;

      if (["ArrowDown", "ArrowRight", "PageDown", " "].includes(event.key)) {
        event.preventDefault();
        wheelSamplesRef.current.push({ delta: 140, time: performance.now() });
        if (pendingIntentRef.current < MAX_PENDING_QUEUE) {
          pendingIntentRef.current++;
        }
        if (!isAnimatingRef.current) {
          processQueueRef.current();
        }
      } else if (["ArrowUp", "ArrowLeft", "PageUp"].includes(event.key)) {
        event.preventDefault();
        wheelSamplesRef.current.push({ delta: -140, time: performance.now() });
        if (pendingIntentRef.current > -MAX_PENDING_QUEUE) {
          pendingIntentRef.current--;
        }
        if (!isAnimatingRef.current) {
          processQueueRef.current();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [videos.length]);

  // Teardown GSAP tweens and timers on unmount
  useEffect(() => {
    return () => {
      isAnimatingRef.current = false;
      pendingIntentRef.current = 0;
      timelineRef.current?.kill();
      if (deltaResetTimerRef.current) clearTimeout(deltaResetTimerRef.current);
      if (failsafeTimerRef.current) clearTimeout(failsafeTimerRef.current);
      gsap.killTweensOf(cardsRef.current.filter(Boolean));
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative h-[calc(100svh-3.5rem)] min-h-[480px] w-full select-none overflow-hidden bg-[#f8f9fa] dark:bg-[#050505] transition-colors duration-300"
    >
      {/* 3D Perspective Stage Container */}
      <div
        ref={stageRef}
        className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#f8f9fa] dark:bg-[#050505] px-3 transition-colors duration-300 sm:px-6"
        style={{
          perspective: "1350px",
          perspectiveOrigin: "50% 28%",
          touchAction: videoCount < 2 ? "pan-y" : "none",
        }}
      >
        {/* Subtle Ambient Vignette */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.035)_0%,transparent_70%)] dark:bg-[radial-gradient(circle_at_center,rgba(255,60,0,0.025)_0%,transparent_70%)]" />

        {/* Top Plumb Line With Anchor Pin */}
        <div className="decor-element pointer-events-none absolute left-1/2 top-3 z-0 flex -translate-x-1/2 flex-col items-center sm:top-4">
          <div className="flex h-2.5 w-2.5 items-center justify-center rounded-full border border-neutral-400 bg-white shadow-[0_0_8px_rgba(0,0,0,0.15)] dark:border-white/40 dark:bg-black dark:shadow-[0_0_8px_rgba(255,255,255,0.4)]">
            <div className="h-1 w-1 rounded-full bg-neutral-900 dark:bg-white" />
          </div>
          <div className="h-10 w-px bg-linear-to-b from-neutral-400/50 to-neutral-400/10 dark:from-white/35 dark:to-white/10 sm:h-14" />
        </div>

        {/* Responsive Centered 3D 16:9 Cards Stack (wide 75-80% viewport desktop, capped at 1450px) */}
        <div
          className="absolute left-1/2 top-[58%] w-[90vw] -translate-x-1/2 -translate-y-1/2 sm:top-[60%] sm:w-[min(80vw,1450px)]"
          style={{ height: "min(68vh, 56.25vw, 680px)", transformStyle: "preserve-3d" }}
        >
          {videos.map((video, index) => {
            const slot = relativeSlot(index, currentIndex, videoCount);
            const visible = slot < visibleCount;
            const isFront = slot === 0;
            const date = formatCardDate(video.createdAt);
            const channelName = video.channel?.channelName || "Cinema";
            const isPlaying = visible && slot < PLAYBACK_SLOTS;

            return (
              <div
                key={video.id}
                ref={setCardRef(index)}
                data-video-card-id={video.id}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!visible || isNavigatingRef.current) return;
                  if (isFront) {
                    if (isAnimatingRef.current) return;
                    handleFrontCardClick(video);
                  } else {
                    dropNextCard();
                  }
                }}
                className={`absolute inset-0 flex flex-col overflow-hidden rounded-md border border-black/10 bg-white shadow-[0_24px_50px_-12px_rgba(0,0,0,0.12)] dark:border-white/15 dark:bg-neutral-950 dark:shadow-[0_28px_80px_-15px_rgba(0,0,0,0.95)] sm:rounded-lg ${visible
                  ? isFront
                    ? "cursor-pointer"
                    : "cursor-pointer hover:border-black/30 dark:hover:border-white/30"
                  : "pointer-events-none"
                  }`}
                style={{
                  zIndex: visible ? 50 - slot : 0,
                  transformStyle: "preserve-3d",
                  visibility: visible ? "visible" : "hidden",
                  pointerEvents: visible ? "auto" : "none",
                }}
              >
                {/* 1. Metadata Header (Upload Date | Title | Channel) */}
                <div className="z-20 flex h-8 shrink-0 items-center justify-between gap-2 border-b border-black/6 bg-white/95 px-3 text-[9px] text-neutral-900 dark:border-white/10 dark:bg-black/95 dark:text-white sm:h-9 sm:px-5 sm:text-[11px]">
                  <span className="max-w-[28%] shrink-0 truncate font-mono uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    {date}
                  </span>
                  <span className="min-w-0 flex-1 truncate px-2 text-center text-[10px] font-semibold tracking-wide text-neutral-900 dark:text-white sm:text-xs">
                    {video.title}
                  </span>
                  <span className="max-w-[30%] shrink-0 truncate text-right font-mono text-neutral-600 dark:text-neutral-300">
                    {channelName}
                  </span>
                </div>

                {/* 2. Large Widescreen Video Surface */}
                <div className="group relative min-h-0 flex-1 overflow-hidden bg-black">
                  {visible ? (
                    <CardVideoPlayer video={video} isActive={isPlaying} isFront={isFront} />
                  ) : video.thumbnailUrl ? (
                    <img
                      src={video.thumbnailUrl}
                      alt={video.title}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/15" />
                  {isFront && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-black/10 bg-white/70 shadow-2xl backdrop-blur-md dark:border-white/20 dark:bg-black/60">
                        <Play className="ml-0.5 h-5 w-5 fill-neutral-900 text-neutral-900 dark:fill-white dark:text-white" />
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
