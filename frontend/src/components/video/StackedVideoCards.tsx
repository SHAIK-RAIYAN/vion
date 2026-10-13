"use client";

import React, { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Upload } from "@/types/api";
import { gsap, ScrollTrigger, prefersReducedMotion } from "@/lib/gsap";
import { useGSAP } from "@gsap/react";
import {
  Play,
  User as UserIcon,
  RotateCcw,
  Sparkles,
  ExternalLink,
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

function getSlotY(slotIndex: number): number {
  if (slotIndex <= 0) return 0;
  if (slotIndex === 1) return -44;
  if (slotIndex === 2) return -86;
  if (slotIndex === 3) return -126;
  return -160;
}

function getSlotScale(slotIndex: number): number {
  if (slotIndex <= 0) return 1;
  if (slotIndex === 1) return 0.96;
  if (slotIndex === 2) return 0.92;
  if (slotIndex === 3) return 0.88;
  return 0.84;
}

function getSlotBrightness(slotIndex: number): number {
  if (slotIndex <= 0) return 1;
  if (slotIndex === 1) return 0.72;
  if (slotIndex === 2) return 0.52;
  if (slotIndex === 3) return 0.36;
  return 0.22;
}

// Flat alignment with zero tilt angles
function getSlotRotation(): number {
  return 0;
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

  const [, setActiveIndex] = useState(0);

  // Initialize card elements ref array
  cardsRef.current = [];
  const addToCardsRef = (el: HTMLDivElement | null) => {
    if (el && !cardsRef.current.includes(el)) {
      cardsRef.current.push(el);
    }
  };

  // Keyboard navigation for jumping between cards
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      const scrollStep = window.innerHeight * 0.95;
      if (e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        window.scrollBy({ top: scrollStep, behavior: "smooth" });
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        window.scrollBy({ top: -scrollStep, behavior: "smooth" });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // GSAP ScrollTrigger falling card sequence
  useGSAP(
    () => {
      if (!containerRef.current || !stageRef.current || videos.length === 0) return;

      const reducedMotion = prefersReducedMotion();

      // Set initial positions for all cards without rotation angles
      cardsRef.current.forEach((cardEl, i) => {
        if (!cardEl) return;
        gsap.set(cardEl, {
          y: getSlotY(i),
          scale: getSlotScale(i),
          rotation: 0,
          filter: `brightness(${getSlotBrightness(i)})`,
          opacity: 1,
          zIndex: (videos.length - i) * 10,
          transformOrigin: "center center",
          force3D: true,
        });
      });

      // If reduced motion is preferred, provide simple direct state
      if (reducedMotion) {
        gsap.set(endOfFeedRef.current, { autoAlpha: 1 });
        return;
      }

      // Initial hide for end-of-feed message
      if (endOfFeedRef.current) {
        gsap.set(endOfFeedRef.current, { autoAlpha: 0, scale: 0.95, y: 20 });
      }

      const totalSteps = videos.length;
      const scrollDistance = totalSteps * window.innerHeight * 0.9;

      const mainTl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top top",
          end: `+=${scrollDistance}`,
          pin: stageRef.current,
          scrub: 0.6,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            const rawProgress = self.progress * totalSteps;
            const currentCard = Math.min(
              totalSteps - 1,
              Math.floor(rawProgress),
            );
            setActiveIndex(currentCard);

            // Pagination trigger when nearing end of feed
            if (self.progress > 0.85 && hasNextPage && onLoadMore) {
              onLoadMore();
            }
          },
        },
      });

      // Choreograph each card's exit straight down with NO angle rotation and NO opacity fade
      for (let i = 0; i < totalSteps; i++) {
        const activeCard = cardsRef.current[i];
        if (!activeCard) continue;

        const timeSlot = i;

        // 1. Current active card falls straight down (y translation only, rotation: 0, opacity: 1)
        mainTl.to(
          activeCard,
          {
            y: "115vh",
            rotation: 0,
            scale: 1,
            // Preserving full opacity without fading
            ease: "power1.inOut",
            duration: 1,
          },
          timeSlot,
        );

        // 2. Subsequent cards advance straight forward into the foreground slot
        for (let j = i + 1; j < totalSteps; j++) {
          const subsequentCard = cardsRef.current[j];
          if (!subsequentCard) continue;

          const targetSlot = j - (i + 1);

          mainTl.to(
            subsequentCard,
            {
              y: getSlotY(targetSlot),
              scale: getSlotScale(targetSlot),
              rotation: 0,
              filter: `brightness(${getSlotBrightness(targetSlot)})`,
              ease: "power1.inOut",
              duration: 1,
            },
            timeSlot,
          );
        }
      }

      // 3. Reveal Deliberate End-Of-Feed Screen when all cards have fallen
      if (endOfFeedRef.current) {
        mainTl.to(
          endOfFeedRef.current,
          {
            autoAlpha: 1,
            scale: 1,
            y: 0,
            duration: 0.8,
            ease: "power2.out",
          },
          totalSteps - 0.4,
        );
      }

      // Refresh ScrollTrigger to ensure pin dimensions sync accurately
      ScrollTrigger.refresh();
    },
    {
      dependencies: [videos.length, hasNextPage],
      scope: containerRef,
      revertOnUpdate: true,
    },
  );

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-black select-none"
      style={{
        height: `${Math.max(2, videos.length + 1) * 90}vh`,
      }}
    >
      {/* Sticky Stage pinned across scroll */}
      <div
        ref={stageRef}
        className="sticky top-0 w-full h-screen overflow-hidden flex flex-col items-center justify-center bg-black px-4 sm:px-6"
      >
        {/* Subtle Ambient Background Glow */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-[20%] left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[#ff3c00]/5 rounded-full blur-[140px]" />
          <div className="absolute -bottom-[20%] left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-white/[0.02] rounded-full blur-[160px]" />
        </div>

        {/* Stack Container */}
        <div className="relative w-full max-w-5xl lg:max-w-6xl aspect-[16/10] sm:aspect-[16/9.5] max-h-[72vh] flex items-center justify-center">
          {/* =========================================================================
              LAYERED VIDEO CARDS
              ========================================================================= */}
          {videos.map((video) => {
            const dateText = formatCardDate(video.createdAt);
            const channelName = video.channel?.channelName || "Creator";
            const topResolution = video.videos?.[0]?.resolution || "4K";

            return (
              <div
                key={video.id}
                ref={addToCardsRef}
                className="absolute inset-0 rounded-2xl sm:rounded-3xl border border-white/10 bg-neutral-950 overflow-hidden shadow-[0_24px_70px_-15px_rgba(0,0,0,0.95)] will-change-transform flex flex-col"
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
                  className="relative flex-1 w-full bg-black overflow-hidden group cursor-pointer block"
                >
                  {video.thumbnailUrl ? (
                    <img
                      src={video.thumbnailUrl}
                      alt={video.title}
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-700 ease-out"
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

                  {/* Center Play Glyph on Hover */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-2xl transform scale-90 group-hover:scale-100 transition-transform">
                      <Play className="w-6 h-6 text-white fill-white ml-0.5" />
                    </div>
                  </div>

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

            {/* Action Buttons: Only Rewind to Beginning (+ Explore All if subscriptions) */}
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={scrollToTop}
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
                  className="rounded-full text-xs text-neutral-400 hover:text-white px-4 h-9"
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
