"use client";

import React from "react";
import Link from "next/link";
import type { Upload } from "@/types/api";
import { Badge } from "@/components/ui/badge";
import { Play, User as UserIcon } from "lucide-react";

interface VideoCardProps {
  video: Upload;
}

function formatViews(views: number): string {
  if (views >= 1_000_000) {
    return `${(views / 1_000_000).toFixed(1)}M views`;
  }
  if (views >= 1_000) {
    return `${(views / 1_000).toFixed(1)}K views`;
  }
  return `${views} views`;
}

function formatTimeAgo(dateString: string): string {
  try {
    const diffMs = Date.now() - new Date(dateString).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffDay > 30) {
      return new Date(dateString).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    }
    if (diffDay > 0) return `${diffDay}d ago`;
    if (diffHour > 0) return `${diffHour}h ago`;
    if (diffMin > 0) return `${diffMin}m ago`;
    return "just now";
  } catch {
    return "";
  }
}

export function VideoCard({ video }: VideoCardProps) {
  const topResolution = video.videos?.[0]?.resolution;

  return (
    <div className="group flex flex-col gap-2.5 rounded-xl transition-all duration-200">
      {/* Thumbnail Aspect Box */}
      <Link
        href={`/watch/${video.id}`}
        className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted/60 border border-border/40 group-hover:border-border transition-all"
      >
        {video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
            onError={(e) => {
              // Graceful fallback if URL breaks
              e.currentTarget.style.display = "none";
              if (e.currentTarget.parentElement) {
                e.currentTarget.parentElement.classList.add("fallback-bg");
              }
            }}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-card to-muted text-muted-foreground">
            <Play className="w-8 h-8 opacity-40 group-hover:opacity-80 group-hover:scale-110 transition-all text-foreground" />
            <span className="text-[11px] font-medium mt-1 tracking-wide uppercase opacity-60">
              Vion Stream
            </span>
          </div>
        )}

        {/* Resolution Badge */}
        {topResolution && (
          <div className="absolute top-2 right-2">
            <Badge variant="secondary" className="text-[10px] py-0 px-1.5 backdrop-blur-md bg-black/60 text-white border-0 font-bold">
              {topResolution}
            </Badge>
          </div>
        )}

        {/* View Count Badge on Thumbnail */}
        <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-xs text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
          {formatViews(video.viewCount)}
        </div>
      </Link>

      {/* Video Details */}
      <div className="flex gap-3 px-0.5">
        {/* Channel Profile Picture */}
        <div className="shrink-0 mt-0.5">
          {video.channel?.profilePictureUrl ? (
            <img
              src={video.channel.profilePictureUrl}
              alt={video.channel.channelName || "Channel"}
              className="w-8 h-8 rounded-full object-cover border border-border/60"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center text-xs font-bold text-muted-foreground uppercase">
              {video.channel?.channelName?.[0] || <UserIcon className="w-4 h-4" />}
            </div>
          )}
        </div>

        {/* Title, Channel Name, and Meta */}
        <div className="flex-1 min-w-0">
          <Link href={`/watch/${video.id}`}>
            <h3 className="font-semibold text-sm line-clamp-2 leading-snug text-foreground group-hover:text-primary transition-colors">
              {video.title}
            </h3>
          </Link>

          {video.channel && (
            <p className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-1 truncate">
              {video.channel.channelName}
              {video.channel.handle && (
                <span className="text-[11px] opacity-75 ml-1">
                  @{video.channel.handle}
                </span>
              )}
            </p>
          )}

          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
            <span>{formatViews(video.viewCount)}</span>
            <span>•</span>
            <span suppressHydrationWarning>{formatTimeAgo(video.createdAt)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
