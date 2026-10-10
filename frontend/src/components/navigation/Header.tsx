"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "next-themes";
import { useFont, type FontChoice } from "@/components/theme/FontProvider";
import { Button } from "@/components/ui/button";
import {
  Search,
  Sun,
  Moon,
  Laptop,
  Menu,
  User as UserIcon,
  LogOut,
  Settings,
  Tv,
  Check,
  Type,
  Palette,
  ExternalLink,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface HeaderProps {
  onToggleSidebar?: () => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export function Header({
  onToggleSidebar,
  searchQuery = "",
  onSearchChange,
}: HeaderProps) {
  const { user, openAuthModal, signout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { font, setFont } = useFont();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const settingsRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click or Escape
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (settingsRef.current && !settingsRef.current.contains(target)) {
        setSettingsOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setUserMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSettingsOpen(false);
        setUserMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const openCommandPalette = () => {
    window.dispatchEvent(new CustomEvent("open-command-palette"));
  };

  const fontOptions: { id: FontChoice; label: string }[] = [
    { id: "system", label: "System Default" },
    { id: "inter", label: "Inter" },
    { id: "outfit", label: "Outfit" },
    { id: "jakarta", label: "Plus Jakarta" },
  ];

  return (
    <header className="sticky top-0 z-40 w-full h-14 border-b border-border bg-background/80 backdrop-blur-md px-4 flex items-center justify-between gap-4 select-none">
      {/* Left: Sidebar Toggle & Brand */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          aria-label="Toggle navigation menu"
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors md:hidden cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>

        <Link href="/" className="flex items-center gap-2 group cursor-pointer">
          <div className="w-7 h-7 rounded-lg bg-[var(--brand)] flex items-center justify-center text-white font-black text-sm tracking-tighter shadow-xs group-hover:scale-105 transition-transform">
            V
          </div>
          <span className="font-bold text-lg tracking-tight text-foreground">
            Vion
          </span>
        </Link>
      </div>

      {/* Middle: Interactive Search Field */}
      <div className="flex-1 max-w-xl mx-2">
        <div
          onClick={openCommandPalette}
          className="relative flex items-center w-full cursor-pointer group"
        >
          <Search className="w-4 h-4 absolute left-3 text-muted-foreground group-hover:text-foreground transition-colors pointer-events-none" />
          <input
            type="text"
            readOnly
            value={searchQuery}
            placeholder="Search titles, channels... (or press Ctrl+K)"
            className="w-full h-9 pl-9 pr-14 rounded-full border border-border bg-card/60 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring transition-all cursor-pointer group-hover:bg-card/90"
          />
          <kbd className="hidden sm:inline-flex items-center text-[10px] font-mono text-muted-foreground bg-muted border border-border px-1.5 py-0.5 rounded-sm absolute right-3 pointer-events-none group-hover:text-foreground transition-colors">
            Ctrl+K
          </kbd>
        </div>
      </div>

      {/* Right: Settings Popover & Account Area */}
      <div className="flex items-center gap-2">
        {/* Settings Popover */}
        <div ref={settingsRef} className="relative">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setSettingsOpen((prev) => !prev);
              setUserMenuOpen(false);
            }}
            aria-label="Interface settings & appearance"
            aria-expanded={settingsOpen}
            className={`rounded-full transition-colors cursor-pointer ${
              settingsOpen
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Settings className="w-4 h-4" />
          </Button>

          <AnimatePresence>
            {settingsOpen && (
              <motion.div
                key="settings-popover"
                initial={{ opacity: 0, scale: 0.96, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -6 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                className="absolute right-0 mt-2 w-72 bg-card border border-border rounded-2xl shadow-2xl p-4 z-50 text-foreground"
              >
                {/* Header */}
                <div className="flex items-center gap-2 pb-3 border-b border-border mb-3">
                  <Palette className="w-4 h-4 text-[var(--brand)]" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Interface Appearance
                  </h3>
                </div>

                {/* Theme Selector */}
                <div className="space-y-1.5 mb-4">
                  <label className="text-[11px] font-semibold text-muted-foreground block">
                    Theme Mode
                  </label>
                  <div className="relative flex p-1 bg-muted rounded-xl">
                    {[
                      { id: "light", label: "Light", icon: Sun },
                      { id: "dark", label: "Dark", icon: Moon },
                      { id: "system", label: "Auto", icon: Laptop },
                    ].map((item) => {
                      const Icon = item.icon;
                      const isSelected = theme === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setTheme(item.id)}
                          className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                            isSelected
                              ? "text-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          <span>{item.label}</span>
                          {isSelected && (
                            <motion.div
                              layoutId="navbar-theme-pill"
                              className="absolute inset-0 bg-card rounded-lg shadow-xs -z-10"
                              transition={{
                                type: "spring",
                                stiffness: 500,
                                damping: 35,
                              }}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Font Selector */}
                <div className="space-y-1.5 mb-4">
                  <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                    <Type className="w-3 h-3" />
                    <span>Typeface</span>
                  </label>
                  <div className="space-y-1">
                    {fontOptions.map((opt) => {
                      const isSelected = font === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setFont(opt.id)}
                          className={`relative w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                            isSelected
                              ? "text-foreground font-semibold"
                              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                          }`}
                        >
                          {isSelected && (
                            <motion.div
                              layoutId="navbar-font-pill"
                              className="absolute inset-0 bg-secondary rounded-lg shadow-2xs -z-10"
                              transition={{
                                type: "spring",
                                stiffness: 500,
                                damping: 35,
                              }}
                            />
                          )}
                          <span className="relative z-10">{opt.label}</span>
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-[var(--brand)] relative z-10 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Full Settings Link */}
                <div className="pt-2 border-t border-border">
                  <Link
                    href="/settings"
                    onClick={() => setSettingsOpen(false)}
                    className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer group"
                  >
                    <span>More account settings</span>
                    <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* User Account Area */}
        {user ? (
          <div ref={userMenuRef} className="relative">
            <button
              onClick={() => {
                setUserMenuOpen((prev) => !prev);
                setSettingsOpen(false);
              }}
              aria-label="User profile menu"
              aria-expanded={userMenuOpen}
              className="flex items-center gap-2 p-1 pl-2 rounded-full border border-border hover:bg-muted transition-colors cursor-pointer"
            >
              <span className="text-xs font-semibold max-w-[100px] truncate hidden sm:inline">
                {user.firstName}
              </span>
              <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs uppercase">
                {user.firstName[0]}
                {user.lastName[0]}
              </div>
            </button>

            {/* User Dropdown Menu */}
            <AnimatePresence>
              {userMenuOpen && (
                <motion.div
                  key="user-dropdown-menu"
                  initial={{ opacity: 0, scale: 0.96, y: -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: -6 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute right-0 mt-2 w-56 bg-card border border-border rounded-2xl shadow-2xl py-1.5 z-50 text-sm overflow-hidden"
                >
                  <div className="px-3.5 py-2.5 border-b border-border">
                    <p className="font-semibold text-foreground truncate">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {user.email}
                    </p>
                  </div>

                  <div className="p-1 space-y-0.5">
                    <Link
                      href="/subscriptions"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
                    >
                      <Tv className="w-4 h-4 text-muted-foreground" />
                      <span>My Subscriptions</span>
                    </Link>

                    <Link
                      href="/settings"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
                    >
                      <Settings className="w-4 h-4 text-muted-foreground" />
                      <span>Account Settings</span>
                    </Link>
                  </div>

                  <div className="border-t border-border p-1">
                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        signout();
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors text-left cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <Button
            size="sm"
            variant="default"
            onClick={() => openAuthModal("signin")}
            className="rounded-full text-xs font-semibold px-4 cursor-pointer active:scale-95 transition-transform"
          >
            <UserIcon className="w-3.5 h-3.5 mr-1.5" />
            Sign In
          </Button>
        )}
      </div>
    </header>
  );
}
