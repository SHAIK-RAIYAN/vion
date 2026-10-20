import React from "react";

export function VideoCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 animate-pulse">
      {/* Thumbnail Skeleton */}
      <div className="w-full aspect-video rounded-xl bg-muted/60" />

      {/* Details Skeleton */}
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full bg-muted shrink-0 mt-0.5" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-muted rounded w-4/5" />
          <div className="h-3 bg-muted rounded w-1/2" />
        </div>
      </div>
    </div>
  );
}
