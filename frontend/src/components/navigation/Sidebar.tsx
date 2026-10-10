"use client";

import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { Home, Tv } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, openAuthModal } = useAuth();

  const navItems = [
    { label: "Home", href: "/", icon: Home },
    { label: "Subscriptions", href: "/subscriptions", icon: Tv, authRequired: true },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden animate-in fade-in duration-200"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={cn(
          "fixed top-14 bottom-0 left-0 z-40 w-60 border-r border-border bg-background flex flex-col justify-between py-4 transition-transform duration-200 md:static md:translate-x-0 select-none",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="space-y-1 px-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            if (item.authRequired && !user) {
              return (
                <button
                  key={item.href}
                  onClick={() => {
                    onClose();
                    openAuthModal("signin");
                  }}
                  className="w-full relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors cursor-pointer group"
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
                onClick={onClose}
                className={cn(
                  "relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors group cursor-pointer",
                  isActive
                    ? "text-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active-indicator"
                    className="absolute inset-0 bg-secondary rounded-xl shadow-2xs -z-10"
                    transition={{ type: "spring", stiffness: 450, damping: 35 }}
                  />
                )}
                <Icon
                  className={cn(
                    "w-4 h-4 shrink-0 relative z-10 transition-colors",
                    isActive ? "text-[var(--brand)]" : "text-muted-foreground group-hover:text-foreground",
                  )}
                />
                <span className="relative z-10">{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Footer info in sidebar */}
        <div className="px-4 py-2 border-t border-border/60 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
            <span>Vion v0.1</span>
          </div>
        </div>
      </aside>
    </>
  );
}
