"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Settings,
  RotateCcw,
  AlertTriangle,
  Loader2,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface HlsVideoPlayerProps {
  videoId: string;
  manifestUrl?: string | null;
  thumbnailUrl?: string | null;
  title: string;
  isProcessing?: boolean;
  initialProgressSeconds?: number;
  className?: string;
  availableResolutions?: string[];
  onDownloadQuality?: (quality: string) => void;
}

interface QualityLevel {
  index: number;
  height: number;
  bitrate: number;
  label: string;
}

export function HlsVideoPlayer({
  videoId,
  manifestUrl,
  thumbnailUrl,
  title,
  isProcessing = false,
  initialProgressSeconds = 0,
  className,
  availableResolutions,
  onDownloadQuality,
}: HlsVideoPlayerProps) {
  const { user } = useAuth();

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Playback states
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedTime, setBufferedTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [controlsTimeout, setControlsTimeout] = useState<NodeJS.Timeout | null>(null);

  // Quality levels
  const [levels, setLevels] = useState<QualityLevel[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1); // -1 = Auto
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);

  // Progress synchronization throttle tracking
  const lastSyncedTimeRef = useRef<number>(-1);
  const currentTimeRef = useRef<number>(0);
  const hasRecordedInitialWatchRef = useRef<boolean>(false);

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return "0:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Sync progress to backend watch history (throttled or forced on lifecycle events)
  const syncWatchProgress = useCallback(
    async (time: number, force = false) => {
      if (!user || !videoId) {
        return;
      }
      const rounded = Math.max(0, Math.floor(time));
      if (!force && lastSyncedTimeRef.current >= 0 && Math.abs(rounded - lastSyncedTimeRef.current) < 5) {
        return;
      }
      lastSyncedTimeRef.current = rounded;
      try {
        await api.history.recordProgress(videoId, rounded);
      } catch {
        // Non-critical background sync
      }
    },
    [user, videoId],
  );

  // Initialize HLS player
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !manifestUrl || isProcessing) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setHasError(false);
    setErrorMessage(null);

    // Clean up previous HLS instance if any
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
      });
      hlsRef.current = hls;

      hls.loadSource(manifestUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        setIsLoading(false);
        const parsedLevels: QualityLevel[] = data.levels.map((lvl, index) => ({
          index,
          height: lvl.height,
          bitrate: lvl.bitrate,
          label: lvl.height ? `${lvl.height}p` : `${Math.round(lvl.bitrate / 1000)}k`,
        }));
        // Sort highest resolution first
        setLevels(parsedLevels.sort((a, b) => b.height - a.height));

        // Restore initial progress if specified
        if (initialProgressSeconds > 0) {
          video.currentTime = initialProgressSeconds;
        }
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        setCurrentLevel(hls.autoLevelEnabled ? -1 : data.level);
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              setHasError(true);
              setErrorMessage("Failed to load video stream.");
              break;
          }
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Native HLS for Safari / iOS
      video.src = manifestUrl;
      video.addEventListener("loadedmetadata", () => {
        setIsLoading(false);
        if (initialProgressSeconds > 0) {
          video.currentTime = initialProgressSeconds;
        }
      });
      video.addEventListener("error", () => {
        setHasError(true);
        setErrorMessage("Playback error on native HLS.");
      });
    } else {
      setHasError(true);
      setErrorMessage("Your browser does not support HLS video playback.");
      setIsLoading(false);
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [manifestUrl, isProcessing, initialProgressSeconds]);

  // Video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const current = video.currentTime;
      setCurrentTime(current);
      currentTimeRef.current = current;

      if (video.buffered.length > 0) {
        setBufferedTime(video.buffered.end(video.buffered.length - 1));
      }

      // Record first playback moment within the first 2 seconds of playback
      if (!hasRecordedInitialWatchRef.current && current >= 1) {
        hasRecordedInitialWatchRef.current = true;
        syncWatchProgress(current, true);
        return;
      }

      // Sync progress every ~8s
      if (Math.abs(current - lastSyncedTimeRef.current) >= 8) {
        syncWatchProgress(current);
      }
    };

    const handleDurationChange = () => {
      setDuration(video.duration || 0);
    };

    const handlePlay = () => {
      setIsPlaying(true);
      // Immediately track watch when user plays
      if (!hasRecordedInitialWatchRef.current) {
        hasRecordedInitialWatchRef.current = true;
        syncWatchProgress(video.currentTime, true);
      }
    };

    const handlePause = () => {
      setIsPlaying(false);
      // Flush progress on pause
      syncWatchProgress(video.currentTime, true);
    };

    const handleWaiting = () => setIsLoading(true);
    const handlePlaying = () => setIsLoading(false);

    // Flush progress when tab is hidden or user navigates
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && video.currentTime > 0) {
        syncWatchProgress(video.currentTime, true);
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("durationchange", handleDurationChange);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      // Flush progress on unmount / video change
      if (video.currentTime > 0) {
        syncWatchProgress(video.currentTime, true);
      }
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("durationchange", handleDurationChange);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [syncWatchProgress]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.muted || isMuted) {
      video.muted = false;
      video.volume = volume || 1;
      setIsMuted(false);
    } else {
      video.muted = true;
      setIsMuted(true);
    }
  }, [isMuted, volume]);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  // Keyboard shortcuts (Space, Left, Right, M, F)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only when video is in view or active element is not an input
      if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName || "")) {
        return;
      }

      const video = videoRef.current;
      if (!video) return;

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        video.currentTime = Math.max(0, video.currentTime - 5);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
      } else if (e.code === "KeyM") {
        e.preventDefault();
        toggleMute();
      } else if (e.code === "KeyF") {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay, toggleMute, toggleFullscreen]);

  // Controls auto-hide on inactivity
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeout) clearTimeout(controlsTimeout);
    const t = setTimeout(() => {
      if (isPlaying && !showSettingsMenu) {
        setShowControls(false);
      }
    }, 2800);
    setControlsTimeout(t);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const targetTime = Number(e.target.value);
    video.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const val = Number(e.target.value);
    video.volume = val;
    setVolume(val);
    setIsMuted(val === 0);
  };

  const handleQualitySelect = (levelIndex: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
      setCurrentLevel(levelIndex);
      setShowSettingsMenu(false);
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      className={cn(
        "relative aspect-video w-full rounded-2xl bg-black overflow-hidden shadow-2xl border border-border/40 select-none group",
        className,
      )}
    >
      {/* HTML5 Video Element */}
      <video
        ref={videoRef}
        aria-label={title}
        poster={thumbnailUrl || undefined}
        playsInline
        onClick={togglePlay}
        className="w-full h-full object-contain cursor-pointer"
      />

      {/* PROCESSING STATE BANNER */}
      {isProcessing && (
        <div className="absolute inset-0 bg-black/85 backdrop-blur-xs flex flex-col items-center justify-center text-center p-6 space-y-3 z-30">
          <div className="w-14 h-14 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center animate-pulse">
            <Loader2 className="w-7 h-7 animate-spin" />
          </div>
          <p className="text-base font-bold text-white">
            Video Transcoding In Progress
          </p>
          <p className="text-xs text-white/70 max-w-sm">
            This video was recently uploaded and is currently being packaged into adaptive HLS qualities. It will play automatically once processing completes.
          </p>
        </div>
      )}

      {/* NO MANIFEST / INACCESSIBLE STATE */}
      {!isProcessing && !manifestUrl && !hasError && (
        <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center text-center p-6 space-y-3 z-30">
          <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center">
            <Play className="w-7 h-7 text-white" />
          </div>
          <p className="text-sm font-semibold text-white">Stream Unavailable</p>
          <p className="text-xs text-white/60 max-w-sm">
            No HLS streaming manifest found for this media asset.
          </p>
        </div>
      )}

      {/* ERROR STATE */}
      {hasError && (
        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center text-center p-6 space-y-3 z-30">
          <div className="w-14 h-14 rounded-full bg-destructive/20 text-destructive flex items-center justify-center">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <p className="text-base font-bold text-white">Playback Error</p>
          <p className="text-xs text-white/70 max-w-sm">
            {errorMessage || "Unable to play video manifest."}
          </p>
          <button
            onClick={() => {
              if (hlsRef.current && manifestUrl) {
                hlsRef.current.loadSource(manifestUrl);
                hlsRef.current.startLoad();
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold cursor-pointer transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Retry Stream
          </button>
        </div>
      )}

      {/* LOADING SPINNER */}
      {isLoading && !isProcessing && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-xs flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-white animate-spin" />
          </div>
        </div>
      )}

      {/* BIG CENTER PLAY BUTTON WHEN PAUSED */}
      {!isPlaying && !isLoading && !isProcessing && !hasError && manifestUrl && (
        <div
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center cursor-pointer z-10 bg-black/20"
        >
          <div className="w-16 h-16 rounded-full bg-[var(--brand)] text-white flex items-center justify-center shadow-2xl hover:scale-110 transition-transform">
            <Play className="w-8 h-8 fill-current ml-1" />
          </div>
        </div>
      )}

      {/* OVERLAY CONTROLS */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-3 pt-8 transition-opacity duration-200",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      >
        {/* Scrubber Progress Bar */}
        <div className="relative w-full group/scrubber cursor-pointer mb-2">
          {/* Background Bar */}
          <div className="relative w-full h-1.5 bg-white/20 rounded-full overflow-hidden group-hover/scrubber:h-2 transition-all">
            {/* Buffer progress */}
            <div
              className="absolute left-0 top-0 bottom-0 bg-white/30 rounded-full"
              style={{
                width: `${duration > 0 ? (bufferedTime / duration) * 100 : 0}%`,
              }}
            />
            {/* Played progress */}
            <div
              className="absolute left-0 top-0 bottom-0 bg-[var(--brand)] rounded-full"
              style={{
                width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
              }}
            />
          </div>

          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>

        {/* Bottom Controls Row */}
        <div className="flex items-center justify-between text-white text-xs">
          {/* Left: Play/Pause, Volume, Time */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              className="p-1.5 rounded-lg hover:bg-white/20 transition-colors cursor-pointer"
              title={isPlaying ? "Pause (Space)" : "Play (Space)"}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current" />
              )}
            </button>

            {/* Volume */}
            <div className="flex items-center gap-1.5 group/volume">
              <button
                type="button"
                onClick={toggleMute}
                className="p-1.5 rounded-lg hover:bg-white/20 transition-colors cursor-pointer"
                title={isMuted ? "Unmute (M)" : "Mute (M)"}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 accent-[var(--brand)] opacity-0 group-hover/volume:opacity-100 transition-opacity cursor-pointer"
              />
            </div>

            {/* Time Stamp */}
            <span className="font-mono text-[11px] text-white/80">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          {/* Right: Quality, Fullscreen */}
          <div className="flex items-center gap-2">
            {/* Quality Picker */}
            {levels.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowSettingsMenu((prev) => !prev)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-white/20 transition-colors cursor-pointer text-[11px] font-semibold"
                  title="Quality Settings"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>
                    {currentLevel === -1
                      ? "Auto"
                      : levels.find((l) => l.index === currentLevel)?.label || "Auto"}
                  </span>
                </button>

                {showSettingsMenu && (
                  <div className="absolute right-0 bottom-8 w-32 bg-card/95 backdrop-blur-md border border-border rounded-xl shadow-xl p-1 text-xs text-foreground z-40">
                    <button
                      type="button"
                      onClick={() => handleQualitySelect(-1)}
                      className={cn(
                        "w-full text-left px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer text-[11px]",
                        currentLevel === -1
                          ? "bg-[var(--brand)]/10 text-[var(--brand)] font-bold"
                          : "hover:bg-muted text-foreground",
                      )}
                    >
                      Auto
                    </button>
                    {levels.map((lvl) => (
                      <button
                        key={lvl.index}
                        type="button"
                        onClick={() => handleQualitySelect(lvl.index)}
                        className={cn(
                          "w-full text-left px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer text-[11px]",
                          currentLevel === lvl.index
                            ? "bg-[var(--brand)]/10 text-[var(--brand)] font-bold"
                            : "hover:bg-muted text-foreground",
                        )}
                      >
                        {lvl.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Download Option from Player */}
            {onDownloadQuality && availableResolutions && availableResolutions.length > 0 && !isProcessing && (
              <button
                type="button"
                onClick={() => onDownloadQuality(availableResolutions[0]!)}
                className="p-1.5 rounded-lg hover:bg-white/20 transition-colors cursor-pointer text-white/90 hover:text-white"
                title={`Download MP4 (${availableResolutions[0]})`}
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Fullscreen */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-1.5 rounded-lg hover:bg-white/20 transition-colors cursor-pointer"
              title={isFullscreen ? "Exit Fullscreen (F)" : "Fullscreen (F)"}
            >
              {isFullscreen ? (
                <Minimize className="w-4 h-4" />
              ) : (
                <Maximize className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
