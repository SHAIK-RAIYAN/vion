"use client";

import React, { useState } from "react";
import { useTheme } from "next-themes";
import { useFont, type FontChoice } from "@/components/theme/FontProvider";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { AppShell } from "@/components/navigation/AppShell";
import ReusableErrorBoundary from "@/components/ReusableErrorBoundary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  KeyRound,
  Loader2,
  Edit2,
} from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { font, setFont } = useFont();
  const { user, signout, openAuthModal, refreshUser } = useAuth();

  // Profile Edit State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Password Change State
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);

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

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("Please fill in first and last name.");
      return;
    }

    setIsSavingProfile(true);
    try {
      await api.users.updateMe({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      await refreshUser();
      setIsEditingProfile(false);
      toast.success("Profile updated successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to update profile");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) {
      toast.error("Please provide both current and new password.");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }

    setIsSavingPassword(true);
    try {
      await api.users.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setIsChangingPassword(false);
      toast.success("Password changed successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to change password");
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <AppShell>
      <ReusableErrorBoundary>
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
              <Palette className="w-4 h-4 text-(--brand)" />
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
                      className={`relative flex flex-col items-center justify-center gap-2 p-3.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? "border-primary bg-secondary/80 text-foreground font-semibold shadow-xs"
                          : "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
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
                      className={`relative flex items-start justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? "border-primary bg-secondary/80 text-foreground font-semibold shadow-2xs"
                          : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                      }`}
                    >
                      <div className="relative z-10">
                        <p className="text-xs font-semibold text-foreground">
                          {opt.label}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {opt.preview}
                        </p>
                      </div>
                      {isSelected && (
                        <Check className="w-4 h-4 text-(--brand) shrink-0 ml-2 relative z-10" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* 2. Account Section */}
          <section className="bg-card border border-border rounded-2xl p-5 space-y-6 shadow-2xs">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                <Shield className="w-4 h-4 text-(--brand)" />
                <h2 className="text-base font-semibold text-foreground">
                  Account Details
                </h2>
              </div>
              {user && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setIsEditingProfile((prev) => !prev);
                    setFirstName(user.firstName);
                    setLastName(user.lastName);
                  }}
                  className="text-xs gap-1.5 h-7"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  {isEditingProfile ? "Cancel" : "Edit Profile"}
                </Button>
              )}
            </div>

            {user ? (
              <div className="space-y-6">
                {/* Profile Edit Form */}
                {isEditingProfile ? (
                  <form onSubmit={handleUpdateProfile} className="space-y-4 p-4 rounded-xl bg-secondary/30 border border-border">
                    <h3 className="text-xs font-bold text-foreground">Update Profile</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-foreground">First Name</label>
                        <Input
                          type="text"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-foreground">Last Name</label>
                        <Input
                          type="text"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditingProfile(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" variant="brand" size="sm" disabled={isSavingProfile}>
                        {isSavingProfile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save Profile"}
                      </Button>
                    </div>
                  </form>
                ) : (
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
                )}

                {/* Password Change Sub-section */}
                <div className="pt-2 border-t border-border space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs font-semibold text-foreground">Password Security</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsChangingPassword((prev) => !prev)}
                      className="text-xs h-7"
                    >
                      {isChangingPassword ? "Cancel" : "Change Password"}
                    </Button>
                  </div>

                  {isChangingPassword && (
                    <form onSubmit={handleChangePassword} className="space-y-3 p-4 rounded-xl bg-secondary/30 border border-border">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-foreground">Current Password</label>
                        <Input
                          type="password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-foreground">New Password</label>
                        <Input
                          type="password"
                          value={newPassword}
                          placeholder="At least 8 characters"
                          onChange={(e) => setNewPassword(e.target.value)}
                          required
                        />
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="ghost" size="sm" onClick={() => setIsChangingPassword(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" variant="brand" size="sm" disabled={isSavingPassword}>
                          {isSavingPassword ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Update Password"}
                        </Button>
                      </div>
                    </form>
                  )}
                </div>

                <div className="pt-4 border-t border-border flex justify-end">
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
      </ReusableErrorBoundary>
    </AppShell>
  );
}
