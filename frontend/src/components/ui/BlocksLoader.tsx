"use client";

import React, { useRef } from "react";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { useGSAP } from "@gsap/react";

interface BlocksLoaderProps {
  color?: string;
  className?: string;
}

export function BlocksLoader({
  color = "#FF3C00",
  className = "",
}: BlocksLoaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef<(HTMLDivElement | null)[]>([]);

  blockRefs.current = [];
  const addToBlockRefs = (el: HTMLDivElement | null) => {
    if (el && !blockRefs.current.includes(el)) {
      blockRefs.current.push(el);
    }
  };

  useGSAP(
    () => {
      const blocks = blockRefs.current.filter(Boolean) as HTMLDivElement[];
      if (blocks.length !== 4) return;

      if (prefersReducedMotion()) {
        gsap.set(blocks, { y: 0, rotation: 0, scale: 1 });
        return;
      }

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

      blocks.forEach((el, index) => {
        const start = index * 0.11;

        masterLoop.to(
          el,
          {
            y: -7,
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

      return () => {
        masterLoop.kill();
      };
    },
    { scope: containerRef },
  );

  return (
    <div
      ref={containerRef}
      className={`relative overflow-visible inline-flex items-center justify-center select-none ${className}`}
      style={{ width: 66, height: 22 }}
      role="status"
      aria-label="Loading"
    >
      {[0, 1, 2, 3].map((index) => (
        <div
          key={index}
          ref={addToBlockRefs}
          className="absolute shadow-[0_0_8px_rgba(255,60,0,0.35)]"
          style={{
            width: 12,
            height: 12,
            left: 3 + index * 16,
            top: 5,
            backgroundColor: color,
            borderRadius: 1.5,
            willChange: "transform",
          }}
        />
      ))}
    </div>
  );
}
