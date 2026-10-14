"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import type { UploadVisibility } from "@/types/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
        // Log non-fatal polling notice and retry smoothly after interval
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
    // Auto-populate title from filename without extension
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
            reject(new Error(`Storage rejected upload with status ${xhr.status}: ${xhr.statusText}`));
          }
        };

        xhr.onerror = () => reject(new Error("Network failure during video transfer to storage."));
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
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="w-5 h-5 text-[var(--brand)]" />
            <span>Vion Studio — Video Upload</span>
          </DialogTitle>
          <DialogDescription>
            Upload high-resolution video for adaptive HLS streaming on Vion.
          </DialogDescription>
        </DialogHeader>

        {/* STEP 1: CREATE CHANNEL PROMPT */}
        {step === "CREATE_CHANNEL" && (
          <form onSubmit={handleCreateChannel} className="space-y-4 py-2">
            <div className="p-4 rounded-xl bg-secondary/50 border border-border flex items-start gap-3">
              <Tv className="w-5 h-5 text-[var(--brand)] shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-semibold text-foreground">Channel Setup Required</p>
                <p className="text-muted-foreground">
                  Before uploading videos on Vion, create your channel profile.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Channel Name
              </label>
              <Input
                type="text"
                placeholder="e.g. Pixel Pulse Tech"
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Channel Handle
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3 text-xs text-muted-foreground">@</span>
                <Input
                  type="text"
                  placeholder="pixelpulse"
                  value={channelHandle}
                  onChange={(e) => setChannelHandle(e.target.value)}
                  className="pl-7 font-mono text-xs"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="brand"
              disabled={isCreatingChannel}
              className="w-full text-xs font-semibold h-10 mt-2"
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
          <div className="space-y-4 py-4">
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
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files?.[0]) handleFileChange(e.dataTransfer.files[0]);
              }}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border hover:border-[var(--brand)] rounded-2xl p-8 text-center cursor-pointer transition-colors bg-secondary/20 hover:bg-secondary/40 group flex flex-col items-center justify-center space-y-3"
            >
              <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center group-hover:scale-110 transition-transform">
                <UploadIcon className="w-7 h-7 text-[var(--brand)]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Click to select or drag and drop a video file
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  MP4, WebM, MOV up to 500 MB
                </p>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: DETAILS */}
        {step === "DETAILS" && (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/50 border border-border text-xs">
              <div className="flex items-center gap-2 truncate">
                <Video className="w-4 h-4 text-[var(--brand)] shrink-0" />
                <span className="font-semibold text-foreground truncate">
                  {selectedFile?.name}
                </span>
                <span className="text-muted-foreground shrink-0">
                  ({((selectedFile?.size || 0) / (1024 * 1024)).toFixed(1)} MB)
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep("SELECT_FILE")}
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
              >
                Change
              </Button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Title <span className="text-destructive">*</span>
              </label>
              <Input
                type="text"
                placeholder="Give your video a title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Description (Optional)
              </label>
              <textarea
                rows={3}
                placeholder="Tell viewers what your video is about..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-xl border border-input bg-card px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Visibility
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["PUBLIC", "UNLISTED", "PRIVATE"] as UploadVisibility[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVisibility(v)}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                      visibility === v
                        ? "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]"
                        : "border-border bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={handleClose}>
                Cancel
              </Button>
              <Button variant="brand" size="sm" onClick={handleStartUpload}>
                Start Upload
              </Button>
            </div>
          </div>
        )}

        {/* STEP 4: UPLOADING */}
        {step === "UPLOADING" && (
          <div className="space-y-5 py-6 text-center">
            <div className="w-14 h-14 rounded-full bg-[var(--brand)]/10 text-[var(--brand)] flex items-center justify-center mx-auto animate-pulse">
              <UploadIcon className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <p className="text-sm font-bold text-foreground">
                Uploading to Storage... {uploadPercent}%
              </p>
              <p className="text-xs text-muted-foreground font-mono">
                {((uploadedBytes / (1024 * 1024)).toFixed(1))} MB of{" "}
                {((totalBytes / (1024 * 1024)).toFixed(1))} MB
              </p>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-2.5 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-[var(--brand)] transition-all duration-150 ease-out"
                style={{ width: `${uploadPercent}%` }}
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleClose}
              className="text-xs text-destructive border-destructive/20 hover:bg-destructive/10"
            >
              Cancel Transfer
            </Button>
          </div>
        )}

        {/* STEP 5: PROCESSING */}
        {step === "PROCESSING" && (
          <div className="space-y-5 py-6 text-center">
            {processingStatus === "TRANSCODING" || queueState?.state === "active" ? (
              <>
                <div className="w-14 h-14 rounded-full bg-[var(--brand)]/10 text-[var(--brand)] flex items-center justify-center mx-auto">
                  <Loader2 className="w-7 h-7 animate-spin" />
                </div>

                <div className="space-y-1">
                  <p className="text-sm font-bold text-foreground">
                    Video Processing in Progress
                  </p>
                  <div className="flex items-center justify-center gap-1.5 py-1">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-[var(--brand)]/10 text-[var(--brand)] border border-[var(--brand)]/20">
                      TRANSCODING
                    </span>
                    {typeof queueState?.progress === "number" && queueState.progress > 0 && (
                      <span className="text-xs font-mono font-bold text-foreground">
                        {queueState.progress}%
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2 max-w-sm mx-auto">
                    Transcoding worker is generating adaptive HLS renditions (1080p, 720p, 480p, 360p) and video thumbnails in the background. You may close this window or wait.
                  </p>
                </div>

                {typeof queueState?.progress === "number" && queueState.progress > 0 && (
                  <div className="w-full max-w-xs mx-auto h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full bg-[var(--brand)] transition-all duration-300"
                      style={{ width: `${queueState.progress}%` }}
                    />
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="w-14 h-14 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto animate-pulse">
                  <Clock className="w-7 h-7" />
                </div>

                <div className="space-y-1">
                  <p className="text-sm font-bold text-foreground">
                    Upload Complete — Waiting in Queue
                  </p>
                  <div className="flex items-center justify-center gap-1.5 py-1">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                      QUEUED (WAITING FOR WORKER)
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2 max-w-sm mx-auto">
                    Your video file transfer to storage is complete. The job is queued in Redis and waiting for an active transcoding worker to begin encoding.
                  </p>
                </div>
              </>
            )}

            {uploadId && (
              <div className="pt-2">
                <Link href={`/watch/${uploadId}`} onClick={onClose}>
                  <Button variant="secondary" size="sm" className="text-xs gap-1.5">
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
          <div className="space-y-5 py-6 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <p className="text-sm font-bold text-foreground">
                Video Ready For Streaming!
              </p>
              <p className="text-xs text-muted-foreground">
                Transcoding completed successfully and master HLS playlist generated.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={resetForm}>
                Upload Another
              </Button>
              {uploadId && (
                <Link href={`/watch/${uploadId}`} onClick={onClose}>
                  <Button variant="brand" size="sm" className="gap-1.5">
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
          <div className="space-y-5 py-6 text-center">
            <div className="w-14 h-14 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
              <AlertCircle className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <p className="text-sm font-bold text-foreground">Upload & Processing Notice</p>
              <p className="text-xs text-destructive max-w-sm mx-auto">
                {errorMessage || "An unexpected error occurred."}
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={handleClose}>
                Dismiss
              </Button>
              {uploadId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRetryProcessing}
                  className="gap-1.5 text-xs"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Retry Processing
                </Button>
              )}
              <Button variant="brand" size="sm" onClick={() => setStep("SELECT_FILE")}>
                Upload Another File
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
