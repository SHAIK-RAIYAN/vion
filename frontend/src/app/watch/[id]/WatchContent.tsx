"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Upload } from "@/types/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Play,
  UserCheck,
  UserPlus,
  Eye,
  Calendar,
  Lock,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/navigation/AppShell";
import ReusableErrorBoundary from "@/components/ReusableErrorBoundary";

export function WatchContent({ id }: { id: string }) {
  const [video, setVideo] = useState<Upload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; statusCode: number } | null>(
    null,
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const { user, openAuthModal } = useAuth();

  useEffect(() => {
    async function loadVideo() {
      setLoading(true);
      setError(null);
      try {
        const res = await api.videos.getById(id);
        setVideo(res.data);


        if (res.data.channel?.id && user) {
          try {
            const subRes = await api.subscriptions.getStatus(res.data.channel.id);
            setIsSubscribed(subRes.data.isSubscribed);
          } catch {
            // Ignore status check failure
          }
        }
      } catch (err: any) {
        setError({
          message: err.message || "Failed to load video",
          statusCode: err.statusCode || 500,
        });
      } finally {
        setLoading(false);
      }
    }
    loadVideo();
  }, [id, user]);

  const handleToggleSub = async () => {
    if (!user) {
      openAuthModal("signin");
      return;
    }
    if (!video?.channel?.id) return;

    try {
      const res = await api.subscriptions.toggle(video.channel.id);
      setIsSubscribed(res.data.isSubscribed);
      toast.success(
        res.data.isSubscribed
          ? `Subscribed to ${video.channel.channelName}`
          : `Unsubscribed from ${video.channel.channelName}`,
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to update subscription");
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="max-w-5xl mx-auto py-6 px-4 space-y-4 animate-pulse">
          <div className="aspect-video w-full rounded-2xl bg-muted" />
          <div className="h-6 bg-muted rounded w-3/4" />
          <div className="h-4 bg-muted rounded w-1/3" />
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <div className="max-w-md mx-auto my-16 text-center p-8 border border-border bg-card rounded-2xl shadow-sm">
          {error.statusCode === 403 ? (
            <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto mb-3">
              <Lock className="w-6 h-6" />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
          )}
          <h3 className="text-base font-bold text-foreground mb-1">
            {error.statusCode === 403
              ? "Private Video"
              : error.statusCode === 404
              ? "Video Not Found"
              : "Error Loading Video"}
          </h3>
          <p className="text-xs text-muted-foreground mb-6">{error.message}</p>
          <Link href="/">
            <Button variant="secondary" size="sm" className="gap-2 text-xs">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Feed
            </Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  if (!video) return null;

  return (
    <AppShell>
      <ReusableErrorBoundary>
        <div className="max-w-5xl mx-auto py-4 px-4 space-y-5">
          <div className="mb-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Feed
            </Link>
          </div>

          {/* Video Player Display Container */}
          <div className="relative aspect-video w-full rounded-2xl bg-black overflow-hidden shadow-2xl border border-border/40 flex items-center justify-center">
            {video.hlsManifestUrl ? (
              <div className="text-center p-6 space-y-2">
                <Play className="w-12 h-12 text-white/80 mx-auto" />
                <p className="text-sm font-semibold text-white">Stream Manifest Configured</p>
                <p className="text-xs text-white/60 font-mono max-w-md truncate">
                  {video.hlsManifestUrl}
                </p>
              </div>
            ) : (
              <div className="text-center p-6 space-y-2 text-white/70">
                <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-2">
                  <Play className="w-7 h-7 text-white" />
                </div>
                <p className="text-sm font-semibold text-white">Vion Stream Container</p>
                <p className="text-xs text-white/60 max-w-sm mx-auto">
                  Video media transcoding and HLS streaming pipeline ready for video engineering integration.
                </p>
              </div>
            )}

            {/* Visibility Badge */}
            <div className="absolute top-3 right-3 flex items-center gap-2">
              {video.visibility !== "PUBLIC" && (
                <Badge variant="secondary" className="bg-black/70 text-white border-0 text-[10px]">
                  {video.visibility}
                </Badge>
              )}
              {video.videos?.[0]?.resolution && (
                <Badge variant="brand" className="text-[10px] font-bold">
                  {video.videos[0].resolution}
                </Badge>
              )}
            </div>
          </div>

          {/* Title & Metadata */}
          <div className="space-y-3">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {video.title}
            </h1>

            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-border">
              {/* Channel Info */}
              {video.channel && (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-secondary border border-border flex items-center justify-center font-bold text-sm uppercase text-foreground">
                    {video.channel.profilePictureUrl ? (
                      <img
                        src={video.channel.profilePictureUrl}
                        alt={video.channel.channelName}
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      video.channel.channelName[0]
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-foreground">
                      {video.channel.channelName}
                    </p>
                    {video.channel.handle && (
                      <p className="text-xs text-muted-foreground">
                        @{video.channel.handle}
                      </p>
                    )}
                  </div>

                  <Button
                    size="sm"
                    variant={isSubscribed ? "outline" : "brand"}
                    onClick={handleToggleSub}
                    className="ml-3 text-xs font-semibold rounded-full px-4"
                  >
                    {isSubscribed ? (
                      <>
                        <UserCheck className="w-3.5 h-3.5 mr-1" />
                        Subscribed
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-3.5 h-3.5 mr-1" />
                        Subscribe
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Views & Date metrics */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" />
                  {video.viewCount} views
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {new Date(video.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Video Description */}
            {video.description && (
              <div className="p-4 rounded-xl bg-card border border-border text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                {video.description}
              </div>
            )}
          </div>
        </div>
      </ReusableErrorBoundary>
    </AppShell>
  );
}
