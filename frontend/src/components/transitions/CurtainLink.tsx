"use client";

import React from "react";
import Link, { LinkProps } from "next/link";
import { usePathname } from "next/navigation";
import { useCurtainTransition } from "./CurtainTransitionContext";
import { prefersReducedMotion } from "@/lib/gsap";

export interface CurtainLinkProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps>,
    LinkProps {
  children: React.ReactNode;
  className?: string;
  replace?: boolean;
}

/**
 * Reusable CurtainLink Component
 * 
 * Drop-in wrapper around Next.js Link that triggers the diagonal curtain transition.
 * Gracefully handles modifier keys (Cmd/Ctrl for new tabs), reduced motion preferences,
 * and current route clicks.
 */
export const CurtainLink = React.forwardRef<HTMLAnchorElement, CurtainLinkProps>(
  function CurtainLink(
    {
      href,
      children,
      className,
      replace,
      onClick,
      target,
      ...rest
    }: CurtainLinkProps,
    ref,
  ) {
    const { transitionTo, isTransitioning } = useCurtainTransition();
    const pathname = usePathname();

    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
      // Call custom onClick if provided
      onClick?.(e);

      // If default was prevented or transition is already running, skip
      if (e.defaultPrevented || isTransitioning) {
        return;
      }

      // Do not intercept if opening in new tab or external
      if (
        target === "_blank" ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey ||
        e.button !== 0
      ) {
        return;
      }

      const targetUrl = typeof href === "string" ? href : href.pathname || "";

      // Ignore if target is external link
      if (targetUrl.startsWith("http://") || targetUrl.startsWith("https://")) {
        return;
      }

      // Ignore if clicking the exact current route
      if (targetUrl === pathname) {
        e.preventDefault();
        return;
      }

      // If user prefers reduced motion, let standard Next.js Link navigate immediately
      if (prefersReducedMotion()) {
        return;
      }

      e.preventDefault();
      transitionTo(targetUrl, { replace });
    };

    return (
      <Link
        ref={ref}
        href={href}
        className={className}
        onClick={handleClick}
        target={target}
        {...rest}
      >
        {children}
      </Link>
    );
  },
);
