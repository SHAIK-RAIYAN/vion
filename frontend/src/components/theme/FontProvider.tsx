"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type FontChoice = "system" | "inter" | "outfit" | "jakarta";

interface FontContextType {
  font: FontChoice;
  setFont: (font: FontChoice) => void;
}

const FontContext = createContext<FontContextType>({
  font: "system",
  setFont: () => {},
});

const FONT_MAP: Record<FontChoice, string> = {
  system: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  inter: "'Inter', system-ui, sans-serif",
  outfit: "'Outfit', system-ui, sans-serif",
  jakarta: "'Plus Jakarta Sans', system-ui, sans-serif",
};

export function FontProvider({ children }: { children: React.ReactNode }) {
  const [font, setFontState] = useState<FontChoice>("system");

  useEffect(() => {
    const saved = localStorage.getItem("vion_font_preference") as FontChoice;
    if (saved && FONT_MAP[saved]) {
      setFontState(saved);
      document.documentElement.style.setProperty("--font-app", FONT_MAP[saved]);
    }
  }, []);

  const setFont = (newFont: FontChoice) => {
    setFontState(newFont);
    localStorage.setItem("vion_font_preference", newFont);
    document.documentElement.style.setProperty("--font-app", FONT_MAP[newFont]);
  };

  return (
    <FontContext.Provider value={{ font, setFont }}>
      {children}
    </FontContext.Provider>
  );
}

export function useFont() {
  return useContext(FontContext);
}
