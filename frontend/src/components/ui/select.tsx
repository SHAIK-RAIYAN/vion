"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { animateDropdownIn } from "@/lib/gsap";

interface SelectContextValue {
  value: string;
  onValueChange: (val: string) => void;
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  labels: Record<string, React.ReactNode>;
  registerLabel: (val: string, label: React.ReactNode) => void;
}

const SelectContext = createContext<SelectContextValue | null>(null);

export function Select({
  value,
  onValueChange,
  children,
  defaultValue = "",
}: {
  value?: string;
  onValueChange?: (val: string) => void;
  defaultValue?: string;
  children: React.ReactNode;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [labels, setLabels] = useState<Record<string, React.ReactNode>>({});

  const currentValue = value !== undefined ? value : internalValue;

  const handleValueChange = (newVal: string) => {
    if (value === undefined) setInternalValue(newVal);
    onValueChange?.(newVal);
    setOpen(false);
  };

  const registerLabel = (val: string, label: React.ReactNode) => {
    setLabels((prev) => (prev[val] === label ? prev : { ...prev, [val]: label }));
  };

  return (
    <SelectContext.Provider
      value={{
        value: currentValue,
        onValueChange: handleValueChange,
        open,
        setOpen,
        labels,
        registerLabel,
      }}
    >
      <div className="relative w-full">{children}</div>
    </SelectContext.Provider>
  );
}

export function SelectTrigger({
  className,
  placeholder = "Select an option",
  children,
}: {
  className?: string;
  placeholder?: string;
  children?: React.ReactNode;
}) {
  const ctx = useContext(SelectContext);
  if (!ctx) throw new Error("SelectTrigger must be used within Select");

  return (
    <button
      type="button"
      onClick={() => ctx.setOpen((prev) => !prev)}
      aria-expanded={ctx.open}
      className={cn(
        "flex h-9 w-full items-center justify-between rounded-lg border border-border bg-card px-3 py-1 text-sm text-foreground shadow-2xs transition-all",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring hover:border-foreground/30 cursor-pointer",
        ctx.open && "ring-1 ring-ring border-ring",
        className,
      )}
    >
      <span className="truncate">
        {children ?? (ctx.value ? ctx.labels[ctx.value] ?? ctx.value : placeholder)}
      </span>
      <ChevronDown
        className={cn(
          "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
          ctx.open && "rotate-180 text-foreground",
        )}
      />
    </button>
  );
}

export function SelectContent({
  children,
  className,
  align = "start",
}: {
  children: React.ReactNode;
  className?: string;
  align?: "start" | "end";
}) {
  const ctx = useContext(SelectContext);
  const contentRef = useRef<HTMLDivElement>(null);

  if (!ctx) throw new Error("SelectContent must be used within Select");

  useEffect(() => {
    if (!ctx.open) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (contentRef.current && !contentRef.current.parentElement?.contains(e.target as Node)) {
        ctx.setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        ctx.setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [ctx]);

  useEffect(() => {
    if (ctx.open && contentRef.current) {
      animateDropdownIn(contentRef.current);
    }
  }, [ctx.open]);

  if (!ctx.open) return null;

  return (
    <div
      ref={contentRef}
      className={cn(
        "absolute z-50 mt-1 min-w-[8rem] w-full overflow-hidden rounded-xl border border-border bg-card p-1 text-foreground shadow-xl",
        align === "end" ? "right-0" : "left-0",
        className,
      )}
    >
      <div className="max-h-60 overflow-y-auto space-y-0.5">{children}</div>
    </div>
  );
}

export function SelectItem({
  value,
  children,
  className,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ctx = useContext(SelectContext);
  if (!ctx) throw new Error("SelectItem must be used within Select");

  useEffect(() => {
    ctx.registerLabel(value, children);
  }, [value, children, ctx]);

  const isSelected = ctx.value === value;

  return (
    <button
      type="button"
      onClick={() => ctx.onValueChange(value)}
      className={cn(
        "relative flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium outline-none transition-colors cursor-pointer",
        isSelected
          ? "bg-secondary text-foreground font-semibold"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      <span className="truncate">{children}</span>
      {isSelected && <Check className="h-3.5 w-3.5 text-(--brand) shrink-0 ml-2" />}
    </button>
  );
}
