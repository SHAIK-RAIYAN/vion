"use client";

import React, { useState } from "react";
import { AppShell } from "@/components/navigation/AppShell";
import { VideoFeed } from "@/components/video/VideoFeed";
import ReusableErrorBoundary from "@/components/ReusableErrorBoundary";

export default function HomePage() {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <AppShell searchQuery={searchQuery} onSearchChange={setSearchQuery}>
      <ReusableErrorBoundary>
        <VideoFeed searchQuery={searchQuery} />
      </ReusableErrorBoundary>
    </AppShell>
  );
}
