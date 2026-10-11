"use client";

import { useAuth } from "@/context/AuthContext";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";
import { History, Home, Tv } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, openAuthModal } = useAuth();

  const navContainerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<Map<string, HTMLElement>>(new Map());

  const navItems = [
    { label: "Home", href: "/", icon: Home, authRequired: false },
    { label: "Subscriptions", href: "/subscriptions", icon: Tv, authRequired: true },
    { label: "History", href: "/history", icon: History, authRequired: true },
  ];

  // Animate the single active navigation indicator using GSAP
  useEffect(() => {
    const activeEl = itemsRef.current.get(pathname);
    const indicator = indicatorRef.current;
    const container = navContainerRef.current;

    if (!indicator || !container) return;

    if (activeEl) {
      const top = activeEl.offsetTop;
      const height = activeEl.offsetHeight;

      if (prefersReducedMotion()) {
        gsap.set(indicator, {
          y: top,
          height: height,
          opacity: 1,
        });
      } else {
        gsap.to(indicator, {
          y: top,
          height: height,
          opacity: 1,
          duration: 0.3,
          ease: "power2.out",
        });
      }
    } else {
      // Not on a sidebar item route (e.g. /watch/[id] or /channel/[id])
      gsap.to(indicator, {
        opacity: 0,
        duration: 0.2,
        ease: "power1.out",
      });
    }
  }, [pathname]);

  return (
    <>
      {/* Mobile Backdrop - anchored below top-14 header */}
      {isOpen && (
        <div
          className="fixed inset-0 top-14 z-30 bg-black/50 md:hidden animate-in fade-in duration-200"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container - always stays below top-14 navbar, sticky on desktop */}
      <aside
        className={cn(
          "fixed top-14 bottom-0 left-0 z-40 w-60 border-r border-border bg-background flex flex-col justify-between transition-transform duration-200 select-none",
          "md:sticky md:top-14 md:h-[calc(100vh-3.5rem)] md:translate-x-0 md:z-30 shrink-0",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div ref={navContainerRef} className="flex-1 overflow-y-auto py-4 px-3 space-y-1 relative">
          {/* GSAP-animated single active navigation indicator */}
          <div
            ref={indicatorRef}
            aria-hidden="true"
            className="absolute left-3 right-3 top-0 rounded-xl bg-secondary pointer-events-none opacity-0 shadow-2xs border border-border/40"
            style={{ height: 42 }}
          />

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            if (item.authRequired && !user) {
              return (
                <button
                  key={item.href}
                  type="button"
                  ref={(el) => {
                    if (el) itemsRef.current.set(item.href, el);
                    else itemsRef.current.delete(item.href);
                  }}
                  onClick={() => {
                    onClose();
                    openAuthModal("signin");
                  }}
                  className="w-full relative z-1 flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer group text-left"
                >
                  <Icon className="w-4 h-4 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
                  <span>{item.label}</span>
                </button>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                ref={(el) => {
                  if (el) itemsRef.current.set(item.href, el);
                  else itemsRef.current.delete(item.href);
                }}
                onClick={onClose}
                className={cn(
                  "relative z-1 flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors group cursor-pointer",
                  isActive
                    ? "text-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "w-4 h-4 shrink-0 transition-colors",
                    isActive
                      ? "text-[var(--brand)]"
                      : "text-muted-foreground group-hover:text-foreground",
                  )}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Footer info in sidebar */}
        <div className="p-4 border-t border-border/60 text-xs text-muted-foreground shrink-0">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
            <span>Vion Platform</span>
          </div>
          <p className="text-[11px] text-muted-foreground/80 mt-1">
            Connected to Vion API v1
          </p>
        </div>
      </aside>
    </>
  );
}
