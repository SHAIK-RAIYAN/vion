"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useAuth } from "@/context/AuthContext";
import { animateModalIn, animateModalOut } from "@/lib/gsap";
import {
  Home,
  Settings,
  Moon,
  Sun,
  Laptop,
  LogIn,
  LogOut,
  Search,
  Tv,
  History,
} from "lucide-react";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const router = useRouter();
  const { setTheme } = useTheme();
  const { user, openAuthModal, signout } = useAuth();

  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    animateModalOut(backdropRef.current, dialogRef.current, () => {
      setOpen(false);
      setSearchValue("");
    });
  }, []);

  useEffect(() => {
    if (open && backdropRef.current && dialogRef.current) {
      animateModalIn(backdropRef.current, dialogRef.current);
    }
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => {
          if (prev) {
            handleClose();
            return false;
          }
          return true;
        });
      }
    };

    const handleCustomOpen = () => {
      setOpen(true);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("open-command-palette", handleCustomOpen);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("open-command-palette", handleCustomOpen);
    };
  }, [handleClose]);

  const runCommand = useCallback(
    (command: () => void) => {
      handleClose();
      command();
    },
    [handleClose],
  );

  const handleSearchSubmit = () => {
    if (searchValue.trim()) {
      runCommand(() => router.push(`/search?q=${encodeURIComponent(searchValue.trim())}`));
    }
  };

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/60 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
      >
        <Command
          className="w-full"
          loop
          onKeyDown={(e) => {
            if (e.key === "Escape") handleClose();
            if (e.key === "Enter" && searchValue.trim()) {
              handleSearchSubmit();
            }
          }}
        >
          <div className="flex items-center border-b border-border px-3">
            <Search className="w-4 h-4 text-muted-foreground mr-2 shrink-0" />
            <Command.Input
              value={searchValue}
              onValueChange={setSearchValue}
              placeholder="Type a command or search videos..."
              className="w-full bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground text-foreground"
              autoFocus
            />
            <kbd className="text-[10px] bg-muted px-1.5 py-0.5 rounded-sm text-muted-foreground font-mono">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-72 overflow-y-auto p-2 text-sm">
            {searchValue.trim() ? (
              <Command.Item
                onSelect={handleSearchSubmit}
                className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer bg-(--brand)/10 text-(--brand) font-semibold mb-1"
              >
                <Search className="w-4 h-4" />
                <span>Search Vion for &ldquo;{searchValue}&rdquo;</span>
              </Command.Item>
            ) : null}

            <Command.Empty className="py-6 text-center text-xs text-muted-foreground">
              No matching commands. Press Enter to search videos.
            </Command.Empty>

            <Command.Group
              heading="Navigation"
              className="text-xs font-semibold text-muted-foreground px-2 py-1.5"
            >
              <Command.Item
                onSelect={() => runCommand(() => router.push("/"))}
                className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-muted text-foreground aria-selected:bg-muted transition-colors"
              >
                <Home className="w-4 h-4 text-muted-foreground" />
                <span>Home Feed</span>
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => router.push("/subscriptions"))}
                className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-muted text-foreground aria-selected:bg-muted transition-colors"
              >
                <Tv className="w-4 h-4 text-muted-foreground" />
                <span>Subscriptions</span>
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => router.push("/history"))}
                className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-muted text-foreground aria-selected:bg-muted transition-colors"
              >
                <History className="w-4 h-4 text-muted-foreground" />
                <span>Watch History</span>
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => router.push("/settings"))}
                className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-muted text-foreground aria-selected:bg-muted transition-colors"
              >
                <Settings className="w-4 h-4 text-muted-foreground" />
                <span>Settings</span>
              </Command.Item>
            </Command.Group>

            <Command.Group
              heading="Theme & Appearance"
              className="text-xs font-semibold text-muted-foreground px-2 py-1.5 mt-2"
            >
              <Command.Item
                onSelect={() => runCommand(() => setTheme("dark"))}
                className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-muted text-foreground aria-selected:bg-muted transition-colors"
              >
                <Moon className="w-4 h-4 text-muted-foreground" />
                <span>Dark Mode</span>
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => setTheme("light"))}
                className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-muted text-foreground aria-selected:bg-muted transition-colors"
              >
                <Sun className="w-4 h-4 text-muted-foreground" />
                <span>Light Mode</span>
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => setTheme("system"))}
                className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-muted text-foreground aria-selected:bg-muted transition-colors"
              >
                <Laptop className="w-4 h-4 text-muted-foreground" />
                <span>System Mode</span>
              </Command.Item>
            </Command.Group>

            <Command.Group
              heading="Account"
              className="text-xs font-semibold text-muted-foreground px-2 py-1.5 mt-2"
            >
              {!user ? (
                <Command.Item
                  onSelect={() => runCommand(() => openAuthModal("signin"))}
                  className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-muted text-foreground aria-selected:bg-muted transition-colors"
                >
                  <LogIn className="w-4 h-4 text-muted-foreground" />
                  <span>Sign In / Register</span>
                </Command.Item>
              ) : (
                <Command.Item
                  onSelect={() => runCommand(() => signout())}
                  className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-destructive/10 text-destructive aria-selected:bg-destructive/10 transition-colors"
                >
                  <LogOut className="w-4 h-4 text-destructive" />
                  <span>Sign Out ({user.email})</span>
                </Command.Item>
              )}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
