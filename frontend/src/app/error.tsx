"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AlertCircle, RotateCcw, Home } from "lucide-react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log unexpected errors safely on client
    console.error("[Vion Runtime Error]:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[65vh] p-6 text-center select-none">
      <div className="w-14 h-14 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive mb-5 shadow-xs">
        <AlertCircle className="w-7 h-7" />
      </div>

      <h1 className="text-xl font-bold tracking-tight text-foreground mb-2">
        Something went wrong
      </h1>

      <p className="text-xs text-muted-foreground max-w-sm mb-6 leading-relaxed">
        {error.message ||
          "An unexpected application error occurred while loading this page. You can try refreshing or returning to the home feed."}
      </p>

      <div className="flex items-center gap-3">
        <Button
          onClick={() => reset()}
          variant="outline"
          size="sm"
          className="rounded-xl text-xs font-semibold gap-1.5 cursor-pointer active:scale-95 transition-transform"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Try Again</span>
        </Button>

        <Link href="/">
          <Button
            variant="default"
            size="sm"
            className="rounded-xl text-xs font-semibold gap-1.5 cursor-pointer active:scale-95 transition-transform"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Go Home</span>
          </Button>
        </Link>
      </div>
    </div>
  );
}
