"use client";

import React, { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Upload } from "@/types/api";
import { AppShell } from "@/components/navigation/AppShell";
import ReusableErrorBoundary from "@/components/ReusableErrorBoundary";
import { VideoCard } from "@/components/video/VideoCard";
import { VideoCardSkeleton } from "@/components/video/VideoCardSkeleton";
import { Search, AlertCircle, RefreshCw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const POPULAR_DISCOVERY_TAGS = [
  "Anime",
  "Pixel Art",
  "Nature",
  "City",
  "Cars",
  "Sci-Fi",
  "Calm",
  "Blue Ocean",
  "Dark",
];

function SearchResultsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialQuery = searchParams.get("q") || "";

  const [inputQuery, setInputQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [videos, setVideos] = useState<Upload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDiscoveryMode, setIsDiscoveryMode] = useState(!initialQuery.trim());

  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync state if URL query parameter changes externally (e.g. header search submit or navigation)
  useEffect(() => {
    const q = searchParams.get("q") || "";
    setInputQuery(q);
    setDebouncedQuery(q);
  }, [searchParams]);

  // Debounce search-as-you-type input by 300ms
  useEffect(() => {
    const handler = setTimeout(() => {
      const trimmed = inputQuery.trim().slice(0, 150);
      setDebouncedQuery(trimmed);

      // Update URL without page reload
      const newUrl = trimmed
        ? `/search?q=${encodeURIComponent(trimmed)}`
        : "/search";
      window.history.replaceState(null, "", newUrl);
    }, 300);

    return () => clearTimeout(handler);
  }, [inputQuery]);

  // Fetch search results or discovery wallpapers with AbortController cancellation
  const fetchWallpapers = useCallback(async (q: string) => {
    // Abort previous in-flight request to avoid stale responses
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);
    setIsDiscoveryMode(!q.trim());

    try {
      const res = await api.search.query(q.trim(), 1, 30, {
        signal: controller.signal,
      });

      // Guard against aborted requests
      if (!controller.signal.aborted) {
        setVideos(res.items || []);
      }
    } catch (err: any) {
      if (err.name === "CanceledError" || err.name === "AbortError") {
        return; // Ignore canceled request
      }
      setError(err.message || "Failed to fetch wallpaper discovery results.");
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchWallpapers(debouncedQuery);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [debouncedQuery, fetchWallpapers]);

  const handleClear = () => {
    setInputQuery("");
    setDebouncedQuery("");
  };

  const handleTagClick = (tag: string) => {
    setInputQuery(tag);
  };

  return (
    <div className="max-w-6xl mx-auto py-4 px-2 sm:px-4 space-y-6">
      {/* Top Search Controls & Discovery Tags */}
      <div className="space-y-3 pb-2 border-b border-border">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              {isDiscoveryMode ? (
                <>
                  <Sparkles className="w-5 h-5 text-(--brand)" />
                  Discover Wallpapers
                </>
              ) : (
                <>
                  <Search className="w-5 h-5 text-(--brand)" />
                  Results for &ldquo;{debouncedQuery}&rdquo;
                </>
              )}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isDiscoveryMode
                ? "Explore popular, high-resolution live wallpapers across moods, styles, and categories."
                : `Found ${videos.length} relevance-ranked ${videos.length === 1 ? "wallpaper" : "wallpapers"}`}
            </p>
          </div>

          {/* Inline Quick Search Input */}
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value.slice(0, 150))}
              placeholder="Search moods, colors, styles..."
              className="w-full h-8.5 pl-8.5 pr-8 rounded-full border border-black/10 dark:border-white/10 bg-neutral-100/90 dark:bg-neutral-900/70 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:border-black/25 dark:focus:border-white/25 focus:ring-1 focus:ring-black/10 dark:focus:ring-white/10 transition-all"
            />
            {inputQuery && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                title="Clear query"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Quick Discovery Tags Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
          <span className="text-[11px] font-medium text-muted-foreground shrink-0 mr-1">
            Try:
          </span>
          {POPULAR_DISCOVERY_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => handleTagClick(tag)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-all cursor-pointer whitespace-nowrap ${
                inputQuery.toLowerCase() === tag.toLowerCase()
                  ? "bg-(--brand) text-white border-(--brand) font-semibold"
                  : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border-border"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Loading Skeleton View */}
      {loading && (
        <div className="space-y-4">
          <div className="h-4 w-36 bg-muted rounded animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <VideoCardSkeleton key={i} />
            ))}
          </div>
        </div>
      )}

      {/* Error View */}
      {!loading && error && (
        <div className="flex flex-col items-center justify-center min-h-[300px] text-center p-6 border border-border bg-card/40 rounded-2xl max-w-md mx-auto my-12">
          <AlertCircle className="w-8 h-8 text-destructive mb-2" />
          <p className="text-sm font-semibold text-foreground mb-1">
            Discovery Search Failed
          </p>
          <p className="text-xs text-muted-foreground mb-4">{error}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fetchWallpapers(debouncedQuery)}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Retry
          </Button>
        </div>
      )}

      {/* No Results View */}
      {!loading && !error && videos.length === 0 && (
        <div className="flex flex-col items-center justify-center min-h-[380px] text-center p-8 border border-dashed border-border rounded-2xl max-w-lg mx-auto my-12">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3 text-muted-foreground">
            <Search className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">
            No wallpapers matched &ldquo;{debouncedQuery}&rdquo;
          </h3>
          <p className="text-xs text-muted-foreground max-w-xs mb-5">
            We searched titles, descriptions, moods, styles, environments, colors, and synonyms. Try a broader term or explore one of these categories:
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {POPULAR_DISCOVERY_TAGS.slice(0, 6).map((tag) => (
              <Button
                key={tag}
                size="sm"
                variant="outline"
                className="text-xs h-7 rounded-full"
                onClick={() => handleTagClick(tag)}
              >
                {tag}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Results Wallpaper Grid */}
      {!loading && !error && videos.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {videos.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <AppShell>
      <ReusableErrorBoundary>
        <Suspense
          fallback={
            <div className="max-w-6xl mx-auto py-6 px-4">
              <div className="h-5 w-48 bg-muted rounded animate-pulse mb-6" />
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <VideoCardSkeleton key={i} />
                ))}
              </div>
            </div>
          }
        >
          <SearchResultsContent />
        </Suspense>
      </ReusableErrorBoundary>
    </AppShell>
  );
}
