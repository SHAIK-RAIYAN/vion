"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectContent, SelectItem } from "@/components/ui/select";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { X, Lock, Mail, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { animateModalIn, animateModalOut } from "@/lib/gsap";

export function AuthModal() {
  const {
    isAuthModalOpen,
    closeAuthModal,
    authModalTab,
    refreshUser,
    setSessionUser,
  } = useAuth();

  const [tab, setTab] = useState<"signin" | "signup">(authModalTab);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState<"MALE" | "FEMALE" | "OTHER">("OTHER");

  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    if (loading) return;
    animateModalOut(backdropRef.current, dialogRef.current, () => {
      closeAuthModal();
      setSuccessMessage(null);
    });
  }, [loading, closeAuthModal]);

  // Entrance animation
  useEffect(() => {
    if (isAuthModalOpen && backdropRef.current && dialogRef.current) {
      animateModalIn(backdropRef.current, dialogRef.current);
    }
  }, [isAuthModalOpen]);

  // Sync tab from context when opened
  useEffect(() => {
    setTab(authModalTab);
    setSuccessMessage(null);
  }, [authModalTab, isAuthModalOpen]);

  // Handle ESC key
  useEffect(() => {
    if (!isAuthModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAuthModalOpen, handleClose]);

  const handleSignin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please fill in email and password");
      return;
    }

    setLoading(true);
    try {
      const res: any = await api.auth.signin({ email, password });
      setSuccessMessage("Welcome back to Vion!");

      // Update shared auth state immediately from response
      const verifiedUser = res.user || res.data?.user;
      if (verifiedUser) {
        setSessionUser(verifiedUser);
      } else {
        await refreshUser();
      }

      setTimeout(() => {
        handleClose();
        setEmail("");
        setPassword("");
        setLoading(false);
      }, 500);
    } catch (err: any) {
      toast.error(err.message || "Failed to sign in");
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !firstName || !lastName) {
      toast.error("Please fill in all required fields");
      return;
    }

    setLoading(true);
    try {
      await api.auth.signup({
        email,
        password,
        firstName,
        lastName,
        gender,
        dob: "2000-01-01",
      });
      setSuccessMessage("Account created! Logging you in...");
      const res: any = await api.auth.signin({ email, password });
      const verifiedUser = res.user || res.data?.user;
      if (verifiedUser) {
        setSessionUser(verifiedUser);
      } else {
        await refreshUser();
      }

      setTimeout(() => {
        handleClose();
        setLoading(false);
      }, 600);
    } catch (err: any) {
      toast.error(err.message || "Failed to sign up");
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (idToken: string) => {
    setLoading(true);
    try {
      const res: any = await api.auth.google(idToken);
      setSuccessMessage(
        res.data?.firstName
          ? `Welcome to Vion, ${res.data.firstName}!`
          : "Google authentication successful!",
      );
      if (res.data || res.user) {
        setSessionUser(res.data || res.user);
      } else {
        await refreshUser();
      }
      setTimeout(() => {
        handleClose();
        setLoading(false);
      }, 500);
    } catch (err: any) {
      toast.error(err.message || "Google authentication failed");
      setLoading(false);
      throw err;
    }
  };

  if (!isAuthModalOpen) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6 overflow-hidden"
      >
        {/* Close Button */}
        <button
          onClick={handleClose}
          disabled={loading}
          aria-label="Close dialog"
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-muted disabled:opacity-50 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-6 h-6 rounded-md bg-[var(--brand)] flex items-center justify-center text-white font-bold text-xs shadow-xs">
              V
            </div>
            <h2 className="text-xl font-bold tracking-tight">Vion</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            {tab === "signin"
              ? "Sign in to subscribe, like, and sync your watch history."
              : "Create an account to join the Vion community."}
          </p>
        </div>

        {/* Success State Overlay */}
        {successMessage && (
          <div className="absolute inset-0 bg-card z-20 flex flex-col items-center justify-center p-6 text-center space-y-3 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-foreground">Success</h3>
            <p className="text-xs text-muted-foreground max-w-xs">{successMessage}</p>
          </div>
        )}

        {/* Tab Switcher */}
        <div className="relative flex p-1 bg-muted rounded-xl mb-5">
          <button
            type="button"
            onClick={() => setTab("signin")}
            className={`relative z-10 flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              tab === "signin"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setTab("signup")}
            className={`relative z-10 flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              tab === "signup"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Google Authentication Button */}
        <div className="mb-4">
          <GoogleSignInButton
            text={tab === "signup" ? "signup" : "signin"}
            disabled={loading}
            onSuccess={handleGoogleSuccess}
          />
        </div>

        <div className="relative flex items-center justify-center mb-4">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border/60" />
          </div>
          <span className="relative bg-card px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            or continue with email
          </span>
        </div>

        {/* Forms */}
        {tab === "signin" ? (
          <form onSubmit={handleSignin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1 text-muted-foreground">
                Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground pointer-events-none" />
                <Input
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1 text-muted-foreground">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground pointer-events-none" />
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full mt-2 cursor-pointer active:scale-[0.98] transition-transform"
              variant="brand"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Sign In
            </Button>
          </form>
        ) : (
          <form onSubmit={handleSignup} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium mb-1 text-muted-foreground">
                  First Name
                </label>
                <Input
                  type="text"
                  placeholder="John"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-muted-foreground">
                  Last Name
                </label>
                <Input
                  type="text"
                  placeholder="Doe"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1 text-muted-foreground">
                Email
              </label>
              <Input
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1 text-muted-foreground">
                Password
              </label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1 text-muted-foreground">
                Gender
              </label>
              <Select
                value={gender}
                onValueChange={(val) =>
                  setGender(val as "MALE" | "FEMALE" | "OTHER")
                }
              >
                <SelectTrigger />
                <SelectContent>
                  <SelectItem value="MALE">Male</SelectItem>
                  <SelectItem value="FEMALE">Female</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full mt-2 cursor-pointer active:scale-[0.98] transition-transform"
              variant="brand"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Create Account
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
