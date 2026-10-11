"use client";

import React, { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import type { Upload } from "@/types/api";
import { AppShell } from "@/components/navigation/AppShell";
import ReusableErrorBoundary from "@/components/ReusableErrorBoundary";
import { VideoCard } from "@/components/video/VideoCard";
import { VideoCardSkeleton } from "@/components/video/VideoCardSkeleton";
import { Search, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

function SearchResultsContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";

  const [videos, setVideos] = useState<Upload[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchResults = useCallback(async (q: string) => {
    if (!q.trim()) {
      setVideos([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.search.query(q.trim(), 1, 30);
      setVideos(res.items || []);
    } catch (err: any) {
      setError(err.message || "Failed to fetch search results");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResults(query);
  }, [query, fetchResults]);

  if (!query.trim()) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8 border border-dashed border-border rounded-2xl max-w-md mx-auto my-12">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3 text-muted-foreground">
          <Search className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1">
          Search Vion
        </h3>
        <p className="text-xs text-muted-foreground max-w-xs">
          Use the search bar above or press Ctrl+K to find videos and channels.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto py-6 px-4 space-y-6">
        <div className="h-5 w-48 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <VideoCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] text-center p-6 border border-border bg-card/40 rounded-2xl max-w-md mx-auto my-12">
        <AlertCircle className="w-8 h-8 text-destructive mb-2" />
        <p className="text-sm font-semibold text-foreground mb-1">
          Search Failed
        </p>
        <p className="text-xs text-muted-foreground mb-4">{error}</p>
        <Button size="sm" variant="outline" onClick={() => fetchResults(query)}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          Retry
        </Button>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8 border border-dashed border-border rounded-2xl max-w-md mx-auto my-12">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3 text-muted-foreground">
          <Search className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1">
          No results for &ldquo;{query}&rdquo;
        </h3>
        <p className="text-xs text-muted-foreground max-w-xs">
          Try different keywords or check the spelling of your query.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-6">
      <div className="pb-3 border-b border-border">
        <h1 className="text-lg font-bold tracking-tight text-foreground">
          Results for &ldquo;{query}&rdquo;
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Found {videos.length} matching {videos.length === 1 ? "video" : "videos"}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {videos.map((video) => (
          <VideoCard key={video.id} video={video} />
        ))}
      </div>
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
