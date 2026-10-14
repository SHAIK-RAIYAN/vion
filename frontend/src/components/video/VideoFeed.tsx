"use client";

import { BlocksLoader } from "@/components/ui/BlocksLoader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useViewMode } from "@/context/ViewModeContext";
import { api } from "@/lib/api";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import type { PaginationMeta, Upload } from "@/types/api";
import { useGSAP } from "@gsap/react";
import {
  AlertCircle,
  RefreshCw,
  Search,
  Tv,
  User,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GalleryGrid } from "./GalleryGrid";
import { StackedVideoCards } from "./StackedVideoCards";

interface VideoFeedProps {
  searchQuery?: string;
  initialFeed?: "all" | "subscriptions";
}

export function VideoFeed({ searchQuery = "", initialFeed }: VideoFeedProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, openAuthModal } = useAuth();
  const { viewMode } = useViewMode();

  // Active feed: query param takes precedence or prop
  const activeFeed: "all" | "subscriptions" =
    initialFeed ||
    (searchParams.get("feed") === "subscriptions" ? "subscriptions" : "all");

  const [videos, setVideos] = useState<Upload[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const fetchVideos = useCallback(
    async (page = 1, append = false, bypassCache = false) => {
      if (page === 1) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }

      try {
        const res = await api.feed.get(page, 20, {
          feed: activeFeed,
          bypassCache,
        });

        if (append) {
          setVideos((prev) => [...prev, ...res.items]);
        } else {
          setVideos(res.items);
        }
        setPagination(res.pagination);
      } catch (err: unknown) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not load wallpapers. Ensure the backend server is running.",
        );
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [activeFeed],
  );

  // Fetch whenever active feed changes
  useEffect(() => {
    fetchVideos(1);
  }, [fetchVideos]);

  // Client-side search filtering
  const filteredVideos = useMemo(() => {
    if (!searchQuery.trim()) return videos;
    const query = searchQuery.toLowerCase().trim();
    return videos.filter(
      (v) =>
        v.title.toLowerCase().includes(query) ||
        v.description?.toLowerCase().includes(query) ||
        v.channel?.channelName?.toLowerCase().includes(query) ||
        v.channel?.handle?.toLowerCase().includes(query),
    );
  }, [videos, searchQuery]);

  // View mode transition animation (fluid morphing motion between stack and grid)
  useGSAP(
    () => {
      if (!containerRef.current || prefersReducedMotion()) return;
      const isGrid = viewMode === "grid";

      gsap.fromTo(
        containerRef.current,
        {
          opacity: 0.15,
          scale: isGrid ? 0.95 : 1.04,
          y: isGrid ? 25 : -20,
        },
        {
          opacity: 1,
          scale: 1,
          y: 0,
          duration: 0.48,
          ease: "power3.out",
          clearProps: "transform,opacity",
        },
      );
    },
    {
      dependencies: [viewMode],
      scope: containerRef,
    },
  );

  // 1. Unauthenticated Subscriptions Feed State
  if (activeFeed === "subscriptions" && !user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-125 text-center p-8 max-w-md mx-auto my-12 border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-950 rounded-3xl shadow-2xl">
        <div className="w-14 h-14 rounded-full bg-[#ff3c00]/10 text-[#ff3c00] flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(255,60,0,0.15)]">
          <Tv className="w-7 h-7" />
        </div>
        <h3 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white mb-2">
          Your Subscribed Creators
        </h3>
        <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed mb-6">
          Sign in to access live wallpapers and exclusive video previews from creators you follow.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <Button
            size="sm"
            onClick={() => openAuthModal("signin")}
            className="flex-1 rounded-full text-xs font-semibold h-9 bg-neutral-900 dark:bg-white text-white dark:text-black hover:bg-neutral-800 dark:hover:bg-neutral-200"
          >
            <User className="w-3.5 h-3.5 mr-1.5" />
            Sign In to Vion
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push("/")}
            className="flex-1 rounded-full text-xs font-semibold h-9 border-black/10 dark:border-white/10 text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
          >
            Discover All
          </Button>
        </div>
      </div>
    );
  }

  // 2. Loading State: Minimalist Cinematic Skeleton
  if (loading) {
    return (
      <div className="w-full flex flex-col items-center justify-center min-h-[60vh] p-8">
        <div className="relative w-full max-w-[580px] sm:max-w-[640px] md:max-w-[700px] lg:max-w-[740px] aspect-[4/3] max-h-[54vh] sm:max-h-[58vh] md:max-h-[60vh] rounded-xl sm:rounded-2xl border border-black/10 dark:border-white/8 bg-white/70 dark:bg-neutral-950/60 overflow-hidden flex flex-col items-center justify-center mt-6 sm:mt-8 shadow-2xl backdrop-blur-md">
          <div className="w-full h-11 sm:h-12 bg-neutral-100/80 dark:bg-black/60 border-b border-black/5 dark:border-white/5 px-6 flex items-center justify-between animate-pulse">
            <div className="w-24 h-3 rounded bg-neutral-300 dark:bg-white/10" />
            <div className="w-48 h-3 rounded bg-neutral-300 dark:bg-white/10" />
            <div className="w-20 h-3 rounded bg-neutral-300 dark:bg-white/10" />
          </div>
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="mb-4">
              <BlocksLoader color="#FF3C00" />
            </div>
            <p className="text-xs font-mono tracking-widest uppercase text-neutral-500 dark:text-neutral-400">
              Curating Wallpapers...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 3. Error State
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[380px] p-8 text-center border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-950 rounded-3xl max-w-lg mx-auto my-12 shadow-2xl">
        <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-neutral-900 dark:text-white mb-1">
          Feed Unavailable
        </h3>
        <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-6 max-w-sm leading-relaxed">
          {error}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => fetchVideos(1, false, true)}
          className="rounded-full text-xs font-semibold px-5 h-8.5 border-black/10 dark:border-white/10 text-neutral-900 dark:text-white hover:bg-black/5 dark:hover:bg-white/5 gap-2"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry Connection
        </Button>
      </div>
    );
  }

  // 4. Empty State
  if (filteredVideos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[420px] p-8 text-center border border-dashed border-black/10 dark:border-white/10 bg-white/60 dark:bg-neutral-950/40 rounded-3xl max-w-md mx-auto my-12">
        <div className="w-14 h-14 rounded-full bg-black/5 dark:bg-white/5 text-neutral-500 dark:text-neutral-400 flex items-center justify-center mb-4">
          {activeFeed === "subscriptions" ? (
            <Tv className="w-7 h-7 text-[#ff3c00]" />
          ) : (
            <Search className="w-7 h-7" />
          )}
        </div>

        <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-1.5">
          {searchQuery.trim()
            ? "No Matching Wallpapers"
            : activeFeed === "subscriptions"
              ? "No Subscriptions Yet"
              : "No Wallpapers Published"}
        </h3>

        <p className="text-xs text-neutral-600 dark:text-neutral-400 max-w-xs mb-6 leading-relaxed">
          {searchQuery.trim()
            ? `No wallpapers found matching "${searchQuery}". Try a different keyword.`
            : activeFeed === "subscriptions"
              ? "You haven't followed any creators yet. Explore the discover gallery to find inspiring creators."
              : "Independent wallpapers will appear here once published."}
        </p>

        {activeFeed === "subscriptions" ? (
          <Button
            size="sm"
            onClick={() => router.push("/")}
            className="rounded-full text-xs font-semibold px-5 h-9 bg-neutral-900 dark:bg-white text-white dark:text-black hover:bg-neutral-800 dark:hover:bg-neutral-200"
          >
            Explore Discover Gallery
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => fetchVideos(1, false, true)}
            className="rounded-full text-xs font-semibold px-5 h-9 border-black/10 dark:border-white/10 text-neutral-900 dark:text-white hover:bg-black/5 dark:hover:bg-white/5 gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh Gallery
          </Button>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full">
      {/* Search Filter Header pill if search active */}
      {searchQuery.trim() && (
        <div className="flex items-center justify-between mb-4 px-4 py-2 rounded-xl bg-neutral-900/60 border border-white/8 text-xs text-neutral-300">
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-[#ff3c00]" />
            <span>
              Searching for:{" "}
              <strong className="text-white font-semibold">
                &quot;{searchQuery}&quot;
              </strong>
            </span>
          </div>
          <span className="font-mono text-[11px] text-neutral-400">
            {filteredVideos.length} result{filteredVideos.length === 1 ? "" : "s"}
          </span>
        </div>
      )}

      {/* Render Selected View Mode */}
      {viewMode === "stacked" ? (
        <StackedVideoCards
          videos={filteredVideos}
          activeFeed={activeFeed}
          hasNextPage={pagination?.hasNextPage}
          onLoadMore={() =>
            pagination?.page && fetchVideos(pagination.page + 1, true)
          }
        />
      ) : (
        <GalleryGrid
          videos={filteredVideos}
          hasNextPage={pagination?.hasNextPage}
          loadingMore={loadingMore}
          onLoadMore={() =>
            pagination?.page && fetchVideos(pagination.page + 1, true)
          }
        />
      )}
    </div>
  );
}
