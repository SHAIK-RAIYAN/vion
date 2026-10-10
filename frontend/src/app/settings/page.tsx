"use client";

import React from "react";
import { useTheme } from "next-themes";
import { useFont, type FontChoice } from "@/components/theme/FontProvider";
import { useAuth } from "@/context/AuthContext";
import { AppShell } from "@/components/navigation/AppShell";
import { Button } from "@/components/ui/button";
import { motion } from "motion/react";
import {
  Moon,
  Sun,
  Laptop,
  Type,
  User as UserIcon,
  LogOut,
  Shield,
  Palette,
  Check,
} from "lucide-react";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { font, setFont } = useFont();
  const { user, signout, openAuthModal } = useAuth();

  const fontOptions: { id: FontChoice; label: string; preview: string }[] = [
    {
      id: "system",
      label: "System Default",
      preview: "Clean native platform typography",
    },
    {
      id: "inter",
      label: "Inter",
      preview: "Contemporary crafted geometric sans-serif",
    },
    {
      id: "outfit",
      label: "Outfit",
      preview: "Modern brand and display typeface",
    },
    {
      id: "jakarta",
      label: "Plus Jakarta Sans",
      preview: "Refined, high-legibility interface font",
    },
  ];

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto py-6 px-4 space-y-8 animate-in fade-in duration-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Settings
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Customize your Vion interface, appearance, and account preferences.
          </p>
        </div>

      {/* 1. Appearance Section */}
      <section className="bg-card border border-border rounded-2xl p-5 space-y-6 shadow-2xs">
        <div className="flex items-center gap-2.5 pb-3 border-b border-border">
          <Palette className="w-4 h-4 text-[var(--brand)]" />
          <h2 className="text-base font-semibold text-foreground">
            Appearance & Themes
          </h2>
        </div>

        {/* Theme Mode Selector */}
        <div>
          <label className="block text-xs font-medium text-foreground mb-2">
            Theme Mode
          </label>
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: "light", label: "Light", icon: Sun },
              { id: "dark", label: "Dark", icon: Moon },
              { id: "system", label: "System", icon: Laptop },
            ].map((item) => {
              const Icon = item.icon;
              const isSelected = theme === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setTheme(item.id)}
                  className={`relative flex flex-col items-center justify-center gap-2 p-3.5 rounded-xl border transition-colors cursor-pointer ${
                    isSelected
                      ? "border-primary text-foreground font-semibold"
                      : "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {isSelected && (
                    <motion.div
                      layoutId="settings-theme-pill"
                      className="absolute inset-0 bg-secondary/80 rounded-xl shadow-xs -z-10"
                      transition={{ type: "spring", stiffness: 500, damping: 35 }}
                    />
                  )}
                  <Icon className="w-5 h-5 relative z-10" />
                  <span className="text-xs relative z-10">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Font Selector */}
        <div>
          <label className="block text-xs font-medium text-foreground mb-2 flex items-center gap-1.5">
            <Type className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Interface Typeface</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {fontOptions.map((opt) => {
              const isSelected = font === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setFont(opt.id)}
                  className={`relative flex items-start justify-between p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                    isSelected
                      ? "border-primary text-foreground font-semibold"
                      : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                  }`}
                >
                  {isSelected && (
                    <motion.div
                      layoutId="settings-font-pill"
                      className="absolute inset-0 bg-secondary/80 rounded-xl shadow-2xs -z-10"
                      transition={{ type: "spring", stiffness: 500, damping: 35 }}
                    />
                  )}
                  <div className="relative z-10">
                    <p className="text-xs font-semibold text-foreground">
                      {opt.label}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {opt.preview}
                    </p>
                  </div>
                  {isSelected && (
                    <Check className="w-4 h-4 text-[var(--brand)] shrink-0 ml-2 relative z-10" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 2. Account Section */}
      <section className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-2xs">
        <div className="flex items-center gap-2.5 pb-3 border-b border-border">
          <Shield className="w-4 h-4 text-[var(--brand)]" />
          <h2 className="text-base font-semibold text-foreground">
            Account Information
          </h2>
        </div>

        {user ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3 rounded-xl bg-muted/40 border border-border/50">
                <span className="text-muted-foreground text-[11px] block">
                  Name
                </span>
                <span className="font-semibold text-foreground text-sm">
                  {user.firstName} {user.lastName}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-muted/40 border border-border/50">
                <span className="text-muted-foreground text-[11px] block">
                  Email
                </span>
                <span className="font-semibold text-foreground text-sm">
                  {user.email}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-muted/40 border border-border/50">
                <span className="text-muted-foreground text-[11px] block">
                  Gender
                </span>
                <span className="font-semibold text-foreground text-sm capitalize">
                  {user.gender.toLowerCase()}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-muted/40 border border-border/50">
                <span className="text-muted-foreground text-[11px] block">
                  Member Since
                </span>
                <span className="font-semibold text-foreground text-sm">
                  {new Date(user.createdAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <Button
                variant="destructive"
                size="sm"
                onClick={signout}
                className="gap-2 text-xs"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out from Vion
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-2 text-muted-foreground">
              <UserIcon className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-1">
              You are currently browsing as a guest
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
              Sign in to manage your channel, subscribe to creators, and track your watch history.
            </p>
            <Button
              size="sm"
              variant="default"
              onClick={() => openAuthModal("signin")}
              className="text-xs font-semibold px-5"
            >
              Sign In to Vion
            </Button>
          </div>
        )}
      </section>
    </div>
    </AppShell>
  );
}
