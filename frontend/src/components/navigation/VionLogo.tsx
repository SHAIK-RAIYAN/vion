"use client";

import React, { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap, prefersReducedMotion } from "@/lib/gsap";

interface VionLogoProps {
  className?: string;
}

export function VionLogo({ className = "" }: VionLogoProps) {
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
    <div className={`flex items-center select-none text-neutral-900 dark:text-white ${className}`}>
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
