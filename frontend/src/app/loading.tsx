import React from "react";

export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-4 select-none">
      <div className="relative flex items-center justify-center mb-4">
        {/* Pulsing subtle backdrop glow */}
        <div className="absolute w-12 h-12 rounded-full bg-[var(--brand)]/20 animate-ping opacity-75 pointer-events-none" />
        <div className="relative w-10 h-10 rounded-xl bg-[var(--brand)] flex items-center justify-center text-white font-black text-base shadow-lg animate-pulse">
          V
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-widest">
        <span>Loading</span>
        <span className="inline-flex space-x-0.5">
          <span className="animate-bounce delay-75">.</span>
          <span className="animate-bounce delay-150">.</span>
          <span className="animate-bounce delay-300">.</span>
        </span>
      </div>
    </div>
  );
}
