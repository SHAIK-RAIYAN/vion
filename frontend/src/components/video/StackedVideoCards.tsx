"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Upload } from "@/types/api";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { useGSAP } from "@gsap/react";
import {
  Play,
  User as UserIcon,
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

function formatCardDate(dateString: string): string {
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "October 2026";
    return d.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  } catch {
    return "October 2026";
  }
}

// Stepped upward offsets so behind cards and their previews are clearly visible (matching reference)
function getSlotY(slotIndex: number): number {
  if (slotIndex <= 0) return 0;
  if (slotIndex === 1) return -80; // 48px header + ~32px wallpaper preview exposed
  if (slotIndex === 2) return -160; // 2nd card header + ~32px wallpaper preview exposed
  if (slotIndex === 3) return -238;
  return -310;
}

function getSlotScale(slotIndex: number): number {
  if (slotIndex <= 0) return 1;
  if (slotIndex === 1) return 0.965;
  if (slotIndex === 2) return 0.93;
  if (slotIndex === 3) return 0.895;
  return 0.86;
}

function getSlotBrightness(slotIndex: number): number {
  if (slotIndex <= 0) return 1;
  if (slotIndex === 1) return 0.88;
  if (slotIndex === 2) return 0.75;
  if (slotIndex === 3) return 0.62;
  return 0.5;
}

export function StackedVideoCards({
  videos,
  activeFeed = "all",
  onLoadMore,
  hasNextPage = false,
}: StackedVideoCardsProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);
  const endOfFeedRef = useRef<HTMLDivElement>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const isAnimating = useRef(false);
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);

  // Initialize card elements ref array
  cardsRef.current = [];
  const addToCardsRef = (el: HTMLDivElement | null) => {
    if (el && !cardsRef.current.includes(el)) {
      cardsRef.current.push(el);
    }
  };

  // Set initial card transforms on mount or when videos change
  useGSAP(
    () => {
      if (videos.length === 0) return;

      cardsRef.current.forEach((cardEl, i) => {
        if (!cardEl) return;
        gsap.set(cardEl, {
          y: getSlotY(i),
          scale: getSlotScale(i),
          rotation: 0,
          filter: `brightness(${getSlotBrightness(i)})`,
          opacity: 1,
          zIndex: (videos.length - i) * 10,
          transformOrigin: "center bottom",
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

      setCurrentIndex(0);
      isAnimating.current = false;
    },
    {
      dependencies: [videos.length],
      scope: containerRef,
      revertOnUpdate: true,
    },
  );

  // Natural momentum drop: current card falls straight down, behind cards take foreground
  const dropNextCard = useCallback(() => {
    if (isAnimating.current || currentIndex >= videos.length) return;
    isAnimating.current = true;

    const reducedMotion = prefersReducedMotion();
    const activeCard = cardsRef.current[currentIndex];
    const duration = reducedMotion ? 0.2 : 0.8;

    const tl = gsap.timeline({
      onComplete: () => {
        const nextIndex = currentIndex + 1;
        setCurrentIndex(nextIndex);

        // Check pagination if nearing feed end
        if (nextIndex >= videos.length - 1 && hasNextPage && onLoadMore) {
          onLoadMore();
        }

        // Brief cooldown to avoid double firing during wheel momentum
        setTimeout(() => {
          isAnimating.current = false;
        }, 60);
      },
    });

    // 1. Current card falls down straight (no angle, constant opacity 1)
    if (activeCard) {
      tl.to(
        activeCard,
        {
          y: "125vh",
          rotation: 0,
          scale: 1,
          opacity: 1,
          duration,
          ease: "power2.inOut",
        },
        0,
      );
    }

    // 2. All subsequent cards advance forward by one slot
    for (let j = currentIndex + 1; j < videos.length; j++) {
      const nextCard = cardsRef.current[j];
      if (!nextCard) continue;
      const targetSlot = j - (currentIndex + 1);

      tl.to(
        nextCard,
        {
          y: getSlotY(targetSlot),
          scale: getSlotScale(targetSlot),
          rotation: 0,
          filter: `brightness(${getSlotBrightness(targetSlot)})`,
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
    if (isAnimating.current || currentIndex <= 0) return;
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

    // Hide End-Of-Feed screen if coming back from the end
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
          y: getSlotY(0),
          scale: getSlotScale(0),
          rotation: 0,
          filter: `brightness(${getSlotBrightness(0)})`,
          opacity: 1,
          duration,
          ease: "power2.inOut",
        },
        0,
      );
    }

    // 2. Subsequent cards push back by one slot
    for (let j = currentIndex; j < videos.length; j++) {
      const cardEl = cardsRef.current[j];
      if (!cardEl) continue;
      const targetSlot = j - prevIndex;

      tl.to(
        cardEl,
        {
          y: getSlotY(targetSlot),
          scale: getSlotScale(targetSlot),
          rotation: 0,
          filter: `brightness(${getSlotBrightness(targetSlot)})`,
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
          y: getSlotY(i),
          scale: getSlotScale(i),
          rotation: 0,
          filter: `brightness(${getSlotBrightness(i)})`,
          opacity: 1,
          duration: 0.65,
          ease: "power2.inOut",
        },
        0.03 * i,
      );
    });
  };

  // Scroll / Wheel gesture listener: after a certain scroll flick, card falls naturally
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    let accumulatedDelta = 0;
    let deltaResetTimer: NodeJS.Timeout;

    const handleWheel = (e: WheelEvent) => {
      // If end of feed reached and scrolling down, allow default page flow
      if (currentIndex >= videos.length && e.deltaY > 0) {
        return;
      }

      e.preventDefault();

      accumulatedDelta += e.deltaY;
      clearTimeout(deltaResetTimer);
      deltaResetTimer = setTimeout(() => {
        accumulatedDelta = 0;
      }, 180);

      // Trigger threshold: a decisive wheel flick of 22px triggers natural card fall
      if (accumulatedDelta > 22) {
        accumulatedDelta = 0;
        dropNextCard();
      } else if (accumulatedDelta < -22) {
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

  // Touch gesture listener (mobile / tablet swipe)
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

      // Swift swipe or drag > 35px
      if (Math.abs(deltaY) > 35 && deltaTime < 600) {
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
      className="relative w-full h-[calc(100vh-3.5rem)] bg-black select-none overflow-hidden"
    >
      {/* Sticky Stage Container */}
      <div
        ref={stageRef}
        className="w-full h-full flex flex-col items-center justify-center bg-black px-4 sm:px-6 relative overflow-hidden"
      >
        {/* Subtle Ambient Background Depth */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-[15%] left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-[#ff3c00]/4 rounded-full blur-[150px]" />
        </div>

        {/* Stack Container with balanced width and height proportions */}
        <div className="relative w-full max-w-3xl sm:max-w-4xl lg:max-w-[54rem] aspect-[16/11] sm:aspect-[16/10] max-h-[68vh] flex items-center justify-center mt-12 sm:mt-20">
          {/* =========================================================================
              LAYERED VIDEO CARDS
              ========================================================================= */}
          {videos.map((video, index) => {
            const dateText = formatCardDate(video.createdAt);
            const channelName = video.channel?.channelName || "Creator";
            const topResolution = video.videos?.[0]?.resolution || "4K";

            return (
              <div
                key={video.id}
                ref={addToCardsRef}
                onClick={() => {
                  // Clicking a visible behind card advances directly to it
                  if (index > currentIndex && !isAnimating.current) {
                    dropNextCard();
                  }
                }}
                className={`absolute inset-0 rounded-xl sm:rounded-2xl border border-white/12 bg-neutral-950 overflow-hidden shadow-[0_24px_70px_-15px_rgba(0,0,0,0.95)] will-change-transform flex flex-col ${
                  index > currentIndex ? "cursor-pointer hover:border-white/25" : ""
                }`}
              >
                {/* 1. Slim Black Metadata Header (Upload Date | Title | Channel) */}
                <div className="w-full h-11 sm:h-12 bg-black/95 backdrop-blur-md border-b border-white/8 px-4 sm:px-6 flex items-center justify-between gap-3 text-xs shrink-0 z-20">
                  {/* Top Left: Upload Date */}
                  <div className="text-[11px] sm:text-xs font-mono text-neutral-400 tracking-wider uppercase shrink-0 truncate max-w-[130px] sm:max-w-none">
                    {dateText}
                  </div>

                  {/* Top Center: Video / Wallpaper Title */}
                  <div className="font-bold text-xs sm:text-sm tracking-wide text-white text-center truncate flex-1 px-2">
                    <Link
                      href={`/watch/${video.id}`}
                      onClick={(e) => {
                        // If not the front card, don't open link; advance card instead
                        if (index !== currentIndex) {
                          e.preventDefault();
                        }
                      }}
                      className="hover:text-neutral-200 transition-colors"
                    >
                      {video.title}
                    </Link>
                  </div>

                  {/* Top Right: Channel Avatar and Channel Name (Always Shown) */}
                  <div className="flex items-center gap-2 shrink-0 truncate max-w-[160px] sm:max-w-none justify-end">
                    {video.channel?.profilePictureUrl ? (
                      <img
                        src={video.channel.profilePictureUrl}
                        alt={channelName}
                        className="w-5 h-5 rounded-full object-cover border border-white/10 shrink-0"
                      />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-neutral-800 text-white flex items-center justify-center text-[10px] font-bold uppercase shrink-0">
                        {channelName[0] || <UserIcon className="w-3 h-3" />}
                      </div>
                    )}
                    <span className="text-[11px] sm:text-xs text-neutral-200 font-medium truncate">
                      {channelName}
                    </span>
                  </div>
                </div>

                {/* 2. Large Cinematic Video Preview */}
                <Link
                  href={`/watch/${video.id}`}
                  onClick={(e) => {
                    // If not front card, clicking advances stack instead of opening video
                    if (index !== currentIndex) {
                      e.preventDefault();
                    }
                  }}
                  className="relative flex-1 w-full bg-black overflow-hidden group cursor-pointer block"
                >
                  {video.thumbnailUrl ? (
                    <img
                      src={video.thumbnailUrl}
                      alt={video.title}
                      className="w-full h-full object-cover group-hover:scale-[1.015] transition-transform duration-700 ease-out"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-radial from-neutral-900 to-black text-neutral-400">
                      <Play className="w-12 h-12 text-white/40 group-hover:text-white/80 group-hover:scale-110 transition-all" />
                      <span className="text-xs font-mono mt-2 tracking-widest uppercase opacity-60">
                        Cinematic Wallpaper
                      </span>
                    </div>
                  )}

                  {/* Cinematic Vignette Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />

                  {/* Center Play Glyph on Hover (Active card only) */}
                  {index === currentIndex && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-2xl transform scale-90 group-hover:scale-100 transition-transform">
                        <Play className="w-6 h-6 text-white fill-white ml-0.5" />
                      </div>
                    </div>
                  )}

                  {/* Bottom Metadata Badges */}
                  <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-xs text-white/90 pointer-events-none">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-[10px] font-mono font-bold tracking-wider text-white">
                        {topResolution} LIVE WALLPAPER
                      </span>
                      {video.viewCount !== undefined && (
                        <span className="px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-[10px] font-mono text-neutral-300">
                          {video.viewCount} views
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-[11px] font-medium text-white group-hover:bg-[#ff3c00] group-hover:border-[#ff3c00] transition-colors pointer-events-auto">
                      <span>Open Preview</span>
                      <ExternalLink className="w-3 h-3" />
                    </div>
                  </div>
                </Link>
              </div>
            );
          })}

          {/* =========================================================================
              END-OF-FEED DELIBERATE SCREEN
              Revealed smoothly when all cards have fallen away
              ========================================================================= */}
          <div
            ref={endOfFeedRef}
            className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 z-0"
          >
            {/* Micro Eyebrow */}
            <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-mono font-bold uppercase tracking-[0.25em] text-[#ff3c00] mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>VION WALLPAPER DISCOVERY</span>
            </div>

            {/* Signature Heading */}
            <h2 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-white uppercase mb-2">
              YOU&apos;VE REACHED THE END.
            </h2>

            {/* Supporting Line */}
            <p className="text-xs sm:text-sm text-neutral-400 max-w-md mx-auto mb-8 leading-relaxed font-light">
              You&apos;ve seen every frame for now. Stay tuned as independent creators publish new high-definition live wallpapers.
            </p>

            {/* Action Buttons: Only Rewind to Beginning */}
            <div className="flex flex-wrap items-center justify-center gap-3">
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

        {/* Subtle Scroll Hint when on card 0 */}
        {currentIndex === 0 && (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2 text-[10px] font-mono tracking-widest uppercase text-neutral-400 animate-pulse pointer-events-none">
            <span>Scroll or press</span>
            <ChevronDown className="w-3 h-3 text-[#ff3c00]" />
            <span>down to discover</span>
          </div>
        )}
      </div>
    </div>
  );
}
