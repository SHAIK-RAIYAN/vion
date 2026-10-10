"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Lock, Mail, User as UserIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function AuthModal() {
  const { isAuthModalOpen, closeAuthModal, authModalTab, openAuthModal, refreshUser } =
    useAuth();

  const [tab, setTab] = useState<"signin" | "signup">(authModalTab);
  const [loading, setLoading] = useState(false);

  // Form states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState<"MALE" | "FEMALE" | "OTHER">("OTHER");

  // Sync tab from context when opened
  React.useEffect(() => {
    setTab(authModalTab);
  }, [authModalTab]);

  if (!isAuthModalOpen) return null;

  const handleSignin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please fill in email and password");
      return;
    }

    setLoading(true);
    try {
      await api.auth.signin({ email, password });
      toast.success("Welcome back to Vion!");
      await refreshUser();
      closeAuthModal();
      setEmail("");
      setPassword("");
    } catch (err: any) {
      toast.error(err.message || "Failed to sign in");
    } finally {
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
      });
      toast.success("Account created! Signing you in...");
      // Auto signin after signup
      await api.auth.signin({ email, password });
      await refreshUser();
      closeAuthModal();
    } catch (err: any) {
      toast.error(err.message || "Failed to sign up");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6 overflow-hidden">
        {/* Close Button */}
        <button
          onClick={closeAuthModal}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-muted"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-md bg-[var(--brand)] flex items-center justify-center text-white font-bold text-xs">
              V
            </div>
            <h2 className="text-xl font-bold tracking-tight">Vion</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {tab === "signin"
              ? "Sign in to subscribe, like, and track watch history"
              : "Create an account to join the Vion community"}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex p-1 bg-muted rounded-lg mb-6">
          <button
            type="button"
            onClick={() => setTab("signin")}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
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
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
              tab === "signup"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Sign Up
          </button>
        </div>

        {tab === "signin" ? (
          <form onSubmit={handleSignin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1 text-muted-foreground">
                Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
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
                <Lock className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
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
              className="w-full mt-2"
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
              <select
                value={gender}
                onChange={(e) =>
                  setGender(e.target.value as "MALE" | "FEMALE" | "OTHER")
                }
                className="flex h-9 w-full rounded-lg border border-border bg-card px-3 py-1 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full mt-2"
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
