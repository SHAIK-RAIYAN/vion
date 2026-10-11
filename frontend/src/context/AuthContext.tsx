"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import type { User } from "../types/api";
import { toast } from "sonner";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  refreshUser: () => Promise<void>;
  signout: () => Promise<void>;
  isAuthModalOpen: boolean;
  authModalTab: "signin" | "signup";
  openAuthModal: (tab?: "signin" | "signup") => void;
  closeAuthModal: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  refreshUser: async () => {},
  signout: async () => {},
  isAuthModalOpen: false,
  authModalTab: "signin",
  openAuthModal: () => {},
  closeAuthModal: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<"signin" | "signup">("signin");

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.auth.getMe();
      if (res.data) {
        setUser(res.data);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const res = await api.auth.getMe();
        if (isMounted) {
          setUser(res.data || null);
        }
      } catch {
        if (isMounted) setUser(null);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const signout = async () => {
    try {
      await api.auth.signout();
      setUser(null);
      toast.success("Signed out successfully");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Signout failed";
      toast.error(message);
    }
  };

  const openAuthModal = (tab: "signin" | "signup" = "signin") => {
    setAuthModalTab(tab);
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        refreshUser,
        signout,
        isAuthModalOpen,
        authModalTab,
        openAuthModal,
        closeAuthModal,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
