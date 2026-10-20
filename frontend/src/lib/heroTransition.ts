"use client";

import { gsap, prefersReducedMotion } from "@/lib/gsap";
import type { Upload } from "@/types/api";

export interface HeroTransitionParams {
  cardElement: HTMLElement;
  video: Upload;
  router: { push: (href: string) => void };
  skipCurtainTransition?: () => void;
  onStart?: () => void;
}

/**
 * Computes the exact destination bounding box for the player on the /watch/[id] page.
 * Geometry matches WatchContent.tsx:
 *   - Container: max-w-5xl (1024px) with px-4 (32px horizontal padding)
 *   - Aspect ratio: 16:9 (aspect-video)
 *   - Header height: 56px (h-14)
 *   - Container py-4: 16px
 *   - Back to feed link: ~20px
 *   - space-y-6 margin: 24px
 *   Total targetTop: 56 + 16 + 20 + 24 = 116px
 */
export function getWatchPlayerDestinationRect(): {
  top: number;
  left: number;
  width: number;
  height: number;
} {
  const windowWidth = typeof window !== "undefined" ? window.innerWidth : 1200;
  // max-w-5xl is 1024px, minus 32px padding (px-4 on each side)
  const targetWidth = Math.min(1024 - 32, Math.max(300, windowWidth - 32));
  const targetHeight = Math.round(targetWidth * (9 / 16));
  const targetLeft = Math.round((windowWidth - targetWidth) / 2);
  const targetTop = 116;

  return {
    top: targetTop,
    left: targetLeft,
    width: targetWidth,
    height: targetHeight,
  };
}

/**
 * Animates a clicked video card on the home page into the exact position,
 * size, and rounded appearance of the /watch/[id] player before changing route.
 */
export function animateCardToWatchPage({
  cardElement,
  video,
  router,
  skipCurtainTransition,
  onStart,
}: HeroTransitionParams) {
  if (typeof window === "undefined") return;

  onStart?.();
  skipCurtainTransition?.();

  // 1. Cache video in sessionStorage for instantaneous, 0-spinner watch page mount
  try {
    sessionStorage.setItem(`vion_hero_video_${video.id}`, JSON.stringify(video));
  } catch {
    // Ignore storage errors
  }

  // 2. Measure starting card rect
  const sourceRect = cardElement.getBoundingClientRect();
  const destRect = getWatchPlayerDestinationRect();

  // If reduced motion is preferred, navigate directly
  if (prefersReducedMotion()) {
    router.push(`/watch/${video.id}`);
    return;
  }

  // Clean up any stale flying elements if user clicked rapidly
  const existingFlying = document.getElementById("vion-hero-flying-element");
  if (existingFlying) {
    existingFlying.remove();
  }

  // 3. Capture current video visual frame (via canvas from <video> or fallback to <img>)
  const videoEl = cardElement.querySelector<HTMLVideoElement>("video");
  let mediaNode: HTMLElement;

  if (videoEl && videoEl.videoWidth > 0) {
    const canvas = document.createElement("canvas");
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.objectFit = "cover";
    const ctx = canvas.getContext("2d");
    try {
      ctx?.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      mediaNode = canvas;
    } catch {
      const img = document.createElement("img");
      img.src = video.thumbnailUrl || "";
      img.alt = video.title;
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "cover";
      mediaNode = img;
    }
  } else {
    const img = document.createElement("img");
    img.src = video.thumbnailUrl || "";
    img.alt = video.title;
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "cover";
    mediaNode = img;
  }

  // 4. Create seamless flying hero overlay element
  const heroContainer = document.createElement("div");
  heroContainer.id = "vion-hero-flying-element";
  Object.assign(heroContainer.style, {
    position: "fixed",
    top: `${sourceRect.top}px`,
    left: `${sourceRect.left}px`,
    width: `${sourceRect.width}px`,
    height: `${sourceRect.height}px`,
    zIndex: "99999",
    borderRadius: "12px",
    overflow: "hidden",
    boxShadow: "0 30px 80px -15px rgba(0,0,0,0.85)",
    backgroundColor: "#000",
    border: "1px solid rgba(255,255,255,0.15)",
    pointerEvents: "none",
    willChange: "transform, top, left, width, height, border-radius",
    display: "flex",
    flexDirection: "column",
  });

  // Top header metadata bar (mimicking the card's header, will collapse to 0 as it becomes 16:9)
  const heroHeader = document.createElement("div");
  Object.assign(heroHeader.style, {
    height: "42px",
    width: "100%",
    backgroundColor: "rgba(0,0,0,0.9)",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 18px",
    fontSize: "12px",
    color: "#fff",
    flexShrink: "0",
    overflow: "hidden",
  });

  const headerTitle = document.createElement("div");
  headerTitle.textContent = video.title;
  headerTitle.style.fontWeight = "600";
  headerTitle.style.whiteSpace = "nowrap";
  headerTitle.style.overflow = "hidden";
  headerTitle.style.textOverflow = "ellipsis";
  headerTitle.style.flex = "1";
  headerTitle.style.textAlign = "center";
  heroHeader.appendChild(headerTitle);

  // Video Media Surface
  const mediaWrapper = document.createElement("div");
  Object.assign(mediaWrapper.style, {
    position: "relative",
    flex: "1",
    width: "100%",
    backgroundColor: "#000",
    overflow: "hidden",
  });
  mediaWrapper.appendChild(mediaNode);

  heroContainer.appendChild(heroHeader);
  heroContainer.appendChild(mediaWrapper);
  document.body.appendChild(heroContainer);

  // 5. Hide source card immediately so it looks like it was plucked into the air
  cardElement.style.opacity = "0";

  // 6. Master GSAP timeline: glides card to exact position & size of /watch player
  const tl = gsap.timeline({
    onComplete: () => {
      // Navigate to /watch/[id] now that the card is at the exact position & dimensions
      router.push(`/watch/${video.id}`);

      // Smoothly dissolve hero container once /watch page has mounted
      const dissolveTimer = setTimeout(() => {
        gsap.to(heroContainer, {
          opacity: 0,
          duration: 0.16,
          ease: "power2.out",
          onComplete: () => {
            heroContainer.remove();
          },
        });
      }, 70);

      // Failsafe cleanup in case navigation is cancelled
      setTimeout(() => {
        clearTimeout(dissolveTimer);
        if (heroContainer.parentNode) {
          heroContainer.remove();
        }
      }, 2000);
    },
  });

  // Animate outer bounds & position to destination
  tl.to(
    heroContainer,
    {
      top: destRect.top,
      left: destRect.left,
      width: destRect.width,
      height: destRect.height,
      borderRadius: "16px", // matching rounded-2xl of HlsVideoPlayer
      duration: 0.52,
      ease: "power3.inOut",
    },
    0,
  );

  // Smoothly collapse top header bar as aspect ratio morphs into 16:9 widescreen
  tl.to(
    heroHeader,
    {
      height: 0,
      opacity: 0,
      paddingTop: 0,
      paddingBottom: 0,
      duration: 0.26,
      ease: "power2.in",
    },
    0,
  );
}
