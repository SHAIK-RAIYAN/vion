"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export type ViewMode = "stacked" | "grid";

interface ViewModeContextValue {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  toggleViewMode: () => void;
  getCardSnapshot: () => Map<string, DOMRect>;
  clearSnapshot: () => void;
}

const ViewModeContext = createContext<ViewModeContextValue>({
  viewMode: "stacked",
  setViewMode: () => {},
  toggleViewMode: () => {},
  getCardSnapshot: () => new Map(),
  clearSnapshot: () => {},
});

export function useViewMode() {
  return useContext(ViewModeContext);
}

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const [viewMode, setViewModeState] = useState<ViewMode>("stacked");
  const [mounted, setMounted] = useState(false);
  const cardSnapshotsRef = React.useRef<Map<string, DOMRect>>(new Map());
  const clearTimerRef = React.useRef<NodeJS.Timeout | undefined>(undefined);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("vion_view_mode") as ViewMode | null;
      if (saved === "stacked" || saved === "grid") {
        setViewModeState(saved);
      }
    } catch {
      // Ignore storage access errors
    }
    setMounted(true);
  }, []);

  const captureCardSnapshots = () => {
    if (typeof document === "undefined") return;
    const map = new Map<string, DOMRect>();
    const elements = document.querySelectorAll<HTMLElement>("[data-video-card-id]");
    elements.forEach((el) => {
      const rawId = el.getAttribute("data-video-card-id");
      if (rawId) {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const opacity = parseFloat(style.opacity || "1");
        const isVisible =
          rect.width > 20 &&
          rect.height > 20 &&
          rect.top < window.innerHeight &&
          rect.bottom > 0 &&
          style.visibility !== "hidden" &&
          opacity > 0.05;

        if (isVisible) {
          const baseId = rawId.replace(/-rep-\d+$/, "");
          map.set(rawId, rect);
          if (!map.has(baseId)) {
            map.set(baseId, rect);
          }
        }
      }
    });

    cardSnapshotsRef.current = map;
    clearTimeout(clearTimerRef.current);
    // Keep snapshots available for 1500ms to span the entire transition duration
    clearTimerRef.current = setTimeout(() => {
      cardSnapshotsRef.current = new Map();
    }, 1500);
  };

  const getCardSnapshot = () => cardSnapshotsRef.current;

  const clearSnapshot = () => {
    // Graceful no-op or explicit clear
    clearTimeout(clearTimerRef.current);
    cardSnapshotsRef.current = new Map();
  };

  const setViewMode = (mode: ViewMode) => {
    if (mode === viewMode) return;
    // Capture positions of current cards before DOM morphs into new view
    captureCardSnapshots();
    setViewModeState(mode);
    try {
      localStorage.setItem("vion_view_mode", mode);
    } catch {
      // Ignore
    }
  };

  const toggleViewMode = () => {
    const next = viewMode === "stacked" ? "grid" : "stacked";
    setViewMode(next);
  };

  return (
    <ViewModeContext.Provider
      value={{
        viewMode: mounted ? viewMode : "stacked",
        setViewMode,
        toggleViewMode,
        getCardSnapshot,
        clearSnapshot,
      }}
    >
      {children}
    </ViewModeContext.Provider>
  );
}
