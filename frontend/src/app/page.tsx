"use client";

import React, { useState, Suspense } from "react";
import { AppShell } from "@/components/navigation/AppShell";
import { VideoFeed } from "@/components/video/VideoFeed";
import ReusableErrorBoundary from "@/components/ReusableErrorBoundary";

export default function HomePage() {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <AppShell
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      fullBleed
    >
      <ReusableErrorBoundary>
        <Suspense
          fallback={
            <div className="w-full h-screen bg-black flex items-center justify-center text-xs font-mono text-neutral-500 uppercase tracking-widest">
              Loading Vion...
            </div>
          }
        >
          <VideoFeed searchQuery={searchQuery} />
        </Suspense>
      </ReusableErrorBoundary>
    </AppShell>
  );
}
