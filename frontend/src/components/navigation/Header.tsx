"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "next-themes";
import { useFont, type FontChoice } from "@/components/theme/FontProvider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { UploadDialog } from "@/components/studio/UploadDialog";
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
  Upload,
  History,
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
  const router = useRouter();
  const { user, openAuthModal, signout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { font, setFont } = useFont();

  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = localSearch.trim();
    if (query) {
      router.push(`/search?q=${encodeURIComponent(query)}`);
    }
  };

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
    <>
      <header className="sticky top-0 z-50 w-full h-14 border-b border-border bg-background/80 backdrop-blur-md px-4 flex items-center justify-between gap-4 select-none">
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

        {/* Middle: Interactive Search Bar */}
        <form
          onSubmit={handleSearchSubmit}
          className="flex-1 max-w-xl mx-2"
        >
          <div className="relative flex items-center w-full group">
            <Search className="w-4 h-4 absolute left-3 text-muted-foreground group-hover:text-foreground transition-colors pointer-events-none" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => {
                setLocalSearch(e.target.value);
                onSearchChange?.(e.target.value);
              }}
              placeholder="Search videos, channels... (or press Ctrl+K)"
              className="w-full h-9 pl-9 pr-14 rounded-full border border-border bg-card/60 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-ring focus:border-ring transition-all group-hover:bg-card/90"
            />
            <button
              type="button"
              onClick={openCommandPalette}
              title="Open Command Palette (Ctrl+K)"
              className="hidden sm:inline-flex items-center text-[10px] font-mono text-muted-foreground bg-muted border border-border px-1.5 py-0.5 rounded-sm absolute right-3 hover:text-foreground cursor-pointer transition-colors"
            >
              Ctrl+K
            </button>
          </div>
        </form>

        {/* Right: Upload, Settings Popover & Account Dropdown */}
        <div className="flex items-center gap-2">
          {/* Creator Upload Action (Authenticated) */}
          {user ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsUploadOpen(true)}
              className="rounded-full text-xs font-semibold gap-1.5 px-3 h-8 border-border hover:border-[var(--brand)]/50"
            >
              <Upload className="w-3.5 h-3.5 text-[var(--brand)]" />
              <span className="hidden sm:inline">Upload</span>
            </Button>
          ) : null}

          {/* Settings & Appearance Popover (shadcn Popover) */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Interface settings & appearance"
                className="rounded-full text-muted-foreground hover:text-foreground h-8 w-8 cursor-pointer"
              >
                <Settings className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-4 text-foreground rounded-2xl shadow-xl">
              <div className="flex items-center gap-2 pb-3 border-b border-border mb-3">
                <Palette className="w-4 h-4 text-[var(--brand)]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Interface Appearance
                </h3>
              </div>

              {/* Theme Mode Selector */}
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
                        className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                          isSelected
                            ? "bg-card text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Font Typeface Selector */}
              <div className="space-y-1.5 mb-4">
                <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                  <Type className="w-3.5 h-3.5" />
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
                        className={`relative w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                          isSelected
                            ? "bg-secondary text-foreground font-semibold shadow-2xs"
                            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                        }`}
                      >
                        <span className="relative z-10">{opt.label}</span>
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 text-[var(--brand)] relative z-10 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Account Settings Link */}
              <div className="pt-2 border-t border-border">
                <Link
                  href="/settings"
                  className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer group"
                >
                  <span>More account settings</span>
                  <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </div>
            </PopoverContent>
          </Popover>

          {/* User Account Dropdown (shadcn DropdownMenu) */}
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="User profile menu"
                  className="flex items-center gap-2 p-1 pl-2 rounded-full border border-border hover:bg-muted transition-colors cursor-pointer outline-hidden"
                >
                  <span className="text-xs font-semibold max-w-[100px] truncate hidden sm:inline">
                    {user.firstName}
                  </span>
                  <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs uppercase">
                    {user.firstName[0]}
                    {user.lastName[0]}
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-2xl p-1.5 shadow-xl">
                <DropdownMenuLabel className="px-2 py-1.5 font-normal">
                  <p className="font-semibold text-xs text-foreground truncate">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {user.email}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                <DropdownMenuItem asChild>
                  <Link
                    href="/subscriptions"
                    className="flex items-center gap-2.5 px-2 py-2 rounded-lg text-xs font-medium cursor-pointer"
                  >
                    <Tv className="w-4 h-4 text-muted-foreground" />
                    <span>My Subscriptions</span>
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                  <Link
                    href="/history"
                    className="flex items-center gap-2.5 px-2 py-2 rounded-lg text-xs font-medium cursor-pointer"
                  >
                    <History className="w-4 h-4 text-muted-foreground" />
                    <span>Watch History</span>
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                  <Link
                    href="/settings"
                    className="flex items-center gap-2.5 px-2 py-2 rounded-lg text-xs font-medium cursor-pointer"
                  >
                    <Settings className="w-4 h-4 text-muted-foreground" />
                    <span>Account Settings</span>
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onClick={() => signout()}
                  className="flex items-center gap-2.5 px-2 py-2 rounded-lg text-xs font-medium text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              size="sm"
              variant="default"
              onClick={() => openAuthModal("signin")}
              className="rounded-full text-xs font-semibold px-4 cursor-pointer active:scale-95 transition-transform h-8"
            >
              <UserIcon className="w-3.5 h-3.5 mr-1.5" />
              Sign In
            </Button>
          )}
        </div>
      </header>

      {/* Video Upload Studio Dialog */}
      <UploadDialog
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
      />
    </>
  );
}
