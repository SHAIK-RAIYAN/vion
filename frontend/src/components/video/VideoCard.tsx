"use client";

import { CurtainLink } from "@/components/transitions";
import type { Upload } from "@/types/api";
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

export function VideoCard({ video }: VideoCardProps) {
  const topResolution = video.videos?.[0]?.resolution || "4K";
  const dateText = formatCardDate(video.createdAt);
  const channelName = video.channel?.channelName || "Creator";

  return (
    <div className="group flex flex-col rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-950 overflow-hidden shadow-md hover:border-black/20 dark:hover:border-white/25 hover:shadow-2xl transition-all duration-300">
      {/* Slim Metadata Header Bar */}
      <div className="h-10 bg-neutral-100/90 dark:bg-black/90 border-b border-black/5 dark:border-white/8 px-3.5 flex items-center justify-between text-xs text-neutral-900 dark:text-white shrink-0 gap-2">
        <span className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400 tracking-wider uppercase shrink-0">
          {dateText}
        </span>

        <CurtainLink
          href={`/watch/${video.id}`}
          className="font-bold text-xs tracking-wide text-neutral-900 dark:text-white truncate text-center flex-1 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
          title={video.title}
        >
          {video.title}
        </CurtainLink>

        <div className="flex items-center gap-1.5 shrink-0 max-w-35 sm:max-w-xs justify-end">
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

      {/* Cinematic Preview */}
      <CurtainLink
        href={`/watch/${video.id}`}
        className="relative aspect-video w-full bg-black overflow-hidden group/media cursor-pointer block"
      >
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

        {/* Subtle Vignette Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20 pointer-events-none" />

        {/* Play Glyph on Hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/media:opacity-100 transition-opacity duration-300">
          <div className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-xl scale-90 group-hover/media:scale-100 transition-transform">
            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
          </div>
        </div>

        {/* Bottom Badges */}
        <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
          <span className="px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-xs text-[9px] font-mono font-bold text-white border border-white/10">
            {topResolution}
          </span>
          <span className="px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-xs text-[9px] font-mono text-neutral-300">
            {formatViews(video.viewCount)}
          </span>
        </div>
      </CurtainLink>
    </div>
  );
}
