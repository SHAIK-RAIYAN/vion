"use client";

import React, { useEffect, useState } from "react";
import { Eye } from "lucide-react";

// Module-level timestamp to prevent React 19 StrictMode double-incrementing
// while still incrementing on every actual page load / visit
let lastIncrementTimestamp = 0;

export function SiteViewCounter() {
  const [views, setViews] = useState<number | null>(null);

  useEffect(() => {
    const now = Date.now();
    const shouldIncrement = now - lastIncrementTimestamp > 3500;

    if (shouldIncrement) {
      lastIncrementTimestamp = now;
      fetch("/api/views", { method: "POST" })
        .then((res) => res.json())
        .then((data) => {
          if (typeof data.views === "number") {
            setViews(data.views);
          }
        })
        .catch((err) => {
          console.error("Failed to record site view:", err);
        });
    } else {
      fetch("/api/views")
        .then((res) => res.json())
        .then((data) => {
          if (typeof data.views === "number") {
            setViews(data.views);
          }
        })
        .catch((err) => {
          console.error("Failed to fetch site views:", err);
        });
    }
  }, []);

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 sm:py-1.5 rounded-full text-xs font-mono text-neutral-500 dark:text-neutral-400 bg-black/[0.03] dark:bg-white/[0.04] border border-black/5 dark:border-white/5 select-none transition-colors"
      title="Total site views"
      aria-label="Total site views"
    >
      <Eye className="w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500 shrink-0" />
      <span className="tabular-nums tracking-tight">
        {views !== null ? (
          <>
            <span>{views.toLocaleString()}</span>{" "}
            <span className="hidden sm:inline">{views === 1 ? "view" : "views"}</span>
            <span className="sm:hidden">{views === 1 ? "view" : "views"}</span>
          </>
        ) : (
          <span className="opacity-50">... views</span>
        )}
      </span>
    </div>
  );
}
