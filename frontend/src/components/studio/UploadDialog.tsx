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

export function UploadDialog({ isOpen, onClose }: UploadDialogProps) {
  const { user } = useAuth();

  const [step, setStep] = useState<UploadStep>("SELECT_FILE");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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

  // File selection validation
  const handleFileChange = (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type) && !file.name.match(/\.(mp4|webm|mov|mkv)$/i)) {
      toast.error("Unsupported file type. Please choose an MP4, WebM, or MOV video file.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error("Video file exceeds the 500 MB upload limit.");
      return;
    }

    setSelectedFile(file);
    const baseTitle = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
    setTitle(baseTitle.charAt(0).toUpperCase() + baseTitle.slice(1));
    setStep("DETAILS");
  };

  // Start the direct-to-storage upload and finalization flow
  const handleStartUpload = async () => {
    if (!selectedFile || !title.trim()) {
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
        title: title.trim(),
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

      await api.uploads.finalize(currentUploadId, {
        storageKey: uploadSession.key,
      });

      toast.success("Video uploaded to storage! Waiting for processing worker...");

      // 4. Poll processing status safely without request stacking
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
      await api.uploads.finalize(uploadId);
      toast.info("Retrying video processing finalization...");
      startPollingStatus(uploadId);
    } catch (err: any) {
      setStep("ERROR");
      setErrorMessage(err.message || "Failed to retry processing.");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-xl p-0 overflow-hidden border border-black/10 dark:border-white/10 bg-white dark:bg-[#0c0c0e] shadow-2xl rounded-3xl gap-0">
        {/* Top Accent Hairline */}
        <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-[#ff3c00] to-transparent opacity-90" />

        {/* Clean Header */}
        <div className="p-6 pb-4 border-b border-black/6 dark:border-white/8 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-[#ff3c00]/10 border border-[#ff3c00]/25 flex items-center justify-center text-[#ff3c00] shrink-0 shadow-[0_0_15px_rgba(255,60,0,0.15)]">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold tracking-widest text-[#ff3c00] uppercase">
                  Vion Studio
                </span>
                <span className="w-1 h-1 rounded-full bg-neutral-300 dark:bg-neutral-700" />
                <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
                  {step === "SELECT_FILE" && "Step 1/3"}
                  {step === "DETAILS" && "Step 2/3"}
                  {(step === "UPLOADING" || step === "PROCESSING") && "Step 3/3"}
                  {step === "COMPLETED" && "Done"}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white tracking-tight mt-0.5">
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
          <div className="p-6 space-y-4">
            {/* Selected File Card */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-neutral-100/80 dark:bg-neutral-900/70 border border-black/8 dark:border-white/10 text-xs">
              <div className="flex items-center gap-3 min-w-0 pr-2">
                <div className="w-9 h-9 rounded-xl bg-[#ff3c00]/10 border border-[#ff3c00]/20 flex items-center justify-center text-[#ff3c00] shrink-0">
                  <FileVideo className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-neutral-900 dark:text-white truncate">
                    {selectedFile?.name}
                  </p>
                  <p className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400">
                    {((selectedFile?.size || 0) / (1024 * 1024)).toFixed(1)} MB • Ready to transfer
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
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                  Video Title <span className="text-[#ff3c00]">*</span>
                </label>
                <span className="text-[10px] font-mono text-neutral-400">
                  {title.length}/100
                </span>
              </div>
              <Input
                type="text"
                placeholder="e.g. Celestial Orbit — 4K 60fps"
                value={title}
                maxLength={100}
                onChange={(e) => setTitle(e.target.value)}
                className="rounded-xl border-black/10 dark:border-white/10 bg-neutral-100/60 dark:bg-neutral-900/60 text-xs text-neutral-900 dark:text-white focus:border-[#ff3c00] focus:ring-[#ff3c00]/20"
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
          <div className="p-8 py-10 space-y-6 text-center">
            {/* Glowing Beacon */}
            <div className="relative flex items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-[#ff3c00]/10 flex items-center justify-center animate-pulse">
                <div className="w-14 h-14 rounded-full bg-[#ff3c00]/20 border border-[#ff3c00]/40 flex items-center justify-center text-[#ff3c00] shadow-[0_0_25px_rgba(255,60,0,0.3)]">
                  <UploadIcon className="w-6 h-6 animate-bounce" />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-center gap-2">
                <span className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-neutral-900 dark:text-white">
                  {uploadPercent}%
                </span>
              </div>
              <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                Direct Storage Transfer Active
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

            <div className="pt-2">
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

        {/* STEP 5: PROCESSING */}
        {step === "PROCESSING" && (
          <div className="p-8 py-10 space-y-6 text-center">
            {processingStatus === "TRANSCODING" || queueState?.state === "active" ? (
              <>
                <div className="relative flex items-center justify-center">
                  <div className="w-20 h-20 rounded-full bg-[#ff3c00]/10 flex items-center justify-center">
                    <div className="w-14 h-14 rounded-full bg-[#ff3c00]/20 border border-[#ff3c00]/40 flex items-center justify-center text-[#ff3c00] shadow-[0_0_25px_rgba(255,60,0,0.3)]">
                      <Loader2 className="w-7 h-7 animate-spin" />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold bg-[#ff3c00]/10 text-[#ff3c00] border border-[#ff3c00]/20">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>ADAPTIVE HLS ENCODING</span>
                  </div>
                  <h3 className="text-base font-bold text-neutral-900 dark:text-white pt-1">
                    Generating Adaptive Streams
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto leading-relaxed font-light">
                    Worker is encoding 1080p, 720p, 480p, and 360p renditions with master playlists for fluid live playback.
                  </p>
                </div>

                {/* Progress bar if numerical */}
                {typeof queueState?.progress === "number" && queueState.progress > 0 && (
                  <div className="w-full max-w-xs mx-auto space-y-1">
                    <div className="flex justify-between text-[10px] font-mono text-neutral-400">
                      <span>Transcoding</span>
                      <span>{queueState.progress}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
                      <div
                        className="h-full bg-[#ff3c00] transition-all duration-300"
                        style={{ width: `${queueState.progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="relative flex items-center justify-center">
                  <div className="w-20 h-20 rounded-full bg-amber-500/10 flex items-center justify-center animate-pulse">
                    <div className="w-14 h-14 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-500 shadow-[0_0_25px_rgba(245,158,11,0.2)]">
                      <Clock className="w-6 h-6" />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                    <Clock className="w-3.5 h-3.5" />
                    <span>QUEUED IN REDIS</span>
                  </div>
                  <h3 className="text-base font-bold text-neutral-900 dark:text-white pt-1">
                    Upload Complete — Waiting for Worker
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto leading-relaxed font-light">
                    Your video file is safely deposited in storage. A background transcoding worker will automatically pick up the job.
                  </p>
                </div>
              </>
            )}

            {/* Rendition Preview Pills */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              {["1080p Full HD", "720p HD", "480p SD", "Thumbnails"].map((r) => (
                <span
                  key={r}
                  className="px-2.5 py-1 rounded-full text-[10px] font-mono font-medium bg-neutral-100 dark:bg-neutral-900 border border-black/8 dark:border-white/10 text-neutral-600 dark:text-neutral-400"
                >
                  {r}
                </span>
              ))}
            </div>

            {uploadId && (
              <div className="pt-2">
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
          <div className="p-8 py-10 space-y-6 text-center">
            <div className="relative flex items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.3)]">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
                Video Ready For Streaming!
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto leading-relaxed font-light">
                Transcoding completed successfully. Multi-bitrate HLS adaptive manifest is now generated and active.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
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
          <div className="p-8 py-10 space-y-6 text-center">
            <div className="relative flex items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center">
                <div className="w-14 h-14 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-500 shadow-[0_0_25px_rgba(239,68,68,0.25)]">
                  <AlertCircle className="w-7 h-7" />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                Upload & Processing Notice
              </h3>
              <p className="text-xs text-red-500 max-w-sm mx-auto leading-relaxed">
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
