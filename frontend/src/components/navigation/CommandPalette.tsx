"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useAuth } from "@/context/AuthContext";
import { motion, AnimatePresence } from "motion/react";
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
} from "lucide-react";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { setTheme } = useTheme();
  const { user, openAuthModal, signout } = useAuth();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
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
  }, []);

  const runCommand = useCallback((command: () => void) => {
    setOpen(false);
    command();
  }, []);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="command-palette-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/60 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <motion.div
            key="command-palette-dialog"
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
          >
            <Command
              className="w-full"
              loop
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
              }}
            >
              <div className="flex items-center border-b border-border px-3">
                <Search className="w-4 h-4 text-muted-foreground mr-2 shrink-0" />
                <Command.Input
                  placeholder="Type a command or search..."
                  className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground text-foreground"
                  autoFocus
                />
                <kbd className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-mono">
                  ESC
                </kbd>
              </div>

              <Command.List className="max-h-72 overflow-y-auto p-2 text-sm">
                <Command.Empty className="py-6 text-center text-xs text-muted-foreground">
                  No results found.
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
