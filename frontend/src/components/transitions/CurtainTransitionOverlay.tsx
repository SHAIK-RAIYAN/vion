"use client";

import React, { useEffect, useRef } from "react";
import { useCurtainTransition } from "./CurtainTransitionContext";
import { CURTAIN_CONFIG, getCurtainRevealClipPath } from "./transitionConfig";

/**
 * Reusable Curtain Transition Overlay
 * 
 * Standalone rigid plane overlay that executes the diagonal falling-curtain wipe.
 * Completely decoupled from preloader state, text, or loading blocks.
 * Persists in the root layout so it never unmounts or resets during navigation.
 */
export function CurtainTransitionOverlay() {
  const { setOverlayElement, isInitialLoad } = useCurtainTransition();
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (overlayRef.current) {
      setOverlayElement(overlayRef.current);
    }
    return () => {
      setOverlayElement(null);
    };
  }, [setOverlayElement]);

  // Initial SSR clip-path: full coverage on initial load, hidden once loaded
  const initialClipPath = isInitialLoad
    ? getCurtainRevealClipPath(0)
    : getCurtainRevealClipPath(1);

  return (
    <div
      ref={overlayRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[9998] select-none will-change-[clip-path]"
      style={{
        backgroundColor: CURTAIN_CONFIG.color,
        clipPath: initialClipPath,
        WebkitClipPath: initialClipPath,
      }}
    />
  );
}
