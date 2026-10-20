"use client";

import React from "react";
import { Header } from "./Header";

interface AppShellProps {
  children: React.ReactNode;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  fullBleed?: boolean;
}

export function AppShell({
  children,
  searchQuery = "",
  onSearchChange,
  fullBleed = false,
}: AppShellProps) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-(--brand) selection:text-white transition-colors duration-300">
      <Header
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
      />
      <main
        className={`flex-1 w-full min-w-0 ${
          fullBleed ? "p-0" : "px-4 md:px-8 py-6"
        }`}
      >
        {children}
      </main>
    </div>
  );
}
