"use client";

import React, { useState } from "react";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

interface AppShellProps {
  children: React.ReactNode;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export function AppShell({
  children,
  searchQuery = "",
  onSearchChange,
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
      />
      <div className="flex-1 flex min-w-0">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 min-w-0 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
