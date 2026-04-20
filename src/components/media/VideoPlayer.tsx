// Mobile-first. Test at 375px before merging.
//
// Lazy-loading HTML5 video player with poster image, custom minimal
// controls (play/pause, scrubber, time, fullscreen), and haptic feedback
// on first play. Source URL is fetched only when the user taps play —
// no bandwidth wasted on private signed URLs that may never be viewed.
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Maximize2, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { getSignedUrl } from "@/lib/storage";

interface Props {
  bucket: string;
  path: string;
  poster?: string | null;
  title?: string | null;
  className?: string;
  /** Aspect — defaults to 16/9. Pass 9/16 for portrait shorts. */
  aspect?: number;
}

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function VideoPlayer({ bucket, path, poster, title, className, aspect = 16 / 9 }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const hideTimer = useRef<number | null>(null);

  const ensureSrc = useCallback(async () => {
    if (src) return src;
    setLoading(true);
    const url = await getSignedUrl(bucket, path, 3600);
    setLoading(false);
    if (url) setSrc(url);
    return url;
  }, [bucket, path, src]);

  async function handleTogglePlay() {
    haptic.tap();
    const v = videoRef.current;
    if (!v) {
      // First tap: lazy-load source then play once metadata is loaded.
      const url = await ensureSrc();
      if (!url) return;
      // wait one tick so the <video> renders with the new src
      requestAnimationFrame(() => {
        videoRef.current?.play().catch(() => {});
      });
      return;
    }
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }

  function scheduleHide() {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setShowControls(false), 2200);
  }

  useEffect(() => () => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
  }, []);

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const v = videoRef.current;
    if (!v) return;
    const t = Number(e.target.value);
    v.currentTime = t;
    setTime(t);
  }

  async function handleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    } else {
      await el.requestFullscreen?.().catch(() => {});
    }
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full overflow-hidden rounded-lg bg-black select-none",
        className,
      )}
      style={{ aspectRatio: String(aspect) }}
      onMouseMove={() => {
        setShowControls(true);
        scheduleHide();
      }}
      onClick={() => {
        setShowControls(true);
        scheduleHide();
      }}
    >
      {/* Poster — shown until video plays. Acts as the giant tap target. */}
      {!src && (
        <button
          type="button"
          aria-label="Play video"
          onClick={handleTogglePlay}
          className="absolute inset-0 flex items-center justify-center group pressable"
        >
          {poster ? (
            <img
              src={poster}
              alt={title ?? "Video poster"}
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-muted to-dark" />
          )}
          <span className="relative z-10 flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-2xl group-hover:scale-105 transition-transform">
            {loading ? <Loader2 className="h-7 w-7 animate-spin" /> : <Play className="h-7 w-7 ml-0.5" />}
          </span>
        </button>
      )}

      {src && (
        <video
          ref={videoRef}
          src={src}
          poster={poster ?? undefined}
          playsInline
          preload="metadata"
          className="absolute inset-0 w-full h-full object-contain bg-black"
          onPlay={() => {
            setPlaying(true);
            scheduleHide();
          }}
          onPause={() => {
            setPlaying(false);
            setShowControls(true);
          }}
          onTimeUpdate={(e) => setTime((e.target as HTMLVideoElement).currentTime)}
          onLoadedMetadata={(e) => setDuration((e.target as HTMLVideoElement).duration)}
          onClick={handleTogglePlay}
        />
      )}

      {/* Custom controls — overlay when src is ready */}
      {src && (
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 flex items-center gap-2 px-3 py-2 bg-gradient-to-t from-black/80 to-transparent transition-opacity",
            showControls ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
        >
          <button
            type="button"
            aria-label={playing ? "Pause" : "Play"}
            onClick={handleTogglePlay}
            className="text-white hover:text-accent pressable h-9 w-9 flex items-center justify-center"
          >
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>
          <span className="text-[11px] text-white/80 tabular-nums w-10 shrink-0">{fmtTime(time)}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.05}
            value={time}
            onChange={handleSeek}
            className="flex-1 accent-accent h-1"
            aria-label="Seek"
          />
          <span className="text-[11px] text-white/80 tabular-nums w-10 shrink-0 text-right">
            {fmtTime(duration)}
          </span>
          <button
            type="button"
            aria-label="Fullscreen"
            onClick={handleFullscreen}
            className="text-white hover:text-accent pressable h-9 w-9 flex items-center justify-center"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
