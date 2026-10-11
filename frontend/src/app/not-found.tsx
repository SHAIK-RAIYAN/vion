import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Home, Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[65vh] p-6 text-center select-none">
      <div className="w-16 h-16 rounded-2xl bg-secondary border border-border flex items-center justify-center text-foreground font-black text-2xl tracking-tighter mb-5 shadow-xs">
        404
      </div>

      <h1 className="text-xl font-bold tracking-tight text-foreground mb-2">
        Page Not Found
      </h1>

      <p className="text-xs text-muted-foreground max-w-sm mb-6 leading-relaxed">
        The video, channel, or resource you are looking for does not exist or may have been removed.
      </p>

      <div className="flex items-center gap-3">
        <Link href="/">
          <Button
            variant="default"
            size="sm"
            className="rounded-xl text-xs font-semibold gap-1.5 cursor-pointer active:scale-95 transition-transform"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Return Home</span>
          </Button>
        </Link>

        <Link href="/subscriptions">
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl text-xs font-semibold gap-1.5 cursor-pointer active:scale-95 transition-transform"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Subscriptions</span>
          </Button>
        </Link>
      </div>
    </div>
  );
}
