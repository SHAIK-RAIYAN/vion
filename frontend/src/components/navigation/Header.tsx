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
import { VionLogo } from "./VionLogo";
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
  ChevronDown,
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
      <header className="sticky top-0 z-50 w-full h-14 bg-white/85 dark:bg-black/85 backdrop-blur-xl border-b border-black/6 dark:border-white/10 px-4 md:px-7 flex items-center justify-between gap-4 select-none transition-colors">
        {/* =========================================================================
            LEFT AREA: Custom VION Wordmark
            ========================================================================= */}
        <div className="flex items-center shrink-0">
          <CurtainLink
            href="/"
            onClick={handleDiscoverClick}
            className="group flex items-center cursor-pointer focus:outline-hidden"
            aria-label="Vion Home"
          >
            <VionLogo />
          </CurtainLink>
        </div>

        {/* =========================================================================
            CENTER AREA: Search Bar + Subscriptions + History Navigation
            ========================================================================= */}
        <div className="flex-1 max-w-2xl mx-auto flex items-center justify-center gap-2 sm:gap-4 min-w-0">
          {/* Refined Search Capsule (Stable Width & Seamless Alignment) */}
          <form
            onSubmit={handleSearchSubmit}
            className="w-40 sm:w-56 md:w-64 lg:w-72 shrink min-w-0 transition-colors"
          >
            <div className="relative flex items-center w-full group">
              <Search className="w-3.5 h-3.5 absolute left-3 text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-white transition-colors pointer-events-none" />
              <input
                type="text"
                value={localSearch}
                onChange={(e) => {
                  setLocalSearch(e.target.value);
                  onSearchChange?.(e.target.value);
                }}
                placeholder="Search wallpapers..."
                className="w-full h-8 pl-8 pr-14 rounded-full border border-black/10 dark:border-white/10 bg-neutral-100/80 dark:bg-neutral-900/60 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-hidden focus:border-black/25 dark:focus:border-white/25 focus:bg-white dark:focus:bg-neutral-900/95 focus:ring-1 focus:ring-black/10 dark:focus:ring-white/15 transition-all truncate"
              />
              <kbd
                onClick={openCommandPalette}
                title="Search Wallpapers (Ctrl + K)"
                className="hidden sm:inline-flex items-center gap-1 absolute right-2.5 top-1/2 -translate-y-1/2 h-5 px-1.5 rounded border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 font-mono text-[10px] text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer select-none transition-colors"
              >
                <span className="text-[9px]">Ctrl</span>
                <span className="font-semibold text-[10px] text-neutral-700 dark:text-neutral-300">K</span>
              </kbd>
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
                  ? "text-neutral-900 dark:text-white font-medium bg-black/6 dark:bg-white/8"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-black/4 dark:hover:bg-white/4"
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
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-black/4 dark:hover:bg-white/4"
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
                  ? "text-neutral-900 dark:text-white font-medium bg-black/6 dark:bg-white/8"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-black/4 dark:hover:bg-white/4"
              }`}
            >
              <History className="w-3.5 h-3.5 opacity-70" />
              <span className="hidden md:inline">History</span>
            </CurtainLink>
          </nav>
        </div>

        {/* =========================================================================
            RIGHT AREA: View Mode Dropdown + Upload + Settings + Account
            ========================================================================= */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Shadcn View Mode Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-100/90 dark:bg-neutral-900/80 border border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/80 dark:hover:bg-neutral-800/80 transition-all cursor-pointer shadow-xs focus:outline-hidden"
                title="Select view layout"
              >
                {viewMode === "stacked" ? (
                  <Layers className="w-3.5 h-3.5 text-neutral-700 dark:text-neutral-300" />
                ) : (
                  <LayoutGrid className="w-3.5 h-3.5 text-neutral-700 dark:text-neutral-300" />
                )}
                <span>View</span>
                <ChevronDown className="w-3 h-3 text-neutral-500 dark:text-neutral-400 ml-0.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-36 bg-white/95 dark:bg-neutral-950/95 border-black/10 dark:border-white/10 backdrop-blur-xl p-1 text-neutral-900 dark:text-white shadow-2xl"
            >
              <DropdownMenuItem
                onSelect={() => setViewMode("stacked")}
                className={`flex items-center justify-between text-xs py-2 px-2.5 rounded-lg cursor-pointer ${
                  viewMode === "stacked"
                    ? "bg-black/10 dark:bg-white/10 text-neutral-900 dark:text-white font-semibold"
                    : "text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5" />
                  <span>Stack</span>
                </div>
                {viewMode === "stacked" && (
                  <Check className="w-3.5 h-3.5 text-[#ff3c00]" />
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setViewMode("grid")}
                className={`flex items-center justify-between text-xs py-2 px-2.5 rounded-lg cursor-pointer ${
                  viewMode === "grid"
                    ? "bg-black/10 dark:bg-white/10 text-neutral-900 dark:text-white font-semibold"
                    : "text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                <div className="flex items-center gap-2">
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Grid</span>
                </div>
                {viewMode === "grid" && (
                  <Check className="w-3.5 h-3.5 text-[#ff3c00]" />
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Creator Upload Action */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (user) {
                setIsUploadOpen(true);
              } else {
                openAuthModal("signin");
              }
            }}
            className="rounded-full text-xs font-semibold gap-1.5 px-3 h-7.5 border-black/10 dark:border-white/10 bg-transparent text-neutral-900 dark:text-white hover:bg-black/5 dark:hover:bg-white/5 hover:border-[#ff3c00]/50 cursor-pointer"
          >
            <Upload className="w-3 h-3 text-[#ff3c00]" />
            <span className="hidden sm:inline">Upload</span>
          </Button>

          {/* Interface Appearance & Settings Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Interface appearance"
                className="rounded-full text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 h-8 w-8 flex items-center justify-center cursor-pointer transition-colors"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-72 p-4 text-foreground bg-white dark:bg-neutral-950 border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl"
            >
              <div className="flex items-center gap-2 pb-3 border-b border-black/10 dark:border-white/10 mb-3">
                <Palette className="w-4 h-4 text-[#ff3c00]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Interface Appearance
                </h3>
              </div>

              {/* Theme Mode Selector */}
              <div className="space-y-1.5 mb-4">
                <label className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 block">
                  Theme Mode
                </label>
                <div className="relative flex p-1 bg-neutral-100 dark:bg-neutral-900 rounded-xl">
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
                            ? "bg-white dark:bg-black text-neutral-900 dark:text-white shadow-xs"
                            : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
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
                <label className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 flex items-center gap-1">
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
                            ? "bg-neutral-200 dark:bg-neutral-800 text-neutral-900 dark:text-white font-semibold"
                            : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900 hover:text-neutral-900 dark:hover:text-white"
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
              <div className="pt-2 border-t border-black/10 dark:border-white/10">
                <CurtainLink
                  href="/settings"
                  className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer group"
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
              className="flex items-center gap-2 h-8 px-3 rounded-full border border-black/10 dark:border-white/10 bg-neutral-100/50 dark:bg-neutral-900/50 animate-pulse select-none"
            >
              <div className="w-4 h-4 rounded-full bg-neutral-300 dark:bg-neutral-700 shrink-0" />
              <div className="w-10 h-2.5 rounded bg-neutral-200 dark:bg-neutral-800 hidden sm:block" />
            </div>
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="User profile menu"
                  className="flex items-center gap-2 p-0.5 pl-2 rounded-full border border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors cursor-pointer outline-hidden"
                >
                  <span className="text-xs font-medium max-w-[90px] truncate hidden sm:inline text-neutral-700 dark:text-neutral-300">
                    {user.firstName}
                  </span>
                  <div className="w-7 h-7 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-black flex items-center justify-center font-bold text-[11px] uppercase shadow-sm">
                    {user.firstName[0]}
                    {user.lastName[0]}
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 rounded-2xl p-1.5 shadow-2xl bg-white dark:bg-neutral-950 border border-black/10 dark:border-white/10 text-neutral-900 dark:text-white"
              >
                <DropdownMenuLabel className="px-2 py-1.5 font-normal">
                  <p className="font-semibold text-xs text-neutral-900 dark:text-white truncate">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                    {user.email}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-black/10 dark:bg-white/10" />

                <DropdownMenuItem asChild>
                  <CurtainLink
                    href="/?feed=subscriptions"
                    className="flex items-center gap-2.5 px-2 py-2 rounded-lg text-xs font-medium cursor-pointer text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white"
                  >
                    <Tv className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
                    <span>Subscriptions Stream</span>
                  </CurtainLink>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                  <CurtainLink
                    href="/history"
                    className="flex items-center gap-2.5 px-2 py-2 rounded-lg text-xs font-medium cursor-pointer text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white"
                  >
                    <History className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
                    <span>Watch History</span>
                  </CurtainLink>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                  <CurtainLink
                    href="/settings"
                    className="flex items-center gap-2.5 px-2 py-2 rounded-lg text-xs font-medium cursor-pointer text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white"
                  >
                    <Settings className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
                    <span>Account Settings</span>
                  </CurtainLink>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="bg-black/10 dark:bg-white/10" />

                <DropdownMenuItem
                  onClick={() => signout()}
                  className="flex items-center gap-2.5 px-2 py-2 rounded-lg text-xs font-medium text-red-500 hover:text-red-600 focus:text-red-600 focus:bg-red-500/10 cursor-pointer"
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
              className="rounded-full text-xs font-semibold px-4 cursor-pointer active:scale-95 transition-transform h-7.5 bg-neutral-900 dark:bg-white text-white dark:text-black hover:bg-neutral-800 dark:hover:bg-neutral-200"
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
