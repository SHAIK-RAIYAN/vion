"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { CurtainLink } from "@/components/transitions";
import { api } from "@/lib/api";
import type { Upload, Comment, LikeStatus } from "@/types/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HlsVideoPlayer } from "@/components/video/HlsVideoPlayer";
import {
  ArrowLeft,
  UserCheck,
  UserPlus,
  Eye,
  Calendar,
  Lock,
  AlertCircle,
  ThumbsUp,
  MessageSquare,
  Trash2,
  Send,
  Loader2,
  Download,
  ChevronDown,
  Film,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { AppShell } from "@/components/navigation/AppShell";
import ReusableErrorBoundary from "@/components/ReusableErrorBoundary";
import { cn } from "@/lib/utils";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { useGSAP } from "@gsap/react";

export function WatchContent({ id }: { id: string }) {
  // Check if this video was passed via seamless hero transition
  const [video, setVideo] = useState<Upload | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem(`vion_hero_video_${id}`);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch {}
    }
    return null;
  });

  const [loading, setLoading] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        if (sessionStorage.getItem(`vion_hero_video_${id}`)) {
          return false;
        }
      } catch {}
    }
    return true;
  });

  const [error, setError] = useState<{ message: string; statusCode: number } | null>(
    null,
  );

  // Subscription state
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  // Reactions state
  const [likeStatus, setLikeStatus] = useState<LikeStatus | null>(null);
  const [liking, setLiking] = useState(false);

  // Download state
  const [downloadingQuality, setDownloadingQuality] = useState<string | null>(null);

  // Comments state
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  // Saved watch progress (from backend history)
  const [initialProgressSeconds, setInitialProgressSeconds] = useState(0);

  const { user, openAuthModal } = useAuth();
  const watchContainerRef = useRef<HTMLDivElement>(null);

  // Smooth entrance animation for surrounding items while player remains stable
  useGSAP(
    () => {
      if (!video || prefersReducedMotion()) return;
      gsap.fromTo(
        ".watch-details-fade",
        { opacity: 0, y: 14 },
        {
          opacity: 1,
          y: 0,
          duration: 0.45,
          ease: "power2.out",
          stagger: 0.04,
          clearProps: "transform",
        },
      );
    },
    { dependencies: [Boolean(video)], scope: watchContainerRef },
  );

  // Load initial video data and playback info
  const loadVideo = useCallback(async () => {
    if (!video) {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await api.videos.getById(id);
      setVideo(res.data);

      // Check subscription status
      if (res.data.channel?.id && user) {
        try {
          const subRes = await api.subscriptions.getStatus(res.data.channel.id);
          setIsSubscribed(Boolean(subRes.data.isSubscribed));
        } catch {
          // Ignored
        }
      }

      // Check reactions
      try {
        const likeRes = await api.videos.getLikeStatus(id);
        setLikeStatus(likeRes.data);
      } catch {
        // Ignored
      }

      // Fetch saved watch progress
      if (user) {
        try {
          const progRes = await api.history.getProgress(id);
          if (progRes.data?.progressTimeStamp) {
            setInitialProgressSeconds(progRes.data.progressTimeStamp);
          }
        } catch {
          // Ignored
        }
      }
    } catch (err: any) {
      setError({
        message: err.message || "Failed to load video",
        statusCode: err.statusCode || 500,
      });
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  useEffect(() => {
    loadVideo();
  }, [loadVideo]);

  // Load comments
  const loadComments = useCallback(async () => {
    setCommentsLoading(true);
    try {
      const res = await api.videos.getComments(id, 1, 30);
      setComments(res.items || []);
    } catch {
      // Ignored
    } finally {
      setCommentsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (video) {
      loadComments();
    }
  }, [video, loadComments]);

  // Toggle Subscription
  const handleToggleSub = async () => {
    if (!user) {
      openAuthModal("signin");
      return;
    }
    if (!video?.channel?.id || subscribing) return;

    setSubscribing(true);
    try {
      const res = await api.subscriptions.toggle(video.channel.id);
      setIsSubscribed(res.data.isSubscribed);
      toast.success(
        res.data.isSubscribed
          ? `Subscribed to ${video.channel.channelName}`
          : `Unsubscribed from ${video.channel.channelName}`,
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to update subscription");
    } finally {
      setSubscribing(false);
    }
  };

  // Toggle Like reaction
  const handleToggleLike = async () => {
    if (!user) {
      openAuthModal("signin");
      return;
    }
    if (liking || !video) return;

    setLiking(true);
    try {
      if (likeStatus?.liked) {
        await api.videos.unlike(video.id);
        setLikeStatus((prev) =>
          prev
            ? {
                ...prev,
                liked: false,
                likes: Math.max(0, prev.likes - 1),
                userInteraction: null,
              }
            : null,
        );
      } else {
        await api.videos.like(video.id);
        setLikeStatus((prev) =>
          prev
            ? {
                ...prev,
                liked: true,
                likes: prev.likes + 1,
                userInteraction: "LIKE",
              }
            : {
                videoId: video.id,
                likes: 1,
                dislikes: 0,
                liked: true,
                disliked: false,
                userInteraction: "LIKE",
              },
        );
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to update reaction");
    } finally {
      setLiking(false);
    }
  };

  // High-speed native browser download using short-lived signed URLs
  const handleDownload = async (quality?: string) => {
    if (!video) return;
    setDownloadingQuality(quality || "default");
    try {
      const res = await api.videos.getDownload(video.id, quality);
      const downloadData = res.data;
      if (!downloadData?.downloadUrl) {
        throw new Error("Download URL could not be generated.");
      }

      // Stream directly to disk via native browser download
      // Avoids buffering in Axios or storing large binary blobs in JS memory
      const link = document.createElement("a");
      link.href = downloadData.downloadUrl;
      link.setAttribute("download", downloadData.fileName || `${video.title || "video"}.mp4`);
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success(`Download started for ${downloadData.resolution || "MP4"}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to start download");
    } finally {
      setDownloadingQuality(null);
    }
  };

  // Submit comment
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      openAuthModal("signin");
      return;
    }
    const content = newComment.trim();
    if (!content || submittingComment) return;

    setSubmittingComment(true);
    try {
      const res = await api.videos.createComment(id, content);
      const createdItem = res.data;
      if (createdItem && !createdItem.user && user) {
        createdItem.user = {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          channel: user.channel,
        };
      }
      setComments((prev) => [createdItem, ...prev]);
      setNewComment("");
      toast.success("Comment posted!");
    } catch (err: any) {
      toast.error(err.message || "Failed to post comment");
    } finally {
      setSubmittingComment(false);
    }
  };

  // Delete owned comment
  const handleDeleteComment = async (commentId: string) => {
    try {
      await api.videos.deleteComment(commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      toast.success("Comment deleted");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete comment");
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="max-w-5xl mx-auto py-6 px-4 space-y-4 animate-pulse">
          <div className="aspect-video w-full rounded-2xl bg-muted" />
          <div className="h-6 bg-muted rounded w-3/4" />
          <div className="h-4 bg-muted rounded w-1/3" />
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <div className="max-w-md mx-auto my-16 text-center p-8 border border-border bg-card rounded-2xl shadow-sm">
          {error.statusCode === 403 ? (
            <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto mb-3">
              <Lock className="w-6 h-6" />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
          )}
          <h3 className="text-base font-bold text-foreground mb-1">
            {error.statusCode === 403
              ? "Private Video"
              : error.statusCode === 404
              ? "Video Not Found"
              : "Error Loading Video"}
          </h3>
          <p className="text-xs text-muted-foreground mb-6">{error.message}</p>
          <CurtainLink href="/">
            <Button variant="secondary" size="sm" className="gap-2 text-xs">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Feed
            </Button>
          </CurtainLink>
        </div>
      </AppShell>
    );
  }

  if (!video) return null;

  const isOwner = user?.id && video.channel?.userId === user.id;

  const parseHeight = (res: string) => {
    const match = res.match(/(\d+)/);
    return match && match[1] ? parseInt(match[1], 10) : 0;
  };

  const availableRenditions = (video.videos || []).slice().sort(
    (a, b) => parseHeight(b.resolution) - parseHeight(a.resolution),
  );
  const isVideoProcessing = video.processingStatus !== "COMPLETED";

  return (
    <AppShell>
      <ReusableErrorBoundary>
        <div ref={watchContainerRef} className="max-w-5xl mx-auto py-4 px-4 space-y-6">
          <div className="watch-details-fade">
            <CurtainLink
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Feed
            </CurtainLink>
          </div>

          {/* Real Adaptive HLS Video Player */}
          <div className="relative">
            <HlsVideoPlayer
              videoId={video.id}
              manifestUrl={video.hlsManifestUrl}
              thumbnailUrl={video.thumbnailUrl}
              title={video.title}
              isProcessing={isVideoProcessing}
              initialProgressSeconds={initialProgressSeconds}
              availableResolutions={availableRenditions.map((r) => r.resolution)}
              onDownloadQuality={handleDownload}
            />

            {/* Badges on Video Container */}
            <div className="absolute top-3 right-3 flex items-center gap-2 pointer-events-none">
              {video.visibility !== "PUBLIC" && (
                <Badge variant="secondary" className="bg-black/80 text-white border-0 text-[10px]">
                  {video.visibility}
                </Badge>
              )}
              {video.videos?.[0]?.resolution && (
                <Badge variant="brand" className="text-[10px] font-bold">
                  {video.videos[0].resolution}
                </Badge>
              )}
            </div>
          </div>

          {/* Title & Metadata */}
          <div className="space-y-4 watch-details-fade">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {video.title}
            </h1>

            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-border">
              {/* Channel Profile Info */}
              {video.channel && (
                <div className="flex items-center gap-3">
                  <CurtainLink
                    href={`/channel/${video.channel.id}`}
                    className="w-10 h-10 rounded-full bg-secondary border border-border flex items-center justify-center font-bold text-sm uppercase text-foreground shrink-0 overflow-hidden hover:opacity-90 transition-opacity"
                  >
                    {video.channel.profilePictureUrl ? (
                      <img
                        src={video.channel.profilePictureUrl}
                        alt={video.channel.channelName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      video.channel.channelName[0]
                    )}
                  </CurtainLink>
                  <div>
                    <CurtainLink
                      href={`/channel/${video.channel.id}`}
                      className="font-semibold text-sm text-foreground hover:text-[var(--brand)] transition-colors block"
                    >
                      {video.channel.channelName}
                    </CurtainLink>
                    {video.channel.handle && (
                      <p className="text-xs text-muted-foreground">
                        @{video.channel.handle}
                      </p>
                    )}
                  </div>

                  {!isOwner && (
                    <Button
                      size="sm"
                      variant={isSubscribed ? "outline" : "brand"}
                      onClick={handleToggleSub}
                      disabled={subscribing}
                      className="ml-3 text-xs font-semibold rounded-full px-4 h-8"
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
              )}

              {/* Like Reaction, Download & Metrics */}
              <div className="flex items-center gap-3">
                {/* Like Button */}
                <Button
                  size="sm"
                  variant={likeStatus?.liked ? "secondary" : "outline"}
                  onClick={handleToggleLike}
                  disabled={liking}
                  className={cn(
                    "text-xs font-semibold rounded-full gap-1.5 h-8 px-3.5 border-border",
                    likeStatus?.liked && "text-[var(--brand)] border-[var(--brand)]/40 bg-[var(--brand)]/10",
                  )}
                >
                  <ThumbsUp
                    className={cn(
                      "w-3.5 h-3.5",
                      likeStatus?.liked && "fill-current text-[var(--brand)]",
                    )}
                  />
                  <span>{likeStatus?.likes ?? 0}</span>
                </Button>

                {/* Download Action with Quality Selector */}
                {isVideoProcessing ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled
                    className="text-xs font-semibold rounded-full gap-1.5 h-8 px-3.5 border-border opacity-60 cursor-not-allowed"
                    title="Downloads will become available once video processing completes"
                  >
                    <Download className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>Processing...</span>
                  </Button>
                ) : availableRenditions.length === 0 ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled
                    className="text-xs font-semibold rounded-full gap-1.5 h-8 px-3.5 border-border opacity-60 cursor-not-allowed"
                    title="No downloadable renditions available"
                  >
                    <Download className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>Download</span>
                  </Button>
                ) : availableRenditions.length === 1 ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownload(availableRenditions[0]?.resolution)}
                    disabled={Boolean(downloadingQuality)}
                    className="text-xs font-semibold rounded-full gap-1.5 h-8 px-3.5 border-border hover:bg-accent hover:text-foreground cursor-pointer transition-colors"
                    title={`Download ${availableRenditions[0]?.resolution} MP4`}
                  >
                    {downloadingQuality ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--brand)]" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>Download ({availableRenditions[0]?.resolution})</span>
                  </Button>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={Boolean(downloadingQuality)}
                        className="text-xs font-semibold rounded-full gap-1.5 h-8 px-3.5 border-border hover:bg-accent hover:text-foreground cursor-pointer transition-colors"
                        title="Download video in high-definition MP4"
                      >
                        {downloadingQuality ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--brand)]" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        <span>Download</span>
                        <ChevronDown className="w-3 h-3 text-muted-foreground ml-0.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-48 p-1.5 rounded-xl border border-border bg-card/95 backdrop-blur-md shadow-xl z-50"
                    >
                      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Select MP4 Quality
                      </div>
                      {availableRenditions.map((r) => (
                        <DropdownMenuItem
                          key={r.id || r.resolution}
                          onClick={() => handleDownload(r.resolution)}
                          className="flex items-center justify-between text-xs py-2 px-2.5 rounded-lg cursor-pointer hover:bg-accent focus:bg-accent transition-colors"
                        >
                          <span className="font-semibold text-foreground flex items-center gap-1.5">
                            <Film className="w-3.5 h-3.5 text-muted-foreground" />
                            {r.resolution}
                          </span>
                          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            MP4
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {/* Views & Date metrics */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground ml-2">
                  <span className="flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5" />
                    {video.viewCount} views
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(video.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Video Description */}
            {video.description && (
              <div className="p-4 rounded-xl bg-card border border-border text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                {video.description}
              </div>
            )}
          </div>

          {/* REAL COMMENTS SECTION */}
          <div className="space-y-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[var(--brand)]" />
              <h2 className="text-base font-bold text-foreground">
                Comments ({comments.length})
              </h2>
            </div>

            {/* Add Comment Input */}
            <form onSubmit={handleAddComment} className="flex gap-2">
              <input
                type="text"
                placeholder={
                  user
                    ? "Add a comment..."
                    : "Sign in to join the conversation..."
                }
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                disabled={submittingComment}
                className="flex-1 h-9 px-3.5 rounded-xl border border-input bg-card text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
              />
              <Button
                type="submit"
                size="sm"
                variant="brand"
                disabled={submittingComment || !newComment.trim()}
                className="h-9 px-4 text-xs font-semibold gap-1.5"
              >
                {submittingComment ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    Post
                  </>
                )}
              </Button>
            </form>

            {/* Comments List */}
            {commentsLoading ? (
              <div className="space-y-3 py-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 bg-muted rounded w-1/4" />
                      <div className="h-3 bg-muted rounded w-3/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : comments.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                No comments yet. Be the first to start the conversation!
              </p>
            ) : (
              <div className="space-y-3 pt-2">
                {comments.map((comment) => {
                  const isCommentOwner = user?.id && comment.userId === user.id;
                  const rawAuthorName =
                    comment.user?.channel?.channelName ||
                    [comment.user?.firstName, comment.user?.lastName].filter(Boolean).join(" ").trim() ||
                    (isCommentOwner ? [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() : "") ||
                    "Community Member";
                  const authorName = rawAuthorName || "Community Member";
                  const avatarUrl =
                    comment.user?.channel?.profilePictureUrl ||
                    (isCommentOwner ? user?.channel?.profilePictureUrl : undefined);
                  const initial = (authorName.trim()[0] || "C").toUpperCase();

                  return (
                    <div
                      key={comment.id}
                      className="p-3 rounded-xl bg-card border border-border flex items-start justify-between gap-3 text-xs"
                    >
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center font-bold text-xs uppercase text-foreground shrink-0 overflow-hidden">
                          {avatarUrl ? (
                            <img
                              src={avatarUrl}
                              alt={authorName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            initial
                          )}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground truncate">
                              {authorName}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(comment.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-muted-foreground text-xs break-words leading-relaxed">
                            {comment.content}
                          </p>
                        </div>
                      </div>

                      {/* Delete button if user owns this comment */}
                      {isCommentOwner && (
                        <button
                          type="button"
                          onClick={() => handleDeleteComment(comment.id)}
                          title="Delete comment"
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </ReusableErrorBoundary>
    </AppShell>
  );
}
