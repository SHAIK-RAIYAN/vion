"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import type { UploadVisibility } from "@/types/api";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Upload as UploadIcon,
  Video,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Play,
  Tv,
  Clock,
  RotateCcw,
  Globe,
  Link2,
  Lock,
  FileVideo,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface UploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type UploadStep =
  | "CHANNEL_CHECK"
  | "CREATE_CHANNEL"
  | "SELECT_FILE"
  | "DETAILS"
  | "UPLOADING"
  | "PROCESSING"
  | "COMPLETED"
  | "ERROR";

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB limit
const ALLOWED_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
];

export interface DetectedVideoMeta {
  width: number;
  height: number;
  duration: number;
  formattedResolution: string;
  resolutionName: string;
}

function detectVideoMetadata(file: File): Promise<DetectedVideoMeta> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve({
        width: 1920,
        height: 1080,
        duration: 0,
        formattedResolution: "1920 × 1080 (1080p)",
        resolutionName: "1080p",
      });
      return;
    }
    const video = document.createElement("video");
    video.preload = "metadata";
    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      video.remove();
    };

    video.onloadedmetadata = () => {
      const width = video.videoWidth || 1920;
      const height = video.videoHeight || 1080;
      const duration = video.duration || 0;

      const minDim = Math.min(width, height);
      const maxDim = Math.max(width, height);
      let resolutionName = "1080p";

      if (maxDim >= 3840 || minDim >= 2160) {
        resolutionName = "4K";
      } else if (maxDim >= 2560 || minDim >= 1440) {
        resolutionName = "1440p";
      } else if (maxDim >= 1920 || minDim >= 1080) {
        resolutionName = "1080p";
      } else if (maxDim >= 1280 || minDim >= 720) {
        resolutionName = "720p";
      } else if (minDim >= 480) {
        resolutionName = "480p";
      } else {
        resolutionName = `${minDim}p`;
      }

      const formattedResolution = `${width} × ${height} (${resolutionName})`;
      cleanup();
      resolve({
        width,
        height,
        duration,
        formattedResolution,
        resolutionName,
      });
    };

    video.onerror = () => {
      cleanup();
      resolve({
        width: 1920,
        height: 1080,
        duration: 0,
        formattedResolution: "1920 × 1080 (1080p)",
        resolutionName: "1080p",
      });
    };
  });
}

export function UploadDialog({ isOpen, onClose }: UploadDialogProps) {
  const { user } = useAuth();

  const [step, setStep] = useState<UploadStep>("SELECT_FILE");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [detectedMeta, setDetectedMeta] = useState<DetectedVideoMeta | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<UploadVisibility>("PUBLIC");
  const [isDragging, setIsDragging] = useState(false);

  // Channel Creation State (if user has no channel yet)
  const [channelName, setChannelName] = useState("");
  const [channelHandle, setChannelHandle] = useState("");
  const [isCreatingChannel, setIsCreatingChannel] = useState(false);

  // Upload Progress & Processing Status
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<string>("UPLOADING");
  const [queueState, setQueueState] = useState<{
    jobId: string | null;
    state: string | null;
    progress: number | null;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check channel existence when dialog opens
  useEffect(() => {
    if (!isOpen || !user) return;

    let isMounted = true;
    async function verifyChannel() {
      try {
        await api.channels.getMyChannel();
        if (isMounted) {
          setStep("SELECT_FILE");
        }
      } catch (err: any) {
        if (isMounted) {
          if (err.statusCode === 404 || err.code === "NO_CHANNEL") {
            setStep("CREATE_CHANNEL");
          } else {
            setStep("SELECT_FILE");
          }
        }
      }
    }

    verifyChannel();
    return () => {
      isMounted = false;
    };
  }, [isOpen, user]);

  // Clean up ongoing uploads and polling timers on unmount or dialog close
  const cleanup = useCallback(() => {
    isPollingRef.current = false;
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const startPollingStatus = useCallback((targetUploadId: string) => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    isPollingRef.current = true;

    const poll = async () => {
      if (!isPollingRef.current) return;

      try {
        const statusRes = await api.uploads.getStatus(targetUploadId);
        if (!isPollingRef.current) return;

        const data = statusRes.data;
        const status = data?.status || (data as any)?.processingStatus;
        const queue = data?.queue || null;

        setProcessingStatus(status);
        setQueueState(queue);

        if (status === "COMPLETED") {
          isPollingRef.current = false;
          setStep("COMPLETED");
          toast.success("Video processing complete and ready for streaming!");
          return;
        }
        if (status === "FAILED") {
          isPollingRef.current = false;
          setStep("ERROR");
          setErrorMessage("Video transcoding failed. Ensure the source format is valid.");
          toast.error("Video processing failed.");
          return;
        }
      } catch (err: any) {
        console.warn("[UploadDialog] Status poll notice:", err?.message || err);
      }

      if (isPollingRef.current) {
        pollTimerRef.current = setTimeout(poll, 3000);
      }
    };

    poll();
  }, []);

  useEffect(() => {
    if (!isOpen) {
      cleanup();
    }
  }, [isOpen, cleanup]);

  const resetForm = () => {
    cleanup();
    setSelectedFile(null);
    setDetectedMeta(null);
    setTitle("");
    setDescription("");
    setVisibility("PUBLIC");
    setUploadPercent(0);
    setUploadId(null);
    setProcessingStatus("UPLOADING");
    setErrorMessage(null);
    setStep("SELECT_FILE");
    setIsDragging(false);
  };

  const handleClose = () => {
    if (step === "UPLOADING") {
      const confirmCancel = window.confirm(
        "An upload is in progress. Closing this dialog will cancel the upload. Proceed?",
      );
      if (!confirmCancel) return;
    }
    cleanup();
    resetForm();
    onClose();
  };

  // Handle Channel Creation
  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelName.trim() || !channelHandle.trim()) {
      toast.error("Please provide both channel name and handle.");
      return;
    }

    setIsCreatingChannel(true);
    try {
      const cleanHandle = channelHandle.trim().replace(/^@+/, "");
      await api.channels.create({
        channelName: channelName.trim(),
        handle: cleanHandle,
      });
      toast.success("Channel created successfully!");
      setStep("SELECT_FILE");
    } catch (err: any) {
      toast.error(err.message || "Failed to create channel");
    } finally {
      setIsCreatingChannel(false);
    }
  };

  // File selection validation & metadata extraction
  const handleFileChange = async (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type) && !file.name.match(/\.(mp4|webm|mov|mkv)$/i)) {
      toast.error("Unsupported file type. Please choose an MP4, WebM, or MOV video file.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error("Video file exceeds the 500 MB upload limit.");
      return;
    }

    setSelectedFile(file);
    const baseTitle = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ").trim();
    const formattedTitle = (baseTitle.charAt(0).toUpperCase() + baseTitle.slice(1)).slice(0, 100);
    setTitle(formattedTitle);
    setStep("DETAILS");

    try {
      const meta = await detectVideoMetadata(file);
      setDetectedMeta(meta);
    } catch {
      // Non-blocking fallback
    }
  };

  // Start the direct-to-storage upload and finalization flow
  const handleStartUpload = async () => {
    const sanitizedTitle = title.trim().slice(0, 100);
    if (!selectedFile || !sanitizedTitle) {
      toast.error("Please enter a video title.");
      return;
    }

    setStep("UPLOADING");
    setUploadPercent(0);
    setUploadedBytes(0);
    setTotalBytes(selectedFile.size);
    setErrorMessage(null);

    try {
      // 1. Create upload session in backend
      const session = await api.uploads.create({
        title: sanitizedTitle,
        description: description.trim() || undefined,
        visibility,
        fileName: selectedFile.name,
        contentType: selectedFile.type || "video/mp4",
      });

      const currentUploadId = session.data.uploadId;
      setUploadId(currentUploadId);
      const uploadSession = (session.data as any).uploadSession;

      if (!uploadSession?.uploadUrl) {
        throw new Error("Backend did not provide a direct upload URL.");
      }

      // 2. Direct binary HTTP PUT to storage
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;

        xhr.open(uploadSession.method || "PUT", uploadSession.uploadUrl);

        if (uploadSession.headers) {
          Object.entries(uploadSession.headers).forEach(([k, v]) => {
            xhr.setRequestHeader(k, v as string);
          });
        }

        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            const pct = Math.round((evt.loaded / evt.total) * 100);
            setUploadPercent(pct);
            setUploadedBytes(evt.loaded);
            setTotalBytes(evt.total);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(
              new Error(
                `Storage rejected upload with status ${xhr.status}: ${xhr.statusText}`,
              ),
            );
          }
        };

        xhr.onerror = () =>
          reject(new Error("Network failure during video transfer to storage."));
        xhr.onabort = () => reject(new Error("Upload cancelled by user."));

        xhr.send(selectedFile);
      });

      // 3. Finalize upload with the backend
      setStep("PROCESSING");
      setProcessingStatus("UPLOADING");
      setQueueState(null);

      const finalizeRes = await api.uploads.finalize(currentUploadId, {
        storageKey: uploadSession.key,
        resolution: detectedMeta?.resolutionName,
        width: detectedMeta?.width,
        height: detectedMeta?.height,
        duration: detectedMeta?.duration,
      });

      if (finalizeRes.data?.status === "COMPLETED") {
        setProcessingStatus("COMPLETED");
        setStep("COMPLETED");
        toast.success("Upload complete! Original video is ready for playback.");
        return;
      }

      toast.success("Video uploaded to storage! Verifying status...");
      startPollingStatus(currentUploadId);
    } catch (err: any) {
      if (err.message !== "Upload cancelled by user.") {
        setStep("ERROR");
        setErrorMessage(err.message || "Failed to complete upload.");
        toast.error(err.message || "Upload failed");
      }
    }
  };

  const handleRetryProcessing = async () => {
    if (!uploadId) return;
    setStep("PROCESSING");
    setProcessingStatus("UPLOADING");
    setErrorMessage(null);

    try {
      const finalizeRes = await api.uploads.finalize(uploadId, {
        resolution: detectedMeta?.resolutionName,
        width: detectedMeta?.width,
        height: detectedMeta?.height,
        duration: detectedMeta?.duration,
      });

      if (finalizeRes.data?.status === "COMPLETED") {
        setProcessingStatus("COMPLETED");
        setStep("COMPLETED");
        toast.success("Upload complete! Original video is ready for playback.");
        return;
      }

      toast.info("Retrying video verification...");
      startPollingStatus(uploadId);
    } catch (err: any) {
      setStep("ERROR");
      setErrorMessage(err.message || "Failed to retry processing.");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="w-[94vw] sm:max-w-xl p-0 overflow-hidden border border-black/10 dark:border-white/10 bg-white dark:bg-[#0c0c0e] shadow-2xl rounded-3xl gap-0 max-h-[92vh] flex flex-col">
        {/* Top Accent Hairline */}
        <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-[#ff3c00] to-transparent opacity-90 shrink-0" />

        {/* Clean Header */}
        <div className="p-5 sm:p-6 pb-4 border-b border-black/6 dark:border-white/8 flex items-start justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-2xl bg-[#ff3c00]/10 border border-[#ff3c00]/25 flex items-center justify-center text-[#ff3c00] shrink-0 shadow-[0_0_15px_rgba(255,60,0,0.15)]">
              <Video className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold tracking-widest text-[#ff3c00] uppercase shrink-0">
                  Vion Studio
                </span>
                <span className="w-1 h-1 rounded-full bg-neutral-300 dark:bg-neutral-700 shrink-0" />
                <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 shrink-0">
                  {step === "SELECT_FILE" && "Step 1/3"}
                  {step === "DETAILS" && "Step 2/3"}
                  {(step === "UPLOADING" || step === "PROCESSING") && "Step 3/3"}
                  {step === "COMPLETED" && "Done"}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white tracking-tight mt-0.5 truncate">
                Video Upload
              </h2>
            </div>
          </div>
        </div>

        {/* STEP 1: CREATE CHANNEL PROMPT */}
        {step === "CREATE_CHANNEL" && (
          <form onSubmit={handleCreateChannel} className="p-6 space-y-4">
            <div className="p-4 rounded-2xl bg-neutral-100/80 dark:bg-neutral-900/60 border border-black/8 dark:border-white/10 flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-[#ff3c00]/10 text-[#ff3c00] flex items-center justify-center shrink-0">
                <Tv className="w-4.5 h-4.5" />
              </div>
              <div className="text-xs space-y-1">
                <p className="font-semibold text-neutral-900 dark:text-white">
                  Creator Channel Setup Required
                </p>
                <p className="text-neutral-500 dark:text-neutral-400 leading-relaxed font-light">
                  Before publishing live wallpapers on Vion, initialize your creator identity so viewers can follow your work.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Channel Name
              </label>
              <Input
                type="text"
                placeholder="e.g. Lumina Motion Studio"
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                className="rounded-xl border-black/10 dark:border-white/10 bg-neutral-100/60 dark:bg-neutral-900/60 text-xs text-neutral-900 dark:text-white"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Channel Handle
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-xs text-neutral-400 font-mono">
                  @
                </span>
                <Input
                  type="text"
                  placeholder="luminamotion"
                  value={channelHandle}
                  onChange={(e) => setChannelHandle(e.target.value)}
                  className="pl-8 font-mono text-xs rounded-xl border-black/10 dark:border-white/10 bg-neutral-100/60 dark:bg-neutral-900/60 text-neutral-900 dark:text-white"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={isCreatingChannel}
              className="w-full text-xs font-semibold h-10 rounded-xl bg-[#ff3c00] hover:bg-[#e03500] text-white shadow-[0_0_20px_rgba(255,60,0,0.25)] transition-all mt-3 cursor-pointer"
            >
              {isCreatingChannel ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating Channel...
                </>
              ) : (
                "Create Channel & Proceed"
              )}
            </Button>
          </form>
        )}

        {/* STEP 2: SELECT FILE */}
        {step === "SELECT_FILE" && (
          <div className="p-6">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,video/x-matroska"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handleFileChange(e.target.files[0]);
              }}
            />

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files?.[0]) {
                  handleFileChange(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-3xl p-10 sm:p-12 text-center cursor-pointer transition-all duration-300 group flex flex-col items-center justify-center space-y-4 select-none ${
                isDragging
                  ? "border-[#ff3c00] bg-[#ff3c00]/8 scale-[0.99] shadow-[0_0_30px_rgba(255,60,0,0.15)]"
                  : "border-black/12 dark:border-white/12 hover:border-[#ff3c00]/70 dark:hover:border-[#ff3c00]/70 bg-neutral-50/70 dark:bg-neutral-900/30 hover:bg-neutral-100/80 dark:hover:bg-neutral-900/60"
              }`}
            >
              {/* Concentric Pedestal */}
              <div className="relative flex items-center justify-center">
                <div className="w-18 h-18 rounded-full bg-black/4 dark:bg-white/4 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <div className="w-14 h-14 rounded-full bg-[#ff3c00]/10 border border-[#ff3c00]/30 flex items-center justify-center text-[#ff3c00] shadow-[0_0_20px_rgba(255,60,0,0.2)] group-hover:bg-[#ff3c00] group-hover:text-white transition-colors duration-300">
                    <UploadIcon className="w-6 h-6 group-hover:-translate-y-0.5 transition-transform duration-300" />
                  </div>
                </div>
              </div>

              {/* Title & Microcopy */}
              <div className="space-y-1.5 max-w-sm">
                <p className="text-sm font-bold text-neutral-900 dark:text-white group-hover:text-[#ff3c00] transition-colors">
                  Click to select or drag and drop a video file
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 font-light">
                  Direct binary upload with adaptive HLS encoding on upload completion.
                </p>
              </div>

              {/* Spec Pills */}
              <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2">
                {["MP4", "WebM", "MOV", "Max 500 MB"].map((spec) => (
                  <span
                    key={spec}
                    className="px-2.5 py-1 rounded-md text-[10px] font-mono font-medium tracking-wide bg-neutral-100 dark:bg-neutral-900 border border-black/8 dark:border-white/10 text-neutral-600 dark:text-neutral-400"
                  >
                    {spec}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: DETAILS */}
        {step === "DETAILS" && (
          <div className="p-5 sm:p-6 space-y-4 overflow-y-auto max-h-[calc(92vh-100px)] min-w-0">
            {/* Selected File Card */}
            <div className="flex items-center justify-between p-3 sm:p-3.5 rounded-2xl bg-neutral-100/80 dark:bg-neutral-900/70 border border-black/8 dark:border-white/10 text-xs min-w-0 w-full overflow-hidden">
              <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden pr-3">
                <div className="w-9 h-9 rounded-xl bg-[#ff3c00]/10 border border-[#ff3c00]/20 flex items-center justify-center text-[#ff3c00] shrink-0">
                  <FileVideo className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p
                    className="font-semibold text-neutral-900 dark:text-white truncate block"
                    title={selectedFile?.name}
                  >
                    {selectedFile?.name}
                  </p>
                  <p className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400 truncate">
                    {((selectedFile?.size || 0) / (1024 * 1024)).toFixed(1)} MB
                    {detectedMeta ? ` • ${detectedMeta.formattedResolution}` : " • Ready to transfer"}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep("SELECT_FILE")}
                className="h-8 rounded-full text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer shrink-0"
              >
                Change
              </Button>
            </div>

            {/* Title Field */}
            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                  Video Title <span className="text-[#ff3c00]">*</span>
                </label>
                <span className="text-[10px] font-mono text-neutral-400 shrink-0">
                  {title.length}/100
                </span>
              </div>
              <Input
                type="text"
                placeholder="e.g. Celestial Orbit — 4K 60fps"
                value={title}
                maxLength={100}
                onChange={(e) => setTitle(e.target.value.slice(0, 100))}
                className="w-full rounded-xl border-black/10 dark:border-white/10 bg-neutral-100/60 dark:bg-neutral-900/60 text-xs text-neutral-900 dark:text-white focus:border-[#ff3c00] focus:ring-[#ff3c00]/20"
                required
              />
            </div>

            {/* Description Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                Description (Optional)
              </label>
              <textarea
                rows={2}
                placeholder="Provide notes on the wallpaper's resolution, visual aesthetics, or creation process..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-neutral-100/60 dark:bg-neutral-900/60 px-3.5 py-2.5 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-hidden focus:border-[#ff3c00] focus:ring-1 focus:ring-[#ff3c00]/20 resize-none"
              />
            </div>

            {/* Visibility Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                Visibility Setting
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    id: "PUBLIC" as UploadVisibility,
                    label: "Public",
                    desc: "Visible in Discover",
                    icon: Globe,
                  },
                  {
                    id: "UNLISTED" as UploadVisibility,
                    label: "Unlisted",
                    desc: "Direct link only",
                    icon: Link2,
                  },
                  {
                    id: "PRIVATE" as UploadVisibility,
                    label: "Private",
                    desc: "Only you can see",
                    icon: Lock,
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  const isSelected = visibility === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setVisibility(item.id)}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? "border-[#ff3c00] bg-[#ff3c00]/10 text-neutral-900 dark:text-white shadow-[0_0_15px_rgba(255,60,0,0.12)] ring-1 ring-[#ff3c00]/30"
                          : "border-black/10 dark:border-white/10 bg-neutral-50/80 dark:bg-neutral-900/40 text-neutral-600 dark:text-neutral-400 hover:border-black/20 dark:hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <Icon
                          className={`w-3.5 h-3.5 ${
                            isSelected ? "text-[#ff3c00]" : "text-neutral-400"
                          }`}
                        />
                        {isSelected && (
                          <div className="w-1.5 h-1.5 rounded-full bg-[#ff3c00]" />
                        )}
                      </div>
                      <span className="text-xs font-bold block">{item.label}</span>
                      <span className="text-[10px] text-neutral-500 dark:text-neutral-400 block mt-0.5 font-light">
                        {item.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-black/6 dark:border-white/8">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                className="rounded-full text-xs font-semibold px-4 h-9 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleStartUpload}
                className="rounded-full text-xs font-semibold px-6 h-9 bg-[#ff3c00] hover:bg-[#e03500] text-white shadow-[0_0_20px_rgba(255,60,0,0.3)] transition-all active:scale-95 cursor-pointer gap-1.5"
              >
                <span>Start Upload</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 4: UPLOADING */}
        {step === "UPLOADING" && (
          <div className="p-6 sm:p-8 py-8 sm:py-10 space-y-6 text-center min-w-0 overflow-hidden">
            {/* Glowing Beacon */}
            <div className="relative flex items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-[#ff3c00]/10 flex items-center justify-center animate-pulse">
                <div className="w-14 h-14 rounded-full bg-[#ff3c00]/20 border border-[#ff3c00]/40 flex items-center justify-center text-[#ff3c00] shadow-[0_0_25px_rgba(255,60,0,0.3)]">
                  <UploadIcon className="w-6 h-6 animate-bounce" />
                </div>
              </div>
            </div>

            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center justify-center gap-2">
                <span className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-neutral-900 dark:text-white">
                  {uploadPercent}%
                </span>
              </div>
              <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                Uploading video...
              </p>
              <p className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400">
                {((uploadedBytes / (1024 * 1024)).toFixed(1))} MB of{" "}
                {((totalBytes / (1024 * 1024)).toFixed(1))} MB
              </p>
            </div>

            {/* Glowing Progress Track */}
            <div className="w-full max-w-md mx-auto h-2 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden relative">
              <div
                className="h-full bg-gradient-to-r from-[#ff6b3d] to-[#ff3c00] transition-all duration-150 ease-out shadow-[0_0_12px_rgba(255,60,0,0.5)]"
                style={{ width: `${uploadPercent}%` }}
              />
            </div>

            {/* Active Video Info Card */}
            <div className="max-w-sm sm:max-w-md mx-auto p-3 rounded-2xl bg-neutral-100/70 dark:bg-neutral-900/50 border border-black/8 dark:border-white/10 text-left min-w-0 w-full overflow-hidden">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-[#ff3c00]/10 text-[#ff3c00] flex items-center justify-center shrink-0">
                  <FileVideo className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p className="text-xs font-semibold text-neutral-900 dark:text-white truncate block" title={title || selectedFile?.name}>
                    {title || selectedFile?.name}
                  </p>
                  <p className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400 truncate block" title={selectedFile?.name}>
                    {selectedFile?.name}
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={handleClose}
                className="rounded-full text-xs text-red-500 border-red-500/20 hover:bg-red-500/10 cursor-pointer h-8 px-4"
              >
                Cancel Transfer
              </Button>
            </div>
          </div>
        )}

        {/* STEP 5: VERIFYING STORAGE */}
        {step === "PROCESSING" && (
          <div className="p-6 sm:p-8 py-8 sm:py-10 space-y-6 text-center min-w-0 overflow-hidden">
            <div className="relative flex items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-[#ff3c00]/10 flex items-center justify-center animate-pulse">
                <div className="w-14 h-14 rounded-full bg-[#ff3c00]/20 border border-[#ff3c00]/30 flex items-center justify-center text-[#ff3c00] shadow-[0_0_25px_rgba(255,60,0,0.2)]">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              </div>
            </div>

            <div className="space-y-1.5 min-w-0">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold bg-[#ff3c00]/10 text-[#ff3c00] border border-[#ff3c00]/20">
                <Clock className="w-3.5 h-3.5" />
                <span>STORAGE VERIFICATION</span>
              </div>
              <h3 className="text-base font-bold text-neutral-900 dark:text-white pt-1">
                Verifying video deposit...
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto leading-relaxed font-light">
                Verifying the uploaded video file in storage. Direct streaming at original quality will be enabled once verified.
              </p>
            </div>

            {/* Video preview pill */}
            <div className="max-w-sm sm:max-w-md mx-auto p-3 rounded-2xl bg-neutral-100/70 dark:bg-neutral-900/50 border border-black/8 dark:border-white/10 text-left min-w-0 w-full overflow-hidden">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-[#ff3c00]/10 text-[#ff3c00] flex items-center justify-center shrink-0">
                  <FileVideo className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p className="text-xs font-semibold text-neutral-900 dark:text-white truncate block" title={title || selectedFile?.name}>
                    {title || selectedFile?.name}
                  </p>
                  <p className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400 truncate block">
                    {detectedMeta?.formattedResolution || selectedFile?.name}
                  </p>
                </div>
              </div>
            </div>

            {detectedMeta && (
              <div className="flex items-center justify-center gap-2 pt-1">
                <span className="px-3 py-1 rounded-full text-[11px] font-mono font-medium bg-neutral-100 dark:bg-neutral-900 border border-black/8 dark:border-white/10 text-neutral-700 dark:text-neutral-300 truncate max-w-xs">
                  Detected: {detectedMeta.formattedResolution}
                </span>
              </div>
            )}

            {uploadId && (
              <div className="pt-1">
                <Link href={`/watch/${uploadId}`} onClick={onClose}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full text-xs font-semibold px-5 h-8.5 border-black/10 dark:border-white/15 bg-neutral-100 dark:bg-neutral-900 text-neutral-900 dark:text-white hover:bg-neutral-200 dark:hover:bg-neutral-800 gap-1.5 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Preview Video Page
                  </Button>
                </Link>
              </div>
            )}
          </div>
        )}

        {/* STEP 6: COMPLETED */}
        {step === "COMPLETED" && (
          <div className="p-6 sm:p-8 py-8 sm:py-10 space-y-6 text-center min-w-0 overflow-hidden">
            <div className="relative flex items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.3)]">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
              </div>
            </div>

            <div className="space-y-2 min-w-0">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>UPLOAD COMPLETE</span>
              </div>
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
                Original Quality Available
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto leading-relaxed font-light">
                Your video is verified and ready for streaming at its source resolution.
              </p>
            </div>

            {/* Completed Title Card */}
            <div className="max-w-sm sm:max-w-md mx-auto p-3 rounded-2xl bg-neutral-100/70 dark:bg-neutral-900/50 border border-black/8 dark:border-white/10 text-left min-w-0 w-full overflow-hidden">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p className="text-xs font-semibold text-neutral-900 dark:text-white truncate block" title={title || selectedFile?.name}>
                    {title || selectedFile?.name}
                  </p>
                  <p className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400 truncate block">
                    {detectedMeta?.formattedResolution || "Original Source Quality"}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={resetForm}
                className="rounded-full text-xs font-semibold px-5 h-9 border-black/10 dark:border-white/15 text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
              >
                Upload Another
              </Button>
              {uploadId && (
                <Link href={`/watch/${uploadId}`} onClick={onClose}>
                  <Button
                    size="sm"
                    className="rounded-full text-xs font-semibold px-6 h-9 bg-[#ff3c00] hover:bg-[#e03500] text-white shadow-[0_0_20px_rgba(255,60,0,0.3)] gap-1.5 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Watch Video
                  </Button>
                </Link>
              )}
            </div>
          </div>
        )}

        {/* STEP 7: ERROR */}
        {step === "ERROR" && (
          <div className="p-6 sm:p-8 py-8 sm:py-10 space-y-6 text-center min-w-0 overflow-hidden">
            <div className="relative flex items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center">
                <div className="w-14 h-14 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-500 shadow-[0_0_25px_rgba(239,68,68,0.25)]">
                  <AlertCircle className="w-7 h-7" />
                </div>
              </div>
            </div>

            <div className="space-y-1.5 min-w-0">
              <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                Upload & Processing Notice
              </h3>
              <p className="text-xs text-red-500 max-w-sm mx-auto leading-relaxed break-words px-2">
                {errorMessage || "An unexpected error occurred during processing."}
              </p>
            </div>

            <div className="flex items-center justify-center gap-2.5 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                className="rounded-full text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
              >
                Dismiss
              </Button>
              {uploadId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRetryProcessing}
                  className="rounded-full text-xs font-semibold px-4 h-8.5 border-black/10 dark:border-white/15 gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Retry Processing
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => setStep("SELECT_FILE")}
                className="rounded-full text-xs font-semibold px-5 h-8.5 bg-[#ff3c00] hover:bg-[#e03500] text-white shadow-[0_0_15px_rgba(255,60,0,0.25)] cursor-pointer"
              >
                Select Another File
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
