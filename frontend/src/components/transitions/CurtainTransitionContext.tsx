"use client";

import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  useEffect,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { useLenisContext } from "@/providers/LenisProvider";
import {
  CURTAIN_CONFIG,
  getCurtainCoverClipPath,
  getCurtainRevealClipPath,
} from "./transitionConfig";

export type TransitionPhase = "idle" | "covering" | "covered" | "revealing";

export interface CurtainTransitionContextValue {
  phase: TransitionPhase;
  isTransitioning: boolean;
  isInitialLoad: boolean;
  setIsInitialLoad: (isInitial: boolean) => void;
  overlayElement: HTMLDivElement | null;
  setOverlayElement: (el: HTMLDivElement | null) => void;
  cover: () => Promise<void>;
  reveal: () => Promise<void>;
  transitionTo: (href: string, options?: { replace?: boolean }) => Promise<void>;
}

const CurtainTransitionContext = createContext<CurtainTransitionContextValue | null>(null);

export function useCurtainTransition(): CurtainTransitionContextValue {
  const context = useContext(CurtainTransitionContext);
  if (!context) {
    throw new Error(
      "useCurtainTransition must be used within a CurtainTransitionProvider",
    );
  }
  return context;
}

export function CurtainTransitionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { lenis } = useLenisContext();

  const [phase, setPhase] = useState<TransitionPhase>("covered");
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [overlayElement, setOverlayElement] = useState<HTMLDivElement | null>(null);

  const phaseRef = useRef<TransitionPhase>("covered");
  phaseRef.current = phase;

  const isTransitioningRef = useRef(false);
  const currentTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const pendingNavigationRef = useRef<(() => void) | null>(null);

  // Lock scroll helper
  const lockScroll = useCallback(() => {
    if (lenis) {
      lenis.stop();
    }
    if (typeof document !== "undefined") {
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    }
  }, [lenis]);

  // Unlock scroll helper
  const unlockScroll = useCallback(() => {
    if (lenis) {
      lenis.start();
    }
    if (typeof document !== "undefined") {
      document.documentElement.style.removeProperty("overflow");
      document.body.style.removeProperty("overflow");
    }
  }, [lenis]);

  // Keep scroll locked while initial load is ongoing
  useEffect(() => {
    if (isInitialLoad || phase !== "idle") {
      lockScroll();
    } else {
      unlockScroll();
    }
  }, [isInitialLoad, phase, lockScroll, unlockScroll]);

  /**
   * Reveal the current screen using the diagonal falling curtain effect.
   */
  const reveal = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      const el = overlayElement;
      if (!el) {
        setPhase("idle");
        isTransitioningRef.current = false;
        unlockScroll();
        resolve();
        return;
      }

      if (prefersReducedMotion()) {
        gsap.set(el, {
          clipPath: getCurtainRevealClipPath(1),
          autoAlpha: 0,
        });
        setPhase("idle");
        isTransitioningRef.current = false;
        unlockScroll();
        resolve();
        return;
      }

      setPhase("revealing");
      isTransitioningRef.current = true;

      // Kill any running timeline on the overlay
      currentTimelineRef.current?.kill();

      const tl = gsap.timeline({
        onComplete: () => {
          setPhase("idle");
          isTransitioningRef.current = false;
          unlockScroll();
          gsap.set(el, { autoAlpha: 0, pointerEvents: "none" });
          resolve();
        },
      });
      currentTimelineRef.current = tl;

      // Ensure overlay is visible before starting reveal
      gsap.set(el, { autoAlpha: 1, pointerEvents: "auto" });

      const progressProxy = { val: 0 };
      tl.to(progressProxy, {
        val: 1,
        duration: CURTAIN_CONFIG.timings.revealDuration,
        ease: CURTAIN_CONFIG.easings.curtainReveal,
        onUpdate: () => {
          const path = getCurtainRevealClipPath(progressProxy.val);
          el.style.clipPath = path;
          (el.style as unknown as { webkitClipPath: string }).webkitClipPath = path;
        },
      });
    });
  }, [overlayElement, unlockScroll]);

  /**
   * Cover the current screen with the diagonal curtain.
   */
  const cover = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      const el = overlayElement;
      if (!el) {
        setPhase("covered");
        resolve();
        return;
      }

      lockScroll();

      if (prefersReducedMotion()) {
        gsap.set(el, {
          clipPath: getCurtainCoverClipPath(1),
          autoAlpha: 1,
        });
        setPhase("covered");
        resolve();
        return;
      }

      setPhase("covering");
      isTransitioningRef.current = true;

      currentTimelineRef.current?.kill();

      const tl = gsap.timeline({
        onComplete: () => {
          setPhase("covered");
          resolve();
        },
      });
      currentTimelineRef.current = tl;

      gsap.set(el, { autoAlpha: 1, pointerEvents: "auto" });

      const progressProxy = { val: 0 };
      tl.to(progressProxy, {
        val: 1,
        duration: CURTAIN_CONFIG.timings.coverDuration,
        ease: CURTAIN_CONFIG.easings.curtainCover,
        onUpdate: () => {
          const path = getCurtainCoverClipPath(progressProxy.val);
          el.style.clipPath = path;
          (el.style as unknown as { webkitClipPath: string }).webkitClipPath = path;
        },
      });
    });
  }, [overlayElement, lockScroll]);

  /**
   * Seamless route transition:
   * 1. Check if already transitioning or target is current URL.
   * 2. Animate cover over outgoing page.
   * 3. Navigate with router.
   * 4. Animate reveal on destination page.
   */
  const transitionTo = useCallback(
    async (href: string, options?: { replace?: boolean }) => {
      // Prevent overlapping transitions
      if (isTransitioningRef.current) return;
      if (href === pathname) return;

      isTransitioningRef.current = true;

      try {
        await cover();

        // Perform the Next.js client-side navigation while concealed
        if (options?.replace) {
          router.replace(href);
        } else {
          router.push(href);
        }

        // Give Next.js a short tick to mount the new route view
        await new Promise((r) => setTimeout(r, 60));

        await reveal();
      } catch (err) {
        console.error("Transition failed, recovering cleanly:", err);
        // Safety recovery: ensure page is revealed and unlocked
        if (overlayElement) {
          gsap.set(overlayElement, { autoAlpha: 0, pointerEvents: "none" });
        }
        setPhase("idle");
        isTransitioningRef.current = false;
        unlockScroll();
      }
    },
    [cover, reveal, pathname, router, overlayElement, unlockScroll],
  );

  return (
    <CurtainTransitionContext.Provider
      value={{
        phase,
        isTransitioning: phase !== "idle",
        isInitialLoad,
        setIsInitialLoad,
        overlayElement,
        setOverlayElement,
        cover,
        reveal,
        transitionTo,
      }}
    >
      {children}
    </CurtainTransitionContext.Provider>
  );
}
