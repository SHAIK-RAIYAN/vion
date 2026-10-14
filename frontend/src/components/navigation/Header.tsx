"use client";

import React, { useState, useEffect } from "react";
import { useCurtainTransition, CurtainLink } from "@/components/transitions";
import { usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useViewMode } from "@/context/ViewModeContext";
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
  Layers,
  LayoutGrid,
  Compass,
} from "lucide-react";

interface HeaderProps {
  onToggleSidebar?: () => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export function Header({
  searchQuery = "",
  onSearchChange,
}: HeaderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, isLoading, openAuthModal, signout } = useAuth();
  const { transitionTo } = useCurtainTransition();
  const { viewMode, setViewMode } = useViewMode();
  const { theme, setTheme } = useTheme();
  const { font, setFont } = useFont();

  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);

  // Sync incoming search query
  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  // Determine active feed or navigation item
  const currentFeedParam = searchParams.get("feed");
  const isSubscriptionsActive =
    currentFeedParam === "subscriptions" || pathname === "/subscriptions";
  const isHistoryActive = pathname === "/history";
  const isDiscoverActive =
    (pathname === "/" || pathname === "") &&
    !isSubscriptionsActive &&
    !isHistoryActive;

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = localSearch.trim();
    if (query) {
      transitionTo(`/search?q=${encodeURIComponent(query)}`);
    }
  };

  const openCommandPalette = () => {
    window.dispatchEvent(new CustomEvent("open-command-palette"));
  };

  const handleSubscriptionsClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!user) {
      openAuthModal("signin");
      return;
    }
    transitionTo("/?feed=subscriptions");
  };

  const handleDiscoverClick = (e: React.MouseEvent) => {
    e.preventDefault();
    transitionTo("/");
  };

  const fontOptions: { id: FontChoice; label: string }[] = [
    { id: "system", label: "System Default" },
    { id: "inter", label: "Inter" },
    { id: "outfit", label: "Outfit" },
    { id: "jakarta", label: "Plus Jakarta" },
  ];

  return (
    <>
      <header className="sticky top-0 z-50 w-full h-14 bg-black/85 backdrop-blur-xl px-4 md:px-7 flex items-center justify-between gap-4 select-none transition-colors">
        {/* =========================================================================
            LEFT AREA: Custom VION Wordmark
            ========================================================================= */}
        <div className="flex items-center shrink-0">
          <CurtainLink
            href="/"
            onClick={handleDiscoverClick}
            className="group flex items-center gap-2 cursor-pointer focus:outline-hidden"
            aria-label="Vion Home"
          >
            <span className="font-black text-sm tracking-[0.32em] text-white uppercase group-hover:text-white transition-all pl-0.5">
              VION
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#ff3c00] group-hover:scale-125 transition-transform shadow-[0_0_8px_#ff3c00]" />
          </CurtainLink>
        </div>

        {/* =========================================================================
            CENTER AREA: Search Bar + Subscriptions + History Navigation
            ========================================================================= */}
        <div className="flex-1 max-w-2xl mx-auto flex items-center justify-center gap-2 sm:gap-4 min-w-0">
          {/* Minimal Search Capsule */}
          <form
            onSubmit={handleSearchSubmit}
            className={`transition-all duration-300 ${
              searchExpanded ? "flex-1 max-w-md" : "w-36 sm:w-56 md:w-64"
            }`}
          >
            <div className="relative flex items-center w-full group">
              <Search className="w-3.5 h-3.5 absolute left-3 text-neutral-400 group-hover:text-white transition-colors pointer-events-none" />
              <input
                type="text"
                value={localSearch}
                onFocus={() => setSearchExpanded(true)}
                onBlur={() => setSearchExpanded(false)}
                onChange={(e) => {
                  setLocalSearch(e.target.value);
                  onSearchChange?.(e.target.value);
                }}
                placeholder="Search wallpapers... (Ctrl+K)"
                className="w-full h-8 pl-8 pr-12 rounded-full border border-white/8 bg-neutral-900/60 text-xs text-white placeholder:text-neutral-500 focus:outline-hidden focus:border-white/20 focus:bg-neutral-900/90 transition-all"
              />
              <button
                type="button"
                onClick={openCommandPalette}
                title="Open Command Palette (Ctrl+K)"
                className="hidden md:inline-flex items-center text-[9px] font-mono text-neutral-400 bg-white/5 border border-white/10 px-1 py-0.5 rounded absolute right-2.5 hover:text-white cursor-pointer transition-colors"
              >
                ⌘K
              </button>
            </div>
          </form>

          {/* Primary Feed Navigation Buttons */}
          <nav
            aria-label="Feed Navigation"
            className="flex items-center gap-1 sm:gap-1.5 shrink-0"
          >
            {/* Discover / All Wallpapers Feed */}
            <button
              type="button"
              onClick={handleDiscoverClick}
              className={`relative px-2.5 sm:px-3 py-1.5 rounded-full text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
                isDiscoverActive
                  ? "text-white font-medium bg-white/8"
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-white/4"
              }`}
            >
              <Compass className="w-3.5 h-3.5 opacity-70" />
              <span className="hidden sm:inline">Discover</span>
            </button>

            {/* Subscriptions Feed (Functional Control with Signature Red-Orange Accent) */}
            <button
              type="button"
              onClick={handleSubscriptionsClick}
              className={`relative px-2.5 sm:px-3 py-1.5 rounded-full text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
                isSubscriptionsActive
                  ? "text-[#ff3c00] font-semibold bg-[#ff3c00]/10 shadow-[0_0_12px_rgba(255,60,0,0.2)]"
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-white/4"
              }`}
            >
              <Tv className="w-3.5 h-3.5" />
              <span>Subscriptions</span>
              {isSubscriptionsActive && (
                <span className="w-1 h-1 rounded-full bg-[#ff3c00]" />
              )}
            </button>

            {/* Watch History */}
            <CurtainLink
              href="/history"
              className={`relative px-2.5 sm:px-3 py-1.5 rounded-full text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
                isHistoryActive
                  ? "text-white font-medium bg-white/8"
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-white/4"
              }`}
            >
              <History className="w-3.5 h-3.5 opacity-70" />
              <span className="hidden md:inline">History</span>
            </CurtainLink>
          </nav>
        </div>

        {/* =========================================================================
            RIGHT AREA: View Mode Toggle + Upload + Settings + Account
            ========================================================================= */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Dedicated View-Mode Toggle (Stacked vs Grid) */}
          <div
            role="group"
            aria-label="Wallpaper view mode"
            className="flex items-center p-0.5 rounded-full bg-neutral-900/80 border border-white/8 shadow-inner"
          >
            <button
              type="button"
              onClick={() => setViewMode("stacked")}
              title="Cinematic Stacked View (Default)"
              aria-pressed={viewMode === "stacked"}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] transition-all cursor-pointer ${
                viewMode === "stacked"
                  ? "bg-white text-black font-semibold shadow-xs"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <Layers className="w-3 h-3" />
              <span className="hidden lg:inline">Stack</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              title="Responsive Gallery Grid"
              aria-pressed={viewMode === "grid"}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] transition-all cursor-pointer ${
                viewMode === "grid"
                  ? "bg-white text-black font-semibold shadow-xs"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <LayoutGrid className="w-3 h-3" />
              <span className="hidden lg:inline">Grid</span>
            </button>
          </div>

          {/* Creator Upload Action (Authenticated) */}
          {user ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsUploadOpen(true)}
              className="rounded-full text-xs font-semibold gap-1.5 px-3 h-7.5 border-white/10 bg-transparent text-white hover:bg-white/5 hover:border-[#ff3c00]/50"
            >
              <Upload className="w-3 h-3 text-[#ff3c00]" />
              <span className="hidden sm:inline">Upload</span>
            </Button>
          ) : null}

          {/* Interface Appearance & Settings Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Interface appearance"
                className="rounded-full text-neutral-400 hover:text-white hover:bg-white/5 h-8 w-8 flex items-center justify-center cursor-pointer transition-colors"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-72 p-4 text-foreground bg-neutral-950 border border-white/10 rounded-2xl shadow-2xl"
            >
              <div className="flex items-center gap-2 pb-3 border-b border-white/10 mb-3">
                <Palette className="w-4 h-4 text-[#ff3c00]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                  Interface Appearance
                </h3>
              </div>

              {/* Theme Mode Selector */}
              <div className="space-y-1.5 mb-4">
                <label className="text-[11px] font-semibold text-neutral-400 block">
                  Theme Mode
                </label>
                <div className="relative flex p-1 bg-neutral-900 rounded-xl">
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
                            ? "bg-black text-white shadow-xs"
                            : "text-neutral-400 hover:text-white"
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
                <label className="text-[11px] font-semibold text-neutral-400 flex items-center gap-1">
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
                            ? "bg-neutral-800 text-white font-semibold"
                            : "text-neutral-400 hover:bg-neutral-900 hover:text-white"
                        }`}
                      >
                        <span className="relative z-10">{opt.label}</span>
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 text-[#ff3c00] relative z-10 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Account Settings Link */}
              <div className="pt-2 border-t border-white/10">
                <CurtainLink
                  href="/settings"
                  className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold text-neutral-400 hover:bg-neutral-900 hover:text-white transition-colors cursor-pointer group"
                >
                  <span>More account settings</span>
                  <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </CurtainLink>
              </div>
            </PopoverContent>
          </Popover>

          {/* User Account / Sign In */}
          {isLoading ? (
            <div
              aria-label="Checking account status"
              className="flex items-center gap-2 h-8 px-3 rounded-full border border-white/10 bg-neutral-900/50 animate-pulse select-none"
            >
              <div className="w-4 h-4 rounded-full bg-neutral-700 shrink-0" />
              <div className="w-10 h-2.5 rounded bg-neutral-800 hidden sm:block" />
            </div>
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="User profile menu"
                  className="flex items-center gap-2 p-0.5 pl-2 rounded-full border border-white/10 hover:border-white/20 hover:bg-neutral-900 transition-colors cursor-pointer outline-hidden"
                >
                  <span className="text-xs font-medium max-w-[90px] truncate hidden sm:inline text-neutral-300">
                    {user.firstName}
                  </span>
                  <div className="w-7 h-7 rounded-full bg-white text-black flex items-center justify-center font-bold text-[11px] uppercase shadow-sm">
                    {user.firstName[0]}
                    {user.lastName[0]}
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 rounded-2xl p-1.5 shadow-2xl bg-neutral-950 border border-white/10 text-white"
              >
                <DropdownMenuLabel className="px-2 py-1.5 font-normal">
                  <p className="font-semibold text-xs text-white truncate">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="text-[11px] text-neutral-400 truncate">
                    {user.email}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-white/10" />

                <DropdownMenuItem asChild>
                  <CurtainLink
                    href="/?feed=subscriptions"
                    className="flex items-center gap-2.5 px-2 py-2 rounded-lg text-xs font-medium cursor-pointer text-neutral-300 hover:text-white"
                  >
                    <Tv className="w-4 h-4 text-neutral-400" />
                    <span>Subscriptions Stream</span>
                  </CurtainLink>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                  <CurtainLink
                    href="/history"
                    className="flex items-center gap-2.5 px-2 py-2 rounded-lg text-xs font-medium cursor-pointer text-neutral-300 hover:text-white"
                  >
                    <History className="w-4 h-4 text-neutral-400" />
                    <span>Watch History</span>
                  </CurtainLink>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                  <CurtainLink
                    href="/settings"
                    className="flex items-center gap-2.5 px-2 py-2 rounded-lg text-xs font-medium cursor-pointer text-neutral-300 hover:text-white"
                  >
                    <Settings className="w-4 h-4 text-neutral-400" />
                    <span>Account Settings</span>
                  </CurtainLink>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="bg-white/10" />

                <DropdownMenuItem
                  onClick={() => signout()}
                  className="flex items-center gap-2.5 px-2 py-2 rounded-lg text-xs font-medium text-red-400 focus:text-red-300 focus:bg-red-500/10 cursor-pointer"
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
              className="rounded-full text-xs font-semibold px-4 cursor-pointer active:scale-95 transition-transform h-7.5 bg-white text-black hover:bg-neutral-200"
            >
              <UserIcon className="w-3.5 h-3.5 mr-1" />
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
