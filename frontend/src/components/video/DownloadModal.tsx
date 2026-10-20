"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Download,
  Check,
  Film,
  Sparkles,
  Monitor,
  Smartphone,
  Loader2,
  HardDrive,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface RenditionOption {
  id?: string;
  resolution: string;
  url?: string;
}

interface DownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoTitle: string;
  thumbnailUrl?: string | null;
  renditions: RenditionOption[];
  onDownload: (resolution: string) => Promise<void>;
  downloadingQuality: string | null;
}

const QUALITY_META: Record<
  string,
  { label: string; tag: string; icon: React.ReactNode; desc: string }
> = {
  "1080p": {
    label: "1080p Full HD",
    tag: "Best Quality",
    icon: <Sparkles className="w-4 h-4 text-amber-400" />,
    desc: "Crisp 1080p high bitrate • Best for TV & Desktop",
  },
  "720p": {
    label: "720p HD",
    tag: "Recommended",
    icon: <Monitor className="w-4 h-4 text-emerald-400" />,
    desc: "Balanced high-definition • Great quality & file size",
  },
  "480p": {
    label: "480p SD",
    tag: "Standard",
    icon: <Film className="w-4 h-4 text-blue-400" />,
    desc: "Standard definition • Smooth playback on laptops",
  },
  "360p": {
    label: "360p Mobile",
    tag: "Data Saver",
    icon: <Smartphone className="w-4 h-4 text-purple-400" />,
    desc: "Lightweight MP4 • Fastest download, minimal storage",
  },
};

export const DownloadModal: React.FC<DownloadModalProps> = ({
  isOpen,
  onClose,
  videoTitle,
  thumbnailUrl,
  renditions,
  onDownload,
  downloadingQuality,
}) => {
  // Sort descending by resolution height (e.g. 1080p > 720p > 480p > 360p)
  const parseHeight = (res: string) => {
    const match = res.match(/(\d+)/);
    return match && match[1] ? parseInt(match[1], 10) : 0;
  };

  const sortedRenditions = [...renditions].sort(
    (a, b) => parseHeight(b.resolution) - parseHeight(a.resolution),
  );

  const [selectedQuality, setSelectedQuality] = useState<string>(
    sortedRenditions[0]?.resolution || "1080p",
  );

  // Sync default when renditions change or modal opens
  React.useEffect(() => {
    if (sortedRenditions.length > 0 && (!selectedQuality || !sortedRenditions.find(r => r.resolution === selectedQuality))) {
      setSelectedQuality(sortedRenditions[0]?.resolution || "1080p");
    }
  }, [sortedRenditions, selectedQuality]);

  const handleStartDownload = async (resolution: string) => {
    setSelectedQuality(resolution);
    await onDownload(resolution);
    // Don't close immediately if there's an error; onDownload handles success toasts
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md w-[92vw] p-6 rounded-2xl bg-card/95 backdrop-blur-xl border border-border/80 shadow-2xl">
        <DialogHeader className="space-y-1.5 text-left">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-(--brand)/20 to-(--brand)/5 border border-(--brand)/30 flex items-center justify-center text-(--brand)">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground tracking-tight">
                Download Video
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Select your preferred MP4 resolution to download
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Video Card Snippet */}
        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/40 border border-border/60">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt=""
              className="w-16 h-10 object-cover rounded-lg shrink-0 border border-border/50"
            />
          ) : (
            <div className="w-16 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Film className="w-5 h-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-foreground truncate" title={videoTitle}>
              {videoTitle || "Untitled Video"}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-(--brand)/15 text-(--brand) font-bold">
                MP4 Video
              </span>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <HardDrive className="w-3 h-3" />
                H.264 / AAC
              </span>
            </div>
          </div>
        </div>

        {/* Resolution Options List */}
        <div className="space-y-2 mt-1">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
            Available Resolutions
          </label>

          {sortedRenditions.length === 0 ? (
            <div className="p-4 text-center rounded-xl bg-muted/20 border border-dashed border-border text-xs text-muted-foreground">
              No downloadable renditions available for this video yet.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[42vh] overflow-y-auto pr-0.5">
              {sortedRenditions.map((item) => {
                const isSelected = selectedQuality === item.resolution;
                const isCurrentlyDownloading = downloadingQuality === item.resolution;
                const meta = QUALITY_META[item.resolution] || {
                  label: `${item.resolution} MP4`,
                  tag: "Standard",
                  icon: <Film className="w-4 h-4 text-foreground/80" />,
                  desc: `${item.resolution} Progressive Video`,
                };

                return (
                  <div
                    key={item.id || item.resolution}
                    onClick={() => setSelectedQuality(item.resolution)}
                    className={cn(
                      "group relative flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer",
                      isSelected
                        ? "bg-(--brand)/10 border-(--brand) shadow-sm shadow-(--brand)/10"
                        : "bg-card hover:bg-muted/50 border-border hover:border-border/80",
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={cn(
                          "w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                          isSelected
                            ? "border-(--brand) bg-(--brand) text-[var(--brand-foreground,white)]"
                            : "border-muted-foreground/40 group-hover:border-foreground/60",
                        )}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-foreground">
                            {meta.label}
                          </span>
                          <span
                            className={cn(
                              "text-[10px] font-medium px-1.5 py-0.2 rounded-full border",
                              isSelected
                                ? "bg-(--brand)/20 text-(--brand) border-(--brand)/30"
                                : "bg-muted text-muted-foreground border-transparent",
                            )}
                          >
                            {meta.tag}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          {meta.desc}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <Button
                        size="sm"
                        variant={isSelected ? "default" : "ghost"}
                        disabled={Boolean(downloadingQuality)}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartDownload(item.resolution);
                        }}
                        className={cn(
                          "h-7 px-2.5 text-xs font-semibold rounded-lg gap-1 transition-all cursor-pointer",
                          isSelected
                            ? "bg-(--brand) text-white hover:bg-(--brand)/90 shadow-sm"
                            : "hover:bg-accent text-foreground",
                        )}
                      >
                        {isCurrentlyDownloading ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Download className="w-3 h-3" />
                        )}
                        <span>Get</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/60 mt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={Boolean(downloadingQuality)}
            className="text-xs text-muted-foreground hover:text-foreground cursor-pointer rounded-xl"
          >
            Cancel
          </Button>

          <Button
            type="button"
            size="sm"
            disabled={Boolean(downloadingQuality) || !selectedQuality || sortedRenditions.length === 0}
            onClick={() => handleStartDownload(selectedQuality)}
            className="text-xs font-bold rounded-xl gap-1.5 px-4 h-9 bg-(--brand) text-white hover:bg-(--brand)/90 shadow-md shadow-(--brand)/20 cursor-pointer transition-all"
          >
            {downloadingQuality ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Preparing Download...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Download {selectedQuality}</span>
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
