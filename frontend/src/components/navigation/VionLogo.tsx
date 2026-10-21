"use client";

import React, { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap, prefersReducedMotion } from "@/lib/gsap";

interface VionLogoProps {
  className?: string;
  showMark?: boolean;
}

export function VionLogo({ className = "", showMark = true }: VionLogoProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useGSAP(
    () => {
      if (!svgRef.current) return;
      const reducedMotion = prefersReducedMotion();

      const paths = svgRef.current.querySelectorAll<SVGPathElement>(".vion-path");
      const dot = svgRef.current.querySelector(".vion-dot");

      if (reducedMotion) {
        paths.forEach((p) => {
          gsap.set(p, { strokeDashoffset: 0, strokeDasharray: "none", opacity: 1 });
        });
        if (dot) gsap.set(dot, { scale: 1, opacity: 1 });
        return;
      }

      // Measure exact geometry length for each letter path
      paths.forEach((path) => {
        const length = Math.ceil(path.getTotalLength()) + 2;
        gsap.set(path, {
          strokeDasharray: length,
          strokeDashoffset: length,
          opacity: 1,
        });
      });

      if (dot) {
        gsap.set(dot, {
          scale: 0,
          opacity: 0,
          transformOrigin: "center center",
        });
      }

      // Sequential path drawing timeline
      const tl = gsap.timeline({
        defaults: { ease: "power2.out" },
        onComplete: () => {
          paths.forEach((p) => {
            gsap.set(p, { strokeDasharray: "none", strokeDashoffset: 0 });
          });
        },
      });

      tl.to(".vion-letter-v", {
        strokeDashoffset: 0,
        duration: 0.4,
      })
        .to(
          ".vion-letter-i",
          {
            strokeDashoffset: 0,
            duration: 0.28,
          },
          "-=0.1",
        )
        .to(
          ".vion-letter-o",
          {
            strokeDashoffset: 0,
            duration: 0.42,
          },
          "-=0.1",
        )
        .to(
          ".vion-letter-n",
          {
            strokeDashoffset: 0,
            duration: 0.48,
          },
          "-=0.15",
        )
        .to(
          ".vion-dot",
          {
            scale: 1,
            opacity: 1,
            duration: 0.35,
            ease: "back.out(2.2)",
          },
          "-=0.1",
        );
    },
    { scope: svgRef },
  );

  return (
    <div className={`flex items-center gap-2 select-none text-neutral-900 dark:text-white ${className}`}>
      {showMark && (
        <svg
          viewBox="0 0 512 512"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-5.5 w-5.5 sm:h-6 sm:w-6 shrink-0 transition-transform duration-300 group-hover:scale-105"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="vion-logo-mark-bg" x1="12%" y1="8%" x2="88%" y2="92%">
              <stop offset="0%" stopColor="#FF5A00" />
              <stop offset="38%" stopColor="#FF3C00" />
              <stop offset="72%" stopColor="#9E1400" />
              <stop offset="100%" stopColor="#120400" />
            </linearGradient>
            <linearGradient id="vion-logo-mark-rim" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFA666" stopOpacity="0.9" />
              <stop offset="45%" stopColor="#FF3C00" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#400A00" stopOpacity="0.8" />
            </linearGradient>
            <linearGradient id="vion-logo-mark-v-left" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="100%" stopColor="#F2F2F6" />
            </linearGradient>
            <linearGradient id="vion-logo-mark-v-right" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#F7F7FA" />
              <stop offset="100%" stopColor="#DEDEE5" />
            </linearGradient>
            <filter id="vion-logo-mark-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#000000" floodOpacity="0.45" />
            </filter>
          </defs>
          <circle cx="256" cy="256" r="236" fill="url(#vion-logo-mark-bg)" stroke="url(#vion-logo-mark-rim)" strokeWidth="14" />
          <path d="M 40 256 A 216 216 0 0 1 472 256 A 216 170 0 0 0 40 256 Z" fill="#FFFFFF" fillOpacity="0.12" />
          <g filter="url(#vion-logo-mark-shadow)">
            <path d="M 132 144 L 256 368 L 256 264 L 186 144 Z" fill="url(#vion-logo-mark-v-left)" />
            <path d="M 256 368 L 380 144 L 326 144 L 256 264 Z" fill="url(#vion-logo-mark-v-right)" />
            <path d="M 256 264 L 256 368" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.6" />
            <circle cx="390" cy="352" r="24" fill="#FFFFFF" />
          </g>
        </svg>
      )}
      <svg
        ref={svgRef}
        viewBox="0 0 116 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-5.5 sm:h-6 w-auto overflow-visible cursor-pointer"
        aria-label="VION"
      >
        <defs>
          <filter
            id="vion-glow"
            filterUnits="userSpaceOnUse"
            x="-20"
            y="-20"
            width="160"
            height="70"
          >
            <feDropShadow
              dx="0"
              dy="0"
              stdDeviation="1.5"
              floodColor="currentColor"
              floodOpacity="0.25"
            />
          </filter>
          <filter
            id="vion-dot-glow"
            filterUnits="userSpaceOnUse"
            x="-20"
            y="-20"
            width="160"
            height="70"
          >
            <feDropShadow
              dx="0"
              dy="0"
              stdDeviation="3"
              floodColor="#ff3c00"
              floodOpacity="0.85"
            />
          </filter>
        </defs>

        {/* V */}
        <path
          className="vion-path vion-letter-v"
          d="M 3 3.5 L 14 20.5 L 25 3.5"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#vion-glow)"
        />

        {/* I (drawn with two micro points to ensure non-zero bounding box across all renderers) */}
        <path
          className="vion-path vion-letter-i"
          d="M 36 3.5 L 36.001 20.5"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          filter="url(#vion-glow)"
        />

        {/* O */}
        <path
          className="vion-path vion-letter-o"
          d="M 59 3.5 C 49 3.5 45 7.8 45 12 C 45 16.2 49 20.5 59 20.5 C 69 20.5 73 16.2 73 12 C 73 7.8 69 3.5 59 3.5 Z"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#vion-glow)"
        />

        {/* N */}
        <path
          className="vion-path vion-letter-n"
          d="M 83 20.5 L 83 3.5 L 100 20.5 L 100 3.5"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#vion-glow)"
        />

        {/* Dot Accent */}
        <circle
          className="vion-dot"
          cx="108"
          cy="19"
          r="2.8"
          fill="#ff3c00"
          filter="url(#vion-dot-glow)"
        />
      </svg>
    </div>
  );
}
