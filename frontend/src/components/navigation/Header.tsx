"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  Search,
  Sun,
  Moon,
  Menu,
  User as UserIcon,
  LogOut,
  Settings,
  Tv,
} from "lucide-react";

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
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <header className="sticky top-0 z-40 w-full h-14 border-b border-border bg-background/80 backdrop-blur-md px-4 flex items-center justify-between gap-4">
      {/* Left: Sidebar Toggle & Brand */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          aria-label="Toggle navigation menu"
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors md:hidden"
        >
          <Menu className="w-5 h-5" />
        </button>

        <Link href="/" className="flex items-center gap-2 select-none group">
          <div className="w-7 h-7 rounded-lg bg-[var(--brand)] flex items-center justify-center text-white font-black text-sm tracking-tighter shadow-xs group-hover:scale-105 transition-transform">
            V
          </div>
          <span className="font-bold text-lg tracking-tight text-foreground">
            Vion
          </span>
        </Link>
      </div>

      {/* Middle: Search Field */}
      <div className="flex-1 max-w-xl mx-2">
        <div className="relative flex items-center w-full">
          <Search className="w-4 h-4 absolute left-3 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder="Search titles, channels... (or press Ctrl+K)"
            className="w-full h-9 pl-9 pr-12 rounded-full border border-border bg-card/60 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring transition-all"
          />
          <kbd className="hidden sm:inline-flex items-center text-[10px] font-mono text-muted-foreground bg-muted border border-border px-1.5 py-0.5 rounded absolute right-3 pointer-events-none">
            Ctrl+K
          </kbd>
        </div>
      </div>

      {/* Right: Theme Toggle & Account Area */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label="Toggle dark/light theme"
          className="rounded-full text-muted-foreground hover:text-foreground"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>

        {user ? (
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen((prev) => !prev)}
              className="flex items-center gap-2 p-1 pl-2 rounded-full border border-border hover:bg-muted transition-colors"
            >
              <span className="text-xs font-semibold max-w-[100px] truncate hidden sm:inline">
                {user.firstName}
              </span>
              <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs uppercase">
                {user.firstName[0]}
                {user.lastName[0]}
              </div>
            </button>

            {/* Dropdown Menu */}
            {userMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setUserMenuOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-56 bg-card border border-border rounded-xl shadow-xl py-1.5 z-50 text-sm animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="font-semibold text-foreground truncate">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {user.email}
                    </p>
                  </div>

                  <Link
                    href="/subscriptions"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-foreground hover:bg-muted transition-colors"
                  >
                    <Tv className="w-4 h-4 text-muted-foreground" />
                    <span>My Subscriptions</span>
                  </Link>

                  <Link
                    href="/settings"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-foreground hover:bg-muted transition-colors"
                  >
                    <Settings className="w-4 h-4 text-muted-foreground" />
                    <span>Settings</span>
                  </Link>

                  <div className="border-t border-border mt-1 pt-1">
                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        signout();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-destructive hover:bg-destructive/10 transition-colors text-left"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <Button
            size="sm"
            variant="default"
            onClick={() => openAuthModal("signin")}
            className="rounded-full text-xs font-semibold px-4"
          >
            <UserIcon className="w-3.5 h-3.5 mr-1.5" />
            Sign In
          </Button>
        )}
      </div>
    </header>
  );
}
