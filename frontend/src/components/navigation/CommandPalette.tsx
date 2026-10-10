"use client";

import React, { useEffect, useState } from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useAuth } from "@/context/AuthContext";
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
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
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
                className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-muted text-foreground aria-selected:bg-muted"
              >
                <Home className="w-4 h-4 text-muted-foreground" />
                <span>Home Feed</span>
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => router.push("/subscriptions"))}
                className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-muted text-foreground aria-selected:bg-muted"
              >
                <Tv className="w-4 h-4 text-muted-foreground" />
                <span>Subscriptions</span>
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => router.push("/settings"))}
                className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-muted text-foreground aria-selected:bg-muted"
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
                className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-muted text-foreground aria-selected:bg-muted"
              >
                <Moon className="w-4 h-4 text-muted-foreground" />
                <span>Dark Mode</span>
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => setTheme("light"))}
                className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-muted text-foreground aria-selected:bg-muted"
              >
                <Sun className="w-4 h-4 text-muted-foreground" />
                <span>Light Mode</span>
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => setTheme("system"))}
                className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-muted text-foreground aria-selected:bg-muted"
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
                  className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-muted text-foreground aria-selected:bg-muted"
                >
                  <LogIn className="w-4 h-4 text-muted-foreground" />
                  <span>Sign In / Register</span>
                </Command.Item>
              ) : (
                <Command.Item
                  onSelect={() => runCommand(() => signout())}
                  className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-destructive/10 text-destructive aria-selected:bg-destructive/10"
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
