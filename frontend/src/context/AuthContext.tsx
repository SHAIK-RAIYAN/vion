"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import type { User } from "../types/api";
import { toast } from "sonner";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextType {
  user: User | null;
  status: AuthStatus;
  isLoading: boolean;
  isAuthenticated: boolean;
  refreshUser: () => Promise<User | null>;
  setSessionUser: (user: User | null) => void;
  signout: () => Promise<void>;
  isAuthModalOpen: boolean;
  authModalTab: "signin" | "signup";
  openAuthModal: (tab?: "signin" | "signup") => void;
  closeAuthModal: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  status: "loading",
  isLoading: true,
  isAuthenticated: false,
  refreshUser: async () => null,
  setSessionUser: () => {},
  signout: async () => {},
  isAuthModalOpen: false,
  authModalTab: "signin",
  openAuthModal: () => {},
  closeAuthModal: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<"signin" | "signup">("signin");

  // Synchronously set verified user (e.g. from signin/signup response)
  const setSessionUser = useCallback((newUser: User | null) => {
    setUser(newUser);
    setStatus(newUser ? "authenticated" : "unauthenticated");
  }, []);

  const refreshUser = useCallback(async (): Promise<User | null> => {
    try {
      const res = await api.auth.getMe();
      if (res && res.data) {
        setUser(res.data);
        setStatus("authenticated");
        return res.data;
      } else {
        setUser(null);
        setStatus("unauthenticated");
        return null;
      }
    } catch {
      setUser(null);
      setStatus("unauthenticated");
      return null;
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const res = await api.auth.getMe();
        if (isMounted) {
          if (res && res.data) {
            setUser(res.data);
            setStatus("authenticated");
          } else {
            setUser(null);
            setStatus("unauthenticated");
          }
        }
      } catch {
        if (isMounted) {
          setUser(null);
          setStatus("unauthenticated");
        }
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
      setStatus("unauthenticated");
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
        status,
        isLoading: status === "loading",
        isAuthenticated: status === "authenticated",
        refreshUser,
        setSessionUser,
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
