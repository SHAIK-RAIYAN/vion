"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import type { Upload, PaginationMeta } from "@/types/api";
import { VideoCard } from "./VideoCard";
import { VideoCardSkeleton } from "./VideoCardSkeleton";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw, Film, Search } from "lucide-react";

interface VideoFeedProps {
  searchQuery?: string;
}

export function VideoFeed({ searchQuery = "" }: VideoFeedProps) {
  const [videos, setVideos] = useState<Upload[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVideos = useCallback(async (page = 1, append = false) => {
    if (page === 1) {
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }

    try {
      const res = await api.feed.get(page, 20);
      if (append) {

        setVideos((prev) => [...prev, ...res.items]);
      } else {
        setVideos(res.items);
      }
      setPagination(res.pagination);
    } catch (err: any) {
      setError(
        err.message ||
          "Could not load videos from backend. Ensure the backend server is running.",
      );
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchVideos(1);
  }, [fetchVideos]);

  // Client-side search filtering of fetched uploads
  const filteredVideos = useMemo(() => {
    if (!searchQuery.trim()) return videos;
    const query = searchQuery.toLowerCase().trim();
    return videos.filter(
      (v) =>
        v.title.toLowerCase().includes(query) ||
        v.description?.toLowerCase().includes(query) ||
        v.channel?.channelName.toLowerCase().includes(query) ||
        v.channel?.handle.toLowerCase().includes(query),
    );
  }, [videos, searchQuery]);

  // 1. Initial Loading State
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <VideoCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  // 2. Network / Backend Error State
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[360px] p-6 text-center border border-border/80 bg-card/40 rounded-2xl max-w-lg mx-auto my-8">
        <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mb-3">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1">
          Backend Connection Issue
        </h3>
        <p className="text-xs text-muted-foreground mb-4 max-w-sm">
          {error}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => fetchVideos(1)}
          className="gap-2 text-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry Connection
        </Button>
      </div>
    );
  }

  // 3. Search Active - Filter Stats
  return (
    <div className="space-y-4">
      {searchQuery.trim() && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/60 px-3 py-2 rounded-lg border border-border/60">
          <Search className="w-3.5 h-3.5" />
          <span>
            Filtering results for:{" "}
            <strong className="text-foreground font-semibold">
              &quot;{searchQuery}&quot;
            </strong>{" "}
            ({filteredVideos.length} found)
          </span>
        </div>
      )}

      {/* 4. Empty State (No videos exist in DB or zero search matches) */}
      {filteredVideos.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[320px] p-8 text-center border border-dashed border-border rounded-2xl max-w-md mx-auto my-8">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3 text-muted-foreground">
            <Film className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">
            {searchQuery.trim() ? "No matching videos" : "No videos uploaded yet"}
          </h3>
          <p className="text-xs text-muted-foreground max-w-xs mb-4">
            {searchQuery.trim()
              ? "Try searching for a different keyword or check your spelling."
              : "Videos published to Vion will appear here on your feed."}
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => fetchVideos(1)}
            className="text-xs gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh Feed
          </Button>
        </div>
      ) : (
        /* 5. Real Videos Grid */
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-6">
            {filteredVideos.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>

          {/* Load More Button */}
          {pagination && pagination.hasNextPage && !searchQuery.trim() && (
            <div className="flex justify-center pt-6 pb-4">
              <Button
                variant="outline"
                size="sm"
                disabled={loadingMore}
                onClick={() => fetchVideos(pagination.page + 1, true)}
                className="text-xs font-semibold px-6"
              >
                {loadingMore ? "Loading..." : "Load More Videos"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
