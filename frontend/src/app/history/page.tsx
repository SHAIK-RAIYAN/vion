"use client";

import React, { useEffect, useState, useCallback } from "react";
import { CurtainLink } from "@/components/transitions";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import type { WatchHistoryItem } from "@/types/api";
import { AppShell } from "@/components/navigation/AppShell";
import ReusableErrorBoundary from "@/components/ReusableErrorBoundary";
import { Button } from "@/components/ui/button";
import {
  History,
  Trash2,
  RefreshCw,
  Play,
  Calendar,
  AlertCircle,
  Eye,
} from "lucide-react";
import { toast } from "sonner";

function HistoryContent() {
  const { user, openAuthModal } = useAuth();
  const [historyItems, setHistoryItems] = useState<WatchHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.history.get(1, 50);
      const items = res.items || (res as any)?.data?.items || [];
      setHistoryItems(items);
    } catch (err: any) {
      setError(err.message || "Failed to load watch history");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleRemoveItem = async (videoId: string, title?: string) => {
    try {
      await api.history.remove(videoId);
      setHistoryItems((prev) => prev.filter((item) => item.uploadId !== videoId));
      toast.success(title ? `Removed "${title}" from history` : "Removed from history");
    } catch (err: any) {
      toast.error(err.message || "Failed to remove video from history");
    }
  };

  const handleClearAll = async () => {
    if (!confirm("Are you sure you want to clear your entire watch history?")) {
      return;
    }

    setClearing(true);
    try {
      await api.history.clear();
      setHistoryItems([]);
      toast.success("Watch history cleared");
    } catch (err: any) {
      toast.error(err.message || "Failed to clear watch history");
    } finally {
      setClearing(false);
    }
  };

  // 1. Unauthenticated state
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-6 border border-dashed border-border rounded-2xl max-w-md mx-auto my-12">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3 text-muted-foreground">
          <History className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1">
          Keep track of what you watch
        </h3>
        <p className="text-xs text-muted-foreground max-w-xs mb-4">
          Watch history isn&apos;t saved when you&apos;re signed out. Sign in to see your history.
        </p>
        <Button
          size="sm"
          variant="brand"
          onClick={() => openAuthModal("signin")}
          className="text-xs font-semibold px-5"
        >
          Sign In
        </Button>
      </div>
    );
  }

  // 2. Loading state
  if (loading) {
    return (
      <div className="space-y-4 max-w-4xl mx-auto py-6">
        <div className="h-6 w-48 bg-muted rounded animate-pulse" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex gap-4 p-3 rounded-xl border border-border bg-card animate-pulse"
            >
              <div className="w-40 aspect-video rounded-lg bg-muted shrink-0" />
              <div className="space-y-2 flex-1 py-1">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/3" />
                <div className="h-3 bg-muted rounded w-1/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 3. Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] text-center p-6 border border-border bg-card/40 rounded-2xl max-w-md mx-auto my-12">
        <AlertCircle className="w-8 h-8 text-destructive mb-2" />
        <p className="text-sm font-semibold text-foreground mb-1">
          Error Loading Watch History
        </p>
        <p className="text-xs text-muted-foreground mb-4">{error}</p>
        <Button size="sm" variant="outline" onClick={fetchHistory}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          Retry
        </Button>
      </div>
    );
  }

  // 4. Empty state
  if (historyItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8 border border-dashed border-border rounded-2xl max-w-md mx-auto my-12">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3 text-muted-foreground">
          <History className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1">
          Your watch history is empty
        </h3>
        <p className="text-xs text-muted-foreground max-w-xs mb-4">
          Videos you watch on Vion will automatically appear here.
        </p>
        <CurtainLink href="/">
          <Button size="sm" variant="secondary" className="text-xs font-semibold">
            Explore Videos
          </Button>
        </CurtainLink>
      </div>
    );
  }

  // 5. Watch History Items
  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <History className="w-5 h-5 text-(--brand)" />
            <span>Watch History</span>
          </h1>
          <p className="text-xs text-muted-foreground">
            {historyItems.length} {historyItems.length === 1 ? "video" : "videos"} saved
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={fetchHistory}
            className="text-xs gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>

          <Button
            size="sm"
            variant="outline"
            disabled={clearing}
            onClick={handleClearAll}
            className="text-xs text-destructive border-destructive/20 hover:bg-destructive/10 gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear All History
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {historyItems.map((item) => {
          const video = item.upload;
          if (!video) return null;

          return (
            <div
              key={item.id}
              className="flex flex-col sm:flex-row gap-4 p-3 rounded-2xl border border-border bg-card shadow-2xs hover:border-border/80 transition-all group"
            >
              {/* Thumbnail with Link */}
              <CurtainLink
                href={`/watch/${item.uploadId}`}
                className="relative w-full sm:w-48 aspect-video rounded-xl bg-black overflow-hidden shrink-0 block"
              >
                {video.thumbnailUrl ? (
                  <img
                    src={video.thumbnailUrl}
                    alt={video.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-secondary text-muted-foreground">
                    <Play className="w-8 h-8 opacity-40" />
                  </div>
                )}

                {/* Watched Progress Stamp */}
                {item.progressTimeStamp > 0 && (
                  <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-sm bg-black/80 text-[10px] font-mono text-white">
                    {Math.floor(item.progressTimeStamp / 60)}:
                    {(item.progressTimeStamp % 60).toString().padStart(2, "0")}
                  </div>
                )}
              </CurtainLink>

              {/* Video Info */}
              <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                <div>
                  <CurtainLink
                    href={`/watch/${item.uploadId}`}
                    className="font-semibold text-sm text-foreground hover:text-[var(--brand)] transition-colors line-clamp-2"
                  >
                    {video.title}
                  </CurtainLink>

                  {/* Channel Info */}
                  {video.channel && (
                    <CurtainLink
                      href={`/channel/${video.channel.id}`}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors block mt-1"
                    >
                      {video.channel.channelName}
                    </CurtainLink>
                  )}

                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-2">
                    <span className="flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      {video.viewCount} views
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Watched {new Date(item.watchedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Remove from history action button */}
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(item.uploadId, video.title)}
                    title="Remove from history"
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function HistoryPage() {
  return (
    <AppShell>
      <ReusableErrorBoundary>
        <HistoryContent />
      </ReusableErrorBoundary>
    </AppShell>
  );
}
