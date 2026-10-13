"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export type ViewMode = "stacked" | "grid";

interface ViewModeContextValue {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  toggleViewMode: () => void;
}

const ViewModeContext = createContext<ViewModeContextValue>({
  viewMode: "stacked",
  setViewMode: () => {},
  toggleViewMode: () => {},
});

export function useViewMode() {
  return useContext(ViewModeContext);
}

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const [viewMode, setViewModeState] = useState<ViewMode>("stacked");
  const [mounted, setMounted] = useState(false);

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

  const setViewMode = (mode: ViewMode) => {
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
      }}
    >
      {children}
    </ViewModeContext.Provider>
  );
}
