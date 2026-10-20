"use client";

import React, { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Channel } from "@/types/api";
import { useAuth } from "@/context/AuthContext";
import { AppShell } from "@/components/navigation/AppShell";
import ReusableErrorBoundary from "@/components/ReusableErrorBoundary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  UserCheck,
  UserPlus,
  Tv,
  AlertCircle,
  Video,
  Edit3,
  Check,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

export default function ChannelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const channelIdentifier = resolvedParams.id;

  const { user, openAuthModal } = useAuth();

  const [channel, setChannel] = useState<Channel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Subscription state
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [subscriberCount, setSubscriberCount] = useState<number>(0);

  // Edit Channel Mode (for channel owner)
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const fetchChannelData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let chan: Channel;
      if (channelIdentifier.startsWith("@")) {
        const res = await api.channels.getByHandle(channelIdentifier.substring(1));
        chan = res.data;
      } else {
        try {
          const res = await api.channels.getById(channelIdentifier);
          chan = res.data;
        } catch {
          // Fallback to getByHandle in case parameter is a handle without @
          const res = await api.channels.getByHandle(channelIdentifier);
          chan = res.data;
        }
      }

      setChannel(chan);
      setSubscriberCount(chan.subscribers ?? 0);
      setEditName(chan.channelName);
      setEditDescription(chan.description || "");

      // Check subscription status
      if (user) {
        try {
          const subRes = await api.subscriptions.getStatus(chan.id);
          setIsSubscribed(Boolean(subRes.data.isSubscribed));
        } catch {
          // Ignored
        }
      }
    } catch (err: any) {
      setError(err.message || "Channel not found");
    } finally {
      setLoading(false);
    }
  }, [channelIdentifier, user]);

  useEffect(() => {
    fetchChannelData();
  }, [fetchChannelData]);

  const handleToggleSub = async () => {
    if (!user) {
      openAuthModal("signin");
      return;
    }
    if (!channel || subscribing) return;

    setSubscribing(true);
    try {
      const res = await api.subscriptions.toggle(channel.id);
      setIsSubscribed(res.data.isSubscribed);
      setSubscriberCount((prev) => (res.data.isSubscribed ? prev + 1 : Math.max(0, prev - 1)));
      toast.success(
        res.data.isSubscribed
          ? `Subscribed to ${channel.channelName}`
          : `Unsubscribed from ${channel.channelName}`,
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to update subscription");
    } finally {
      setSubscribing(false);
    }
  };

  const handleSaveChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channel || isSaving) return;

    setIsSaving(true);
    try {
      const updated = await api.channels.update({
        channelName: editName.trim(),
        description: editDescription.trim(),
      });
      setChannel(updated.data);
      setIsEditing(false);
      toast.success("Channel details updated!");
    } catch (err: any) {
      toast.error(err.message || "Failed to update channel");
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="max-w-5xl mx-auto py-6 px-4 space-y-6 animate-pulse">
          <div className="w-full h-36 rounded-2xl bg-muted" />
          <div className="flex gap-4 items-center">
            <div className="w-20 h-20 rounded-full bg-muted" />
            <div className="space-y-2 flex-1">
              <div className="h-5 bg-muted rounded w-1/3" />
              <div className="h-3 bg-muted rounded w-1/5" />
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  if (error || !channel) {
    return (
      <AppShell>
        <div className="max-w-md mx-auto my-16 text-center p-8 border border-border bg-card rounded-2xl shadow-sm">
          <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-foreground mb-1">
            Channel Not Found
          </h3>
          <p className="text-xs text-muted-foreground mb-6">
            {error || "The requested channel could not be found."}
          </p>
          <Link href="/">
            <Button variant="secondary" size="sm" className="text-xs">
              Back to Home
            </Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  const isOwner = user?.id && channel.userId === user.id;

  return (
    <AppShell>
      <ReusableErrorBoundary>
        <div className="max-w-5xl mx-auto py-6 px-4 space-y-6">
          {/* Banner Container */}
          <div className="w-full h-36 sm:h-48 rounded-2xl bg-gradient-to-r from-secondary to-muted border border-border overflow-hidden relative shadow-2xs">
            {channel.bannerUrl ? (
              <img
                src={channel.bannerUrl}
                alt={channel.channelName}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center opacity-30">
                <Tv className="w-16 h-16 text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Channel Header Profile Info */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-border">
            <div className="flex items-center gap-4">
              {/* Profile Avatar */}
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-secondary border-2 border-border flex items-center justify-center font-black text-2xl uppercase text-foreground shrink-0 overflow-hidden shadow-md">
                {channel.profilePictureUrl ? (
                  <img
                    src={channel.profilePictureUrl}
                    alt={channel.channelName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  channel.channelName[0]
                )}
              </div>

              {/* Names & Counts */}
              <div className="space-y-1">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  {channel.channelName}
                </h1>
                <p className="text-xs text-muted-foreground font-mono">
                  @{channel.handle}
                </p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                  <span>{subscriberCount} {subscriberCount === 1 ? "subscriber" : "subscribers"}</span>
                  <span>•</span>
                  <span>{channel.uploads ?? 0} {channel.uploads === 1 ? "video" : "videos"}</span>
                </div>
              </div>
            </div>

            {/* Actions: Owner Edit vs Viewer Subscribe */}
            <div className="flex items-center gap-2">
              {isOwner ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsEditing((prev) => !prev)}
                  className="text-xs font-semibold gap-1.5 h-8 rounded-full"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  {isEditing ? "Cancel Edit" : "Edit Channel"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant={isSubscribed ? "outline" : "brand"}
                  onClick={handleToggleSub}
                  disabled={subscribing}
                  className="text-xs font-semibold rounded-full px-5 h-8"
                >
                  {isSubscribed ? (
                    <>
                      <UserCheck className="w-3.5 h-3.5 mr-1" />
                      Subscribed
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-3.5 h-3.5 mr-1" />
                      Subscribe
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Owner Edit Form */}
          {isEditing && isOwner && (
            <form
              onSubmit={handleSaveChannel}
              className="p-5 rounded-2xl bg-card border border-border space-y-4 shadow-sm"
            >
              <h3 className="text-sm font-bold text-foreground">
                Edit Channel Profile
              </h3>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Channel Name
                </label>
                <Input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Channel Description
                </label>
                <textarea
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full rounded-xl border border-input bg-card px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="brand"
                  size="sm"
                  disabled={isSaving}
                  className="gap-1.5"
                >
                  {isSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  Save Changes
                </Button>
              </div>
            </form>
          )}

          {/* Channel Description */}
          {channel.description && !isEditing && (
            <div className="p-4 rounded-xl bg-card border border-border text-xs leading-relaxed text-foreground whitespace-pre-wrap">
              {channel.description}
            </div>
          )}

          {/* Videos Section */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2">
              <Video className="w-4 h-4 text-(--brand)" />
              <h2 className="text-base font-bold text-foreground">
                Channel Videos
              </h2>
            </div>

            {channel.uploads === 0 ? (
              <div className="text-center py-12 p-6 border border-dashed border-border rounded-2xl">
                <Video className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-50" />
                <p className="text-sm font-semibold text-foreground">
                  No videos uploaded yet
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  This creator has not published any videos yet.
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-secondary/30 border border-border text-xs text-muted-foreground">
                This channel has {channel.uploads} published {channel.uploads === 1 ? "video" : "videos"}.
              </div>
            )}
          </div>
        </div>
      </ReusableErrorBoundary>
    </AppShell>
  );
}
