"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import type { SubscriptionItem } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Tv, RefreshCw, UserCheck, UserPlus, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { AppShell } from "@/components/navigation/AppShell";
import ReusableErrorBoundary from "@/components/ReusableErrorBoundary";

function SubscriptionsContent() {
  const { user, openAuthModal } = useAuth();
  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscriptions = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.subscriptions.getMy(1, 50);
      setSubscriptions(res.items);
    } catch (err: any) {
      setError(err.message || "Failed to load subscriptions");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  const handleToggleSubscription = async (channelId: string, channelName: string) => {
    try {
      const res = await api.subscriptions.toggle(channelId);
      if (!res.data.isSubscribed) {
        setSubscriptions((prev) => prev.filter((s) => s.channelId !== channelId));
        toast.info(`Unsubscribed from ${channelName}`);
      } else {
        toast.success(`Subscribed to ${channelName}`);
      }
    } catch (err: any) {
      toast.error(err.message || "Subscription update failed");
    }
  };

  // 1. Unauthenticated State
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-6 border border-dashed border-border rounded-2xl max-w-md mx-auto my-12">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3 text-muted-foreground">
          <Tv className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1">
          Don&apos;t miss new videos
        </h3>
        <p className="text-xs text-muted-foreground max-w-xs mb-4">
          Sign in to see updates from your favourite channels on Vion.
        </p>
        <Button
          size="sm"
          variant="brand"
          onClick={() => openAuthModal("signin")}
          className="text-xs font-semibold px-5"
        >
          Sign In
        </Button>
      </div>
    );
  }

  // 2. Loading State
  if (loading) {
    return (
      <div className="space-y-4 max-w-4xl mx-auto py-6">
        <div className="h-6 w-48 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="p-4 rounded-xl border border-border bg-card animate-pulse space-y-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-muted" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 3. Error State
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] text-center p-6 border border-border bg-card/40 rounded-2xl max-w-md mx-auto my-12">
        <AlertCircle className="w-8 h-8 text-destructive mb-2" />
        <p className="text-sm font-semibold text-foreground mb-1">Error Loading Subscriptions</p>
        <p className="text-xs text-muted-foreground mb-4">{error}</p>
        <Button size="sm" variant="outline" onClick={fetchSubscriptions}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          Retry
        </Button>
      </div>
    );
  }

  // 4. Empty Subscriptions State
  if (subscriptions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8 border border-dashed border-border rounded-2xl max-w-md mx-auto my-12">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3 text-muted-foreground">
          <Tv className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1">
          No subscriptions yet
        </h3>
        <p className="text-xs text-muted-foreground max-w-xs mb-4">
          When you subscribe to channels, they will be listed here for quick access.
        </p>
        <Link href="/">
          <Button size="sm" variant="secondary" className="text-xs font-semibold">
            Explore Channels & Videos
          </Button>
        </Link>
      </div>
    );
  }

  // 5. Channels Grid
  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Subscriptions
          </h1>
          <p className="text-xs text-muted-foreground">
            Channels you have subscribed to ({subscriptions.length})
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={fetchSubscriptions} className="text-xs gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {subscriptions.map((sub) => (
          <div
            key={sub.id}
            className="flex flex-col justify-between p-4 rounded-xl border border-border bg-card shadow-2xs hover:border-border/80 transition-all"
          >
            <Link
              href={`/channel/${sub.channelId}`}
              className="flex items-center gap-3 mb-3 group/chan cursor-pointer"
            >
              {sub.channel.profilePictureUrl ? (
                <img
                  src={sub.channel.profilePictureUrl}
                  alt={sub.channel.channelName}
                  className="w-12 h-12 rounded-full object-cover border border-border group-hover/chan:opacity-90 transition-opacity"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-muted border border-border flex items-center justify-center text-sm font-bold uppercase text-foreground group-hover/chan:opacity-90 transition-opacity">
                  {sub.channel.channelName[0]}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h4 className="font-semibold text-sm text-foreground truncate group-hover/chan:text-[var(--brand)] transition-colors">
                  {sub.channel.channelName}
                </h4>
                <p className="text-xs text-muted-foreground truncate">
                  @{sub.channel.handle}
                </p>
              </div>
            </Link>

            {sub.channel.description && (
              <p className="text-xs text-muted-foreground line-clamp-2 mb-4">
                {sub.channel.description}
              </p>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                handleToggleSubscription(sub.channelId, sub.channel.channelName)
              }
              className="w-full text-xs gap-1.5 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
            >
              <UserCheck className="w-3.5 h-3.5" />
              Subscribed
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SubscriptionsPage() {
  return (
    <AppShell>
      <ReusableErrorBoundary>
        <SubscriptionsContent />
      </ReusableErrorBoundary>
    </AppShell>
  );
}
