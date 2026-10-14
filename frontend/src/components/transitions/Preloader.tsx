"use client";

import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";
import { useEffect, useRef, useState } from "react";
import { useCurtainTransition, WELCOME_SESSION_KEY } from "./CurtainTransitionContext";
import { CURTAIN_CONFIG } from "./transitionConfig";

/**
 * Initial Preloader Component
 *
 * Displays the vibrant red-orange screen with 4 tumbling loading blocks
 * and clipped uppercase "WELCOME" text ONLY when first coming to the site.
 *
 * Subsequent route navigations and path changes NEVER show the welcome text;
 * they smoothly execute the left-to-right falling slider via CurtainTransition.
 */
export function Preloader() {
  const { reveal, isInitialLoad, setIsInitialLoad } = useCurtainTransition();
  const [shouldRender, setShouldRender] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const centerGroupRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef<(HTMLDivElement | null)[]>([]);

  const isReadyRef = useRef(false);
  const isRevealingRef = useRef(false);
  const loopTlRef = useRef<gsap.core.Timeline | null>(null);

  // Check on client mount whether welcome was already shown in this session
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        const alreadyWelcomed = sessionStorage.getItem(WELCOME_SESSION_KEY) === "true";
        if (alreadyWelcomed || !isInitialLoad) {
          setIsInitialLoad(false);
          setShouldRender(false);
          return;
        }
      }
    } catch {}

    if (isInitialLoad) {
      setShouldRender(true);
    }
  }, [isInitialLoad, setIsInitialLoad]);

  // If initial load was marked false, immediately unmount
  useEffect(() => {
    if (!isInitialLoad) {
      setShouldRender(false);
    }
  }, [isInitialLoad]);

  // Set up genuine application readiness detection
  useEffect(() => {
    if (!isInitialLoad) return;

    if (prefersReducedMotion()) {
      try {
        if (typeof window !== "undefined") {
          sessionStorage.setItem(WELCOME_SESSION_KEY, "true");
        }
      } catch {}
      setIsInitialLoad(false);
      setShouldRender(false);
      reveal();
      return;
    }

    let isCancelled = false;

    // 1. Critical Fonts Loading
    const fontsPromise =
      typeof document !== "undefined" && document.fonts
        ? document.fonts.ready.catch(() => {})
        : Promise.resolve();

    // 2. Document Complete Readiness & Hydration
    const domReadyPromise = new Promise<void>((resolve) => {
      if (typeof document !== "undefined" && document.readyState === "complete") {
        resolve();
      } else if (typeof window !== "undefined") {
        window.addEventListener("load", () => resolve(), { once: true });
      } else {
        resolve();
      }
    });

    // 3. Aesthetic rhythm beat for tumbling blocks
    const minBeatPromise = new Promise<void>((resolve) =>
      setTimeout(resolve, CURTAIN_CONFIG.timings.minPreloaderBeat * 1000),
    );

    // 4. Safety timeout boundary so user is never trapped
    const safetyTimeoutPromise = new Promise<void>((resolve) =>
      setTimeout(resolve, CURTAIN_CONFIG.timings.safetyTimeout * 1000),
    );

    // Initial critical application work: fonts + DOM hydration
    const criticalWork = Promise.all([fontsPromise, domReadyPromise]);

    Promise.all([
      Promise.race([criticalWork, safetyTimeoutPromise]),
      minBeatPromise,
    ]).then(() => {
      if (isCancelled) return;
      isReadyRef.current = true;
      triggerExitSequence();
    });

    return () => {
      isCancelled = true;
    };
  }, [isInitialLoad, reveal, setIsInitialLoad]);

  // Trigger choreographed exit sequence
  const triggerExitSequence = () => {
    if (isRevealingRef.current) return;
    isRevealingRef.current = true;

    // Stop looping timeline
    loopTlRef.current?.pause();

    const exitTl = gsap.timeline({
      onComplete: async () => {
        // Delegate diagonal falling-curtain reveal to the reusable Curtain Transition system
        await reveal();
        try {
          if (typeof window !== "undefined") {
            sessionStorage.setItem(WELCOME_SESSION_KEY, "true");
          }
        } catch {}
        setIsInitialLoad(false);
        setShouldRender(false);
      },
    });

    // 1. Animate welcome text vertically outside its clipped container
    if (textRef.current) {
      exitTl.to(textRef.current, {
        yPercent: -120,
        duration: CURTAIN_CONFIG.timings.textExitDuration,
        ease: CURTAIN_CONFIG.easings.textExit,
      });
    }

    // 2. Fade center blocks group
    if (centerGroupRef.current) {
      exitTl.to(
        centerGroupRef.current,
        {
          opacity: 0,
          scale: 0.94,
          duration: CURTAIN_CONFIG.timings.loaderFadeDuration,
          ease: CURTAIN_CONFIG.easings.loaderFade,
        },
        ">-0.15",
      );
    }

    // 3. Fade preloader container background so underlying curtain overlay performs the diagonal wipe
    if (containerRef.current) {
      exitTl.to(
        containerRef.current,
        {
          opacity: 0,
          duration: 0.15,
          ease: "power2.out",
        },
        ">-0.05",
      );
    }
  };

  // Setup GSAP tumbling blocks animation loop
  useGSAP(
    () => {
      const blocks = blockRefs.current.filter(Boolean) as HTMLDivElement[];

      if (blocks.length !== 4 || prefersReducedMotion()) return;

      gsap.set(blocks, {
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        transformOrigin: "50% 50%",
        force3D: true,
      });

      const masterLoop = gsap.timeline({
        repeat: -1,
        repeatDelay: 0.16,
      });

      loopTlRef.current = masterLoop;

      blocks.forEach((el, index) => {
        const start = index * 0.11;

        masterLoop.to(
          el,
          {
            y: -6,
            rotation: 90,
            scaleX: 0.9,
            scaleY: 1.08,
            duration: 0.22,
            ease: "power2.out",
          },
          start,
        );

        masterLoop.to(
          el,
          {
            y: 0,
            rotation: 180,
            scaleX: 1.1,
            scaleY: 0.82,
            duration: 0.14,
            ease: "power2.in",
          },
          start + 0.22,
        );

        masterLoop.to(
          el,
          {
            scaleX: 1,
            scaleY: 1,
            duration: 0.15,
            ease: "back.out(2.5)",
          },
          start + 0.36,
        );
      });
    },
    { scope: containerRef },
  );

  if (!shouldRender || !isInitialLoad) return null;

  return (
    <div
      ref={containerRef}
      aria-label="Loading Vion"
      role="status"
      className="fixed inset-0 z-10000 flex items-center justify-center select-none"
      style={{
        backgroundColor: CURTAIN_CONFIG.color,
      }}
    >
      <div
        ref={centerGroupRef}
        className="flex flex-col items-center gap-3.5"
      >
        {/* 4 Small Rectangular/Square Loading Blocks */}
        <div
          className="relative overflow-visible"
          style={{ width: 66, height: 22 }}
        >
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              ref={(el) => {
                blockRefs.current[index] = el;
              }}
              className="absolute"
              style={{
                width: 12,
                height: 12,
                left: 3 + index * 16,
                top: 5,
                backgroundColor: CURTAIN_CONFIG.darkForeground,
                borderRadius: 1,
                willChange: "transform",
              }}
            />
          ))}
        </div>

        {/* Clipped Welcome / Loading Text */}
        <div className="overflow-hidden">
          <div
            ref={textRef}
            className="text-[11px] font-bold tracking-[0.25em] uppercase"
            style={{
              color: CURTAIN_CONFIG.darkForeground,
            }}
          >
            WELCOME
          </div>
        </div>
      </div>
    </div>
  );
}
