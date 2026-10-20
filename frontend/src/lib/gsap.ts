"use client";

import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CustomEase } from "gsap/CustomEase";

// Register core plugins once on client
if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP, ScrollTrigger, CustomEase);

  // Register trademark Codegrid / Talha Slider cubic curve
  CustomEase.create("cubic", "0.83, 0, 0.17, 1");

  // Set standard animation defaults aligned with modern UI design
  gsap.defaults({
    ease: "power2.out",
    duration: 0.25,
  });
}

export { gsap, useGSAP, ScrollTrigger, CustomEase };

/**
 * Standard cubic-bezier and duration tokens
 * Aligned with Emil Kowalski's animation guidelines
 */
export const MOTION_TOKENS = {
  duration: {
    instant: 0.1,
    fast: 0.18,
    normal: 0.28,
    smooth: 0.45,
  },
  ease: {
    out: "power2.out",
    inOut: "power2.inOut",
    elastic: "back.out(1.4)",
    // Emil Kowalski snappy spring-like cubic bezier
    springLike: "cubic-bezier(0.16, 1, 0.3, 1)",
  },
};

/**
 * Helper to check prefers-reduced-motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Dropdown / Popover entrance animation
 */
export function animateDropdownIn(element: HTMLElement, onComplete?: () => void) {
  if (prefersReducedMotion()) {
    gsap.set(element, { autoAlpha: 1, y: 0, scale: 1 });
    onComplete?.();
    return;
  }

  gsap.fromTo(
    element,
    { autoAlpha: 0, scale: 0.95, y: -6 },
    {
      autoAlpha: 1,
      scale: 1,
      y: 0,
      duration: MOTION_TOKENS.duration.fast,
      ease: MOTION_TOKENS.ease.springLike,
      onComplete,
    },
  );
}

/**
 * Dropdown / Popover exit animation
 */
export function animateDropdownOut(element: HTMLElement, onComplete?: () => void) {
  if (prefersReducedMotion()) {
    gsap.set(element, { autoAlpha: 0 });
    onComplete?.();
    return;
  }

  gsap.to(element, {
    autoAlpha: 0,
    scale: 0.95,
    y: -4,
    duration: MOTION_TOKENS.duration.instant,
    ease: "power1.in",
    onComplete,
  });
}

/**
 * Modal dialog entrance animation
 */
export function animateModalIn(
  backdropEl: HTMLElement | null,
  dialogEl: HTMLElement | null,
  onComplete?: () => void,
) {
  if (prefersReducedMotion()) {
    if (backdropEl) gsap.set(backdropEl, { autoAlpha: 1 });
    if (dialogEl) gsap.set(dialogEl, { autoAlpha: 1, scale: 1, y: 0 });
    onComplete?.();
    return;
  }

  const tl = gsap.timeline({ onComplete });
  if (backdropEl) {
    tl.fromTo(backdropEl, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2, ease: "power1.out" }, 0);
  }
  if (dialogEl) {
    tl.fromTo(
      dialogEl,
      { autoAlpha: 0, scale: 0.94, y: 12 },
      { autoAlpha: 1, scale: 1, y: 0, duration: MOTION_TOKENS.duration.normal, ease: MOTION_TOKENS.ease.springLike },
      0,
    );
  }
}

/**
 * Modal dialog exit animation
 */
export function animateModalOut(
  backdropEl: HTMLElement | null,
  dialogEl: HTMLElement | null,
  onComplete?: () => void,
) {
  if (prefersReducedMotion()) {
    if (backdropEl) gsap.set(backdropEl, { autoAlpha: 0 });
    if (dialogEl) gsap.set(dialogEl, { autoAlpha: 0 });
    onComplete?.();
    return;
  }

  const tl = gsap.timeline({ onComplete });
  if (dialogEl) {
    tl.to(dialogEl, { autoAlpha: 0, scale: 0.96, y: 8, duration: 0.15, ease: "power2.in" }, 0);
  }
  if (backdropEl) {
    tl.to(backdropEl, { autoAlpha: 0, duration: 0.15, ease: "power1.in" }, 0);
  }
}
