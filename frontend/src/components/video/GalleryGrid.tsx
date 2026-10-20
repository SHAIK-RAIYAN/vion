"use client";

import React, { useRef } from "react";
import type { Upload } from "@/types/api";
import { useGSAP } from "@gsap/react";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { Play, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useViewMode } from "@/context/ViewModeContext";
import { useCurtainTransition } from "@/components/transitions/CurtainTransitionContext";
import { animateCardToWatchPage } from "@/lib/heroTransition";
import { useRouter } from "next/navigation";

interface GalleryGridProps {
  videos: Upload[];
  hasNextPage?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}

function formatCardDate(dateString: string): string {
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "October 2026";
    return d.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
  } catch {
    return "October 2026";
  }
}

export function GalleryGrid({
  videos,
  hasNextPage = false,
  loadingMore = false,
  onLoadMore,
}: GalleryGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { skipNextTransition } = useCurtainTransition();
  const { getCardSnapshot, clearSnapshot } = useViewMode();

  useGSAP(
    () => {
      if (!gridRef.current || videos.length === 0) return;
      if (prefersReducedMotion()) {
        return;
      }

      const cards = gridRef.current.querySelectorAll<HTMLElement>(".gallery-card");
      const snapshot = getCardSnapshot();
      const hasSnapshots = Boolean(snapshot && snapshot.size > 0);

      if (hasSnapshots && snapshot) {
        // FLIP Animation: Animate each card from its stack position and large size into its grid cell!
        const unmatchedCards: HTMLElement[] = [];

        cards.forEach((cardEl, index) => {
          const rawId = cardEl.getAttribute("data-video-card-id");
          const baseId = rawId?.replace(/-rep-\d+$/, "");
          const firstRect = rawId ? snapshot.get(rawId) || (baseId ? snapshot.get(baseId) : undefined) : undefined;

          if (firstRect) {
            const lastRect = cardEl.getBoundingClientRect();
            const firstCenterX = firstRect.left + firstRect.width / 2;
            const firstCenterY = firstRect.top + firstRect.height / 2;
            const lastCenterX = lastRect.left + lastRect.width / 2;
            const lastCenterY = lastRect.top + lastRect.height / 2;
            const dx = firstCenterX - lastCenterX;
            const dy = firstCenterY - lastCenterY;
            const scaleMultiplier = firstRect.width / Math.max(1, lastRect.width);

            gsap.set(cardEl, {
              zIndex: Math.max(1, 40 - index),
              position: "relative",
              willChange: "transform, opacity",
            });

            gsap.fromTo(
              cardEl,
              {
                x: dx,
                y: dy,
                scale: scaleMultiplier,
                transformOrigin: "center center",
                opacity: 1,
              },
              {
                x: 0,
                y: 0,
                scale: 1,
                duration: 0.82,
                ease: "cubic",
                clearProps: "transform,zIndex,position,willChange",
              },
            );
          } else {
            unmatchedCards.push(cardEl);
          }
        });

        if (unmatchedCards.length > 0) {
          gsap.fromTo(
            unmatchedCards,
            { opacity: 0, scale: 0.88, y: 30 },
            {
              opacity: 1,
              scale: 1,
              y: 0,
              duration: 0.65,
              stagger: 0.04,
              ease: "cubic",
              clearProps: "all",
            },
          );
        }

        gsap.delayedCall(0.8, clearSnapshot);
      } else {
        // Default initial entrance when opening grid directly
        gsap.fromTo(
          cards,
          {
            opacity: 0,
            scale: 0.9,
            y: 35,
            filter: "blur(4px)",
          },
          {
            opacity: 1,
            scale: 1,
            y: 0,
            filter: "blur(0px)",
            stagger: {
              amount: 0.3,
              from: "center",
            },
            duration: 0.55,
            ease: "power2.out",
            clearProps: "all",
          },
        );
      }
    },
    {
      dependencies: [videos.length],
      scope: gridRef,
    },
  );

  return (
    <div
      ref={gridRef}
      className="w-full space-y-8 select-none px-3 py-2 sm:px-5 lg:px-8">
      {/* Responsive Gallery Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {videos.map((video) => {
          const dateText = formatCardDate(video.createdAt);
          const channelName = video.channel?.channelName || "Creator";
          const topResolution = video.videos?.[0]?.resolution || "4K";

          return (
            <div
              key={video.id}
              data-video-card-id={video.id}
              className="gallery-card group flex h-full min-w-0 w-full flex-col rounded-2xl border border-black/10 bg-white shadow-md transition-colors duration-200 hover:border-black/20 hover:shadow-2xl dark:border-white/10 dark:bg-neutral-950 dark:hover:border-white/25">
              {/* Slim Metadata Header Bar */}
              <div className="h-10 bg-neutral-100/90 dark:bg-black/90 border-b border-black/5 dark:border-white/8 px-3.5 flex items-center justify-between text-xs text-neutral-900 dark:text-white shrink-0 gap-2">
                <span className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400 tracking-wider uppercase shrink-0">
                  {dateText}
                </span>

                <button
                  type="button"
                  onClick={(e) => {
                    const card = e.currentTarget.closest<HTMLElement>(".gallery-card");
                    if (card) {
                      animateCardToWatchPage({
                        cardElement: card,
                        video,
                        router,
                        skipCurtainTransition: skipNextTransition,
                      });
                    } else {
                      router.push(`/watch/${video.id}`);
                    }
                  }}
                  className="font-bold text-xs tracking-wide text-neutral-900 dark:text-white truncate text-center flex-1 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors cursor-pointer"
                  title={video.title}>
                  {video.title}
                </button>

                <div className="flex items-center gap-1.5 shrink-0 max-w-[140px] sm:max-w-xs justify-end">
                  {video.channel?.profilePictureUrl ? (
                    <img
                      src={video.channel.profilePictureUrl}
                      alt={channelName}
                      className="w-4.5 h-4.5 rounded-full object-cover border border-black/10 dark:border-white/10 shrink-0"
                    />
                  ) : (
                    <div className="w-4.5 h-4.5 rounded-full bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-white flex items-center justify-center text-[9px] font-bold uppercase shrink-0">
                      {channelName[0] || <UserIcon className="w-2.5 h-2.5" />}
                    </div>
                  )}
                  <span className="text-[11px] text-neutral-700 dark:text-neutral-300 font-medium truncate">
                    {channelName}
                  </span>
                </div>
              </div>

              {/* Cinematic Thumbnail Preview */}
              <div
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  const card = e.currentTarget.closest<HTMLElement>(".gallery-card");
                  if (card) {
                    animateCardToWatchPage({
                      cardElement: card,
                      video,
                      router,
                      skipCurtainTransition: skipNextTransition,
                    });
                  } else {
                    router.push(`/watch/${video.id}`);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/watch/${video.id}`);
                  }
                }}
                className="relative aspect-video w-full bg-black overflow-hidden group/media cursor-pointer block">
                {video.thumbnailUrl ? (
                  <img
                    src={video.thumbnailUrl}
                    alt={video.title}
                    className="w-full h-full object-cover group-hover/media:scale-105 transition-transform duration-500 ease-out"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-radial from-neutral-900 to-black text-neutral-500">
                    <Play className="w-8 h-8 opacity-40 group-hover/media:opacity-80 transition-opacity" />
                    <span className="text-[10px] font-mono tracking-widest uppercase mt-1 opacity-60">
                      Live Wallpaper
                    </span>
                  </div>
                )}

                {/* Subtle Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20 pointer-events-none" />

                {/* Play Button Overlay */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/media:opacity-100 transition-opacity duration-300">
                  <div className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-xl scale-90 group-hover/media:scale-100 transition-transform">
                    <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                  </div>
                </div>

                {/* Badges on preview */}
                <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
                  <span className="px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-xs text-[9px] font-mono font-bold text-white border border-white/10">
                    {topResolution}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-xs text-[9px] font-mono text-neutral-300">
                    {video.viewCount} views
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination Load More */}
      {hasNextPage && (
        <div className="flex justify-center pt-6 pb-8">
          <Button
            variant="outline"
            size="sm"
            disabled={loadingMore}
            onClick={onLoadMore}
            className="rounded-full text-xs font-semibold px-6 border-black/10 dark:border-white/10 bg-neutral-100 dark:bg-neutral-900 text-neutral-900 dark:text-white hover:bg-neutral-200 dark:hover:bg-neutral-800">
            {loadingMore ? "Loading..." : "Load More Wallpapers"}
          </Button>
        </div>
      )}
    </div>
  );
}
