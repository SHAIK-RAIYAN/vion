"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface GoogleSignInButtonProps {
  onSuccess: (idToken: string) => Promise<void>;
  onError?: (error: string) => void;
  disabled?: boolean;
  text?: "signin" | "signup";
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          prompt: (momentListener?: (moment: any) => void) => void;
          renderButton: (
            parent: HTMLElement,
            options: Record<string, any>,
          ) => void;
        };
      };
    };
  }
}

export function GoogleSignInButton({
  onSuccess,
  onError,
  disabled = false,
  text = "signin",
}: GoogleSignInButtonProps) {
  const [loading, setLoading] = useState(false);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
  const hiddenBtnRef = useRef<HTMLDivElement>(null);

  const handleCredentialResponse = useCallback(
    async (response: { credential?: string }) => {
      if (!response.credential) {
        const msg = "No credential received from Google Identity Services.";
        onError?.(msg);
        toast.error(msg);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        await onSuccess(response.credential);
      } catch (err: any) {
        const msg = err.message || "Google authentication failed";
        onError?.(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [onSuccess, onError],
  );

  useEffect(() => {
    if (!clientId) return;

    // Load Google Identity Services script if not already present
    const existingScript = document.getElementById("google-gsi-script");
    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "google-gsi-script";
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => setScriptLoaded(true);
      script.onerror = () => {
        toast.error("Failed to load Google Identity Services SDK.");
      };
      document.head.appendChild(script);
    } else {
      setScriptLoaded(true);
    }
  }, [clientId]);

  useEffect(() => {
    if (!scriptLoaded || !clientId || !window.google?.accounts?.id) return;

    try {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredentialResponse,
        cancel_on_tap_outside: true,
      });

      // Optionally render hidden native GIS button to trigger programmatically
      if (hiddenBtnRef.current) {
        hiddenBtnRef.current.innerHTML = "";
        window.google.accounts.id.renderButton(hiddenBtnRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          width: 360,
          text: text === "signup" ? "signup_with" : "signin_with",
        });
      }
    } catch (e) {
      console.error("GIS initialization error:", e);
    }
  }, [scriptLoaded, clientId, handleCredentialResponse, text]);

  const handleClick = () => {
    if (disabled || loading) return;

    if (!clientId) {
      toast.info(
        "Google Sign-In requires NEXT_PUBLIC_GOOGLE_CLIENT_ID. Please configure it in your frontend .env.local file.",
        {
          duration: 5000,
        },
      );
      return;
    }

    if (!scriptLoaded || !window.google?.accounts?.id) {
      toast.error("Google authentication service is still initializing. Please retry in a moment.");
      return;
    }

    setLoading(true);

    try {
      // First try clicking the native GIS rendered button child if available
      const nativeButton = hiddenBtnRef.current?.querySelector(
        "div[role=button], button",
      ) as HTMLElement | null;

      if (nativeButton) {
        nativeButton.click();
        // Reset loading after timeout if user closes popup without selecting
        setTimeout(() => setLoading(false), 3000);
      } else {
        // Fallback to prompt
        window.google.accounts.id.prompt((notification: any) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            setLoading(false);
          }
        });
      }
    } catch (err: any) {
      setLoading(false);
      toast.error(err.message || "Failed to launch Google Sign-In prompt");
    }
  };

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || loading}
        className="w-full flex items-center justify-center gap-3 h-10 px-4 rounded-xl border border-border bg-card hover:bg-secondary/80 text-foreground text-xs font-semibold shadow-2xs transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] select-none group"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : (
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
        )}
        <span>
          {loading
            ? "Authenticating with Google..."
            : text === "signup"
              ? "Sign up with Google"
              : "Continue with Google"}
        </span>
      </button>

      {/* Hidden container for Google GIS SDK native button mounting */}
      <div
        ref={hiddenBtnRef}
        className="hidden"
        style={{ display: "none" }}
        aria-hidden="true"
      />
    </div>
  );
}
