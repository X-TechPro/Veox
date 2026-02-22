"use client";

import {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type TouchEvent as ReactTouchEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import Hls from "hls.js";
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  Volume1,
  VolumeX,
  Maximize,
  Minimize,
  Captions,
  Settings,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";

/* ─── Types ─── */
export interface SubtitleTrack {
  url: string;
  language: string;
  display: string;
}

export interface QualityItem {
  quality: string;
  link: string;
}

export interface VeoxPlayerProps {
  src: string;
  title?: string;
  subtitles?: SubtitleTrack[];
  qualities?: Record<string, QualityItem[] | SubtitleTrack[]>;
  autoPlay?: boolean;
}

/* ─── Color filter presets ─── */
const COLOR_PRESETS = [
  { name: "Cinema", hue: 0, saturation: 110, highlights: 95, shadows: 110 },
  { name: "Warm", hue: 15, saturation: 120, highlights: 105, shadows: 100 },
  { name: "Cool", hue: -10, saturation: 90, highlights: 110, shadows: 95 },
];

/* ─── Format time helper ─── */
function formatTime(s: number) {
  if (!isFinite(s) || s < 0) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/* ─── Main Player ─── */
export default function VeoxPlayer({
  src,
  title,
  subtitles = [],
  qualities = {},
  autoPlay = true,
}: VeoxPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const previewHlsRef = useRef<Hls | null>(null);
  const seekBarRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  /* State */
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [seeking, setSeeking] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [showSubPanel, setShowSubPanel] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [settingsTab, setSettingsTab] = useState<
    "main" | "server" | "colors"
  >("main");
  const [activeSubtitle, setActiveSubtitle] = useState<string | null>(null);
  const [subtitleText, setSubtitleText] = useState("");
  const [currentSrc, setCurrentSrc] = useState(src);
  const [seekGhostPercent, setSeekGhostPercent] = useState<number | null>(null);

  /* Buffering / loading spinner */
  const [isBuffering, setIsBuffering] = useState(true);

  /* Save time across server switches */
  const savedTimeRef = useRef<number>(0);
  const isSwitchingRef = useRef(false);

  /* Color adjustments */
  const [colorHue, setColorHue] = useState(0);
  const [colorSaturation, setColorSaturation] = useState(100);
  const [colorHighlights, setColorHighlights] = useState(100);
  const [colorShadows, setColorShadows] = useState(100);

  /* Touch state */
  const touchStartRef = useRef<{
    x: number;
    y: number;
    time: number;
    vol: number;
    locked: "none" | "horizontal" | "vertical";
  } | null>(null);
  const [touchFeedback, setTouchFeedback] = useState<string | null>(null);
  const lastTouchRef = useRef(0);
  const touchSwipedRef = useRef(false);

  /* Seeking feedback for double tap */
  const [seekFeedback, setSeekFeedback] = useState<{
    side: "left" | "right";
    text: string;
  } | null>(null);

  /* ─── HLS / source loading ─── */
  const loadSource = useCallback((url: string) => {
    const video = videoRef.current;
    if (!video) return;
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    const isHls = url.includes(".m3u8") || url.includes("m3u8");
    if (isHls) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
        });
        hls.loadSource(url);
        hls.attachMedia(video);
        hlsRef.current = hls;
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = url;
      }
    } else {
      video.src = url;
    }
  }, []);

  /* Load preview video for seekbar thumbnails */
  const loadPreviewSource = useCallback((url: string) => {
    const video = previewVideoRef.current;
    if (!video) return;
    if (previewHlsRef.current) {
      previewHlsRef.current.destroy();
      previewHlsRef.current = null;
    }
    video.muted = true;
    video.preload = "auto";
    const isHls = url.includes(".m3u8") || url.includes("m3u8");
    if (isHls) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          maxBufferLength: 5,
          maxMaxBufferLength: 10,
          enableWorker: false,
        });
        hls.loadSource(url);
        hls.attachMedia(video);
        previewHlsRef.current = hls;
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = url;
      }
    } else {
      video.src = url;
    }
  }, []);

  useEffect(() => {
    setCurrentSrc(src);
  }, [src]);

  useEffect(() => {
    setIsBuffering(true);
    loadSource(currentSrc);
    loadPreviewSource(currentSrc);
    return () => {
      if (hlsRef.current) hlsRef.current.destroy();
      if (previewHlsRef.current) previewHlsRef.current.destroy();
    };
  }, [currentSrc, loadSource, loadPreviewSource]);

  /* ─── Autoplay + restore time on server switch ─── */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onCanPlay = () => {
      // Restore time after server switch
      if (isSwitchingRef.current && savedTimeRef.current > 0) {
        video.currentTime = savedTimeRef.current;
        isSwitchingRef.current = false;
        savedTimeRef.current = 0;
      }
      if (autoPlay) {
        video.play().catch(() => {
          video.muted = true;
          setMuted(true);
          video.play().catch(() => { });
        });
      }
    };

    video.addEventListener("canplay", onCanPlay);
    return () => video.removeEventListener("canplay", onCanPlay);
  }, [autoPlay, currentSrc]);

  /* ─── Video event listeners ─── */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      const buf = video.buffered;
      if (buf.length > 0) setBuffered(buf.end(buf.length - 1));
    };
    const onLoaded = () => setDuration(video.duration);
    const onPlay = () => {
      setPlaying(true);
      setIsBuffering(false);
    };
    const onPause = () => setPlaying(false);
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => setIsBuffering(false);
    const onSeeked = () => setIsBuffering(false);

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("durationchange", onLoaded);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("seeked", onSeeked);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("durationchange", onLoaded);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("seeked", onSeeked);
    };
  }, []);

  /* ─── Subtitle polling ─── */
  useEffect(() => {
    if (!activeSubtitle) {
      setSubtitleText("");
      return;
    }
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsedCues: any[] = [];

    (async () => {
      try {
        const res = await fetch(activeSubtitle);
        const text = await res.text();
        parsedCues = parseVTT(text);
      } catch {
        // ignore
      }
    })();

    const interval = setInterval(() => {
      if (cancelled || !videoRef.current) return;
      const t = videoRef.current.currentTime;
      const cue = parsedCues.find((c) => t >= c.start && t <= c.end);
      setSubtitleText(cue ? cue.text : "");
    }, 250);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeSubtitle]);

  /* ─── Controls auto-hide ─── */
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setShowControls(false);
    }, 3500);
  }, []);

  useEffect(() => {
    if (!playing) {
      setShowControls(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    } else {
      resetHideTimer();
    }
  }, [playing, resetHideTimer]);

  /* ─── Keyboard controls ─── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;
      if ((e.target as HTMLElement).tagName === "INPUT") return;

      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          playing ? video.pause() : video.play().catch(() => { });
          resetHideTimer();
          break;
        case "ArrowRight":
          e.preventDefault();
          video.currentTime = Math.min(video.duration, video.currentTime + 10);
          resetHideTimer();
          break;
        case "ArrowLeft":
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 10);
          resetHideTimer();
          break;
        case "ArrowUp":
          e.preventDefault();
          setVolume((v) => {
            const next = Math.min(1, v + 0.1);
            if (video) video.volume = next;
            return next;
          });
          resetHideTimer();
          break;
        case "ArrowDown":
          e.preventDefault();
          setVolume((v) => {
            const next = Math.max(0, v - 0.1);
            if (video) video.volume = next;
            return next;
          });
          resetHideTimer();
          break;
        case "m":
          e.preventDefault();
          setMuted((m) => {
            if (video) video.muted = !m;
            return !m;
          });
          resetHideTimer();
          break;
        case "f":
          e.preventDefault();
          toggleFullscreen();
          break;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [playing, resetHideTimer]);

  /* ─── Fullscreen ─── */
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => { });
    } else {
      document.exitFullscreen().catch(() => { });
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  /* ─── Play/Pause ─── */
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => { });
    else video.pause();
    resetHideTimer();
  }, [resetHideTimer]);

  /* ─── Server switch (preserve time) ─── */
  const switchServer = useCallback((newSrc: string) => {
    const video = videoRef.current;
    if (video) {
      savedTimeRef.current = video.currentTime;
    }
    isSwitchingRef.current = true;
    setIsBuffering(true);
    setCurrentSrc(newSrc);
  }, []);

  /* ─── Seekbar interaction ─── */
  const handleSeekBarMouse = (e: ReactMouseEvent<HTMLDivElement>) => {
    const bar = seekBarRef.current;
    if (!bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const pct = x / rect.width;
    setHoverTime(pct * duration);
    setHoverX(x);
    setSeekGhostPercent(pct * 100);
  };

  const handleSeekBarClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    const bar = seekBarRef.current;
    const video = videoRef.current;
    if (!bar || !video || !duration) return;
    const rect = bar.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    video.currentTime = (x / rect.width) * duration;
    resetHideTimer();
  };

  const handleSeekBarLeave = () => {
    setHoverTime(null);
    setSeekGhostPercent(null);
  };

  /* ─── Preview thumbnail rendering ─── */
  const previewSeekTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  useEffect(() => {
    const pVideo = previewVideoRef.current;
    const canvas = previewCanvasRef.current;
    if (!pVideo || !canvas || hoverTime === null) return;

    if (previewSeekTimeoutRef.current)
      clearTimeout(previewSeekTimeoutRef.current);
    previewSeekTimeoutRef.current = setTimeout(() => {
      pVideo.currentTime = hoverTime;
    }, 80);

    const onSeeked = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(pVideo, 0, 0, canvas.width, canvas.height);
    };
    pVideo.addEventListener("seeked", onSeeked, { once: true });
    return () => pVideo.removeEventListener("seeked", onSeeked);
  }, [hoverTime]);

  /* ─── Touch gestures with direction locking and reduced sensitivity ─── */
  const LOCK_THRESHOLD = 25;
  const handleTouchStart = (e: ReactTouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: videoRef.current?.currentTime || 0,
      vol: volume,
      locked: "none",
    };
    resetHideTimer();
  };

  const handleTouchMove = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current || !videoRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const container = containerRef.current;
    if (!container) return;

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Lock direction after threshold
    if (touchStartRef.current.locked === "none") {
      if (absDx > LOCK_THRESHOLD && absDx > absDy * 1.5) {
        touchStartRef.current.locked = "horizontal";
        touchSwipedRef.current = true;
      } else if (absDy > LOCK_THRESHOLD && absDy > absDx * 1.5) {
        touchStartRef.current.locked = "vertical";
        touchSwipedRef.current = true;
      } else {
        return; // Not enough movement to lock
      }
    }

    // Horizontal = seek (much lower sensitivity: 0.08 instead of 0.3)
    if (touchStartRef.current.locked === "horizontal") {
      const seekDelta = (dx / container.clientWidth) * duration * 0.08;
      const newTime = Math.max(
        0,
        Math.min(duration, touchStartRef.current.time + seekDelta)
      );
      videoRef.current.currentTime = newTime;
      setTouchFeedback(
        `${seekDelta > 0 ? "+" : ""}${Math.round(seekDelta)}s`
      );
      setSeeking(true);
    }

    // Vertical = volume (lower sensitivity: 0.8 instead of 1.5)
    if (touchStartRef.current.locked === "vertical") {
      const volDelta = -(dy / container.clientHeight) * 0.8;
      const newVol = Math.max(
        0,
        Math.min(1, touchStartRef.current.vol + volDelta)
      );
      videoRef.current.volume = newVol;
      setVolume(newVol);
      setMuted(newVol === 0);
      setTouchFeedback(`Vol ${Math.round(newVol * 100)}%`);
    }
  };

  const handleTouchEnd = () => {
    touchStartRef.current = null;
    setSeeking(false);
    setTimeout(() => {
      setTouchFeedback(null);
      touchSwipedRef.current = false;
    }, 600);
  };

  /* ─── Click on video: single=play/pause (mouse), double=seek ─── */
  const clickTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const clickCountRef = useRef(0);

  const handleVideoClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // Ignore clicks on actual control buttons / panels / interactive elements
    if (
      target.closest("button") ||
      target.closest("[data-panel]") ||
      target.closest("[data-interactive]")
    )
      return;

    // Ignore if this was from a touch (touch events also fire mouse events)
    const now = Date.now();
    if (now - lastTouchRef.current < 500) return;

    const container = containerRef.current;
    if (!container || !videoRef.current) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const isLeft = x < rect.width / 3;
    const isRight = x > (rect.width * 2) / 3;

    clickCountRef.current++;

    if (clickCountRef.current === 1) {
      clickTimerRef.current = setTimeout(() => {
        // Single click => play/pause
        if (clickCountRef.current === 1) {
          togglePlay();
        }
        clickCountRef.current = 0;
      }, 250);
    } else if (clickCountRef.current === 2) {
      // Double click
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      clickCountRef.current = 0;
      if (isLeft) {
        videoRef.current.currentTime = Math.max(
          0,
          videoRef.current.currentTime - 10
        );
        setSeekFeedback({ side: "left", text: "-10s" });
      } else if (isRight) {
        videoRef.current.currentTime = Math.min(
          duration,
          videoRef.current.currentTime + 10
        );
        setSeekFeedback({ side: "right", text: "+10s" });
      } else {
        toggleFullscreen();
      }
      setTimeout(() => setSeekFeedback(null), 700);
    }
  };

  /* ─── Mobile tap to play/pause ─── */
  const handleVideoTouchEnd2 = (e: ReactTouchEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (
      target.closest("button") ||
      target.closest("[data-panel]") ||
      target.closest("[data-interactive]")
    )
      return;

    lastTouchRef.current = Date.now();
  };

  const tapTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const tapCountRef = useRef(0);

  const handleVideoTouchStart = (e: ReactTouchEvent<HTMLDivElement>) => {
    touchSwipedRef.current = false;
    handleTouchStart(e);

    const target = e.target as HTMLElement;
    if (
      target.closest("button") ||
      target.closest("[data-panel]") ||
      target.closest("[data-interactive]")
    )
      return;

    const container = containerRef.current;
    if (!container || !videoRef.current) return;

    const touch = e.touches[0];
    const rect = container.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const isLeft = x < rect.width / 3;
    const isRight = x > (rect.width * 2) / 3;

    tapCountRef.current++;

    if (tapCountRef.current === 1) {
      tapTimerRef.current = setTimeout(() => {
        if (tapCountRef.current === 1) {
          // Single tap on mobile => play/pause only if no swipe happened
          if (!touchSwipedRef.current) {
            togglePlay();
          }
        }
        tapCountRef.current = 0;
      }, 280);
    } else if (tapCountRef.current === 2) {
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      tapCountRef.current = 0;
      if (isLeft) {
        videoRef.current.currentTime = Math.max(
          0,
          videoRef.current.currentTime - 10
        );
        setSeekFeedback({ side: "left", text: "-10s" });
      } else if (isRight) {
        videoRef.current.currentTime = Math.min(
          duration,
          videoRef.current.currentTime + 10
        );
        setSeekFeedback({ side: "right", text: "+10s" });
      } else {
        toggleFullscreen();
      }
      setTimeout(() => setSeekFeedback(null), 700);
    }
  };

  /* ─── Volume icon ─── */
  const VolumeIcon =
    muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  /* ─── Color filter style ─── */
  const videoFilter = `hue-rotate(${colorHue}deg) saturate(${colorSaturation}%) brightness(${colorHighlights}%) contrast(${colorShadows}%)`;

  /* ─── Get servers for the quality panel ─── */
  const serverEntries = Object.entries(qualities).filter(
    ([key]) => key !== "subtitles"
  ) as [string, QualityItem[]][];

  /* ─── All subtitle tracks combined + grouped by display name ─── */
  const allSubtitles: SubtitleTrack[] = [
    ...subtitles,
    ...((qualities.subtitles || []) as SubtitleTrack[]),
  ];

  const groupedSubtitles = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const sub of allSubtitles) {
      const key = sub.display || sub.language;
      counts[key] = (counts[key] || 0) + 1;
    }
    // Track index per group
    const indices: Record<string, number> = {};
    return allSubtitles.map((sub) => {
      const key = sub.display || sub.language;
      if (!indices[key]) indices[key] = 0;
      indices[key]++;
      const hasDuplicates = counts[key] > 1;
      const label = hasDuplicates
        ? `${key} ${indices[key]}`
        : key;
      return { ...sub, label };
    });
  }, [allSubtitles]);

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration ? (buffered / duration) * 100 : 0;
  const effectiveVolume = muted ? 0 : volume;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black overflow-hidden select-none group"
      style={{ cursor: showControls ? "default" : "none" }}
      onMouseMove={resetHideTimer}
      onClick={handleVideoClick}
      onTouchStart={handleVideoTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={(e) => {
        handleTouchEnd();
        handleVideoTouchEnd2(e);
      }}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-contain"
        style={{ filter: videoFilter }}
        playsInline
        crossOrigin="anonymous"
      />

      {/* Hidden preview video for seekbar thumbnails - needs real dimensions */}
      <video
        ref={previewVideoRef}
        className="pointer-events-none"
        style={{
          position: "fixed",
          width: 320,
          height: 180,
          opacity: 0.001,
          zIndex: -1,
          pointerEvents: "none",
        }}
        playsInline
        muted
        crossOrigin="anonymous"
      />

      {/* Preview canvas (offscreen but not display:none so drawImage works) */}
      <canvas
        ref={previewCanvasRef}
        style={{
          position: "fixed",
          width: 320,
          height: 180,
          opacity: 0.001,
          zIndex: -1,
          pointerEvents: "none",
        }}
        width={320}
        height={180}
      />

      {/* Loading / Buffering spinner */}
      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
          <Loader2
            size={48}
            strokeWidth={2}
            className="text-foreground/80 animate-spin"
          />
        </div>
      )}

      {/* Touch feedback */}
      {touchFeedback && (
        <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none">
          <div className="bg-black/70 backdrop-blur-md text-foreground text-lg font-sans font-semibold px-6 py-3 rounded-2xl">
            {touchFeedback}
          </div>
        </div>
      )}

      {/* Double tap seek feedback */}
      {seekFeedback && (
        <div
          className={`absolute top-1/2 -translate-y-1/2 z-40 pointer-events-none ${seekFeedback.side === "left" ? "left-12" : "right-12"}`}
        >
          <div className="bg-black/60 backdrop-blur-md text-foreground text-base font-sans font-semibold px-5 py-2.5 rounded-2xl">
            {seekFeedback.text}
          </div>
        </div>
      )}

      {/* Subtitles */}
      {subtitleText && (
        <div className="absolute bottom-24 left-0 right-0 flex justify-center z-30 pointer-events-none px-4">
          <div className="bg-black/60 backdrop-blur-sm text-foreground text-base md:text-lg font-sans font-medium px-5 py-2 rounded-xl max-w-[80%] text-center leading-relaxed">
            {subtitleText}
          </div>
        </div>
      )}

      {/* Controls overlay */}
      <div
        data-controls
        className="absolute inset-0 z-20 flex flex-col justify-end transition-opacity duration-300"
        style={{
          opacity: showControls || seeking ? 1 : 0,
          pointerEvents: showControls || seeking ? "auto" : "none",
        }}
      >
        {/* Top gradient + title */}
        <div className="absolute top-0 left-0 right-0 h-28 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />
        {title && (
          <div className="absolute top-0 left-0 right-0 flex items-center px-5 pt-4 md:px-8 md:pt-6">
            <span className="text-foreground text-sm md:text-base font-sans font-semibold tracking-wide truncate">
              {title}
            </span>
          </div>
        )}

        {/* Bottom gradient */}
        <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />

        {/* Bottom controls area */}
        <div className="relative px-4 pb-4 md:px-6 md:pb-5 flex flex-col gap-2.5">
          {/* Seekbar */}
          <div
            data-interactive
            ref={seekBarRef}
            className="relative h-6 flex items-center cursor-pointer group/seek"
            onMouseMove={handleSeekBarMouse}
            onMouseLeave={handleSeekBarLeave}
            onClick={(e) => {
              e.stopPropagation();
              handleSeekBarClick(e);
            }}
          >
            {/* Track background */}
            <div className="absolute left-0 right-0 h-1 group-hover/seek:h-1.5 rounded-full bg-[#ffffff1a] transition-all" />
            {/* Buffered */}
            <div
              className="absolute left-0 h-1 group-hover/seek:h-1.5 rounded-full bg-[#ffffff30] transition-all"
              style={{ width: `${bufferedPercent}%` }}
            />
            {/* Ghost trail (hover) */}
            {seekGhostPercent !== null && (
              <div
                className="absolute left-0 h-1 group-hover/seek:h-1.5 rounded-full transition-all"
                style={{
                  width: `${seekGhostPercent}%`,
                  backgroundColor: "rgba(56,189,248,0.25)",
                }}
              />
            )}
            {/* Progress */}
            <div
              className="absolute left-0 h-1 group-hover/seek:h-1.5 rounded-full bg-primary transition-all"
              style={{ width: `${progressPercent}%` }}
            />
            {/* Thumb */}
            <div
              className="absolute w-3.5 h-3.5 rounded-full bg-primary shadow-lg shadow-primary/30 -translate-x-1/2 opacity-0 group-hover/seek:opacity-100 transition-opacity"
              style={{ left: `${progressPercent}%` }}
            />

            {/* Preview tooltip with thumbnail */}
            {hoverTime !== null && (
              <div
                className="absolute bottom-8 -translate-x-1/2 flex flex-col items-center pointer-events-none"
                style={{ left: `${hoverX}px` }}
              >
                {/* Thumbnail frame */}
                <div className="w-[160px] h-[90px] rounded-lg overflow-hidden border border-[#ffffff20] bg-black/90 shadow-xl mb-1.5">
                  <PreviewFrame
                    canvasRef={previewCanvasRef}
                  />
                </div>
                <div className="bg-black/80 backdrop-blur-md text-foreground text-xs font-mono font-medium px-2.5 py-1 rounded-lg">
                  {formatTime(hoverTime)}
                </div>
              </div>
            )}
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-1 md:gap-2">
            {/* Play/Pause */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              className="w-10 h-10 flex items-center justify-center rounded-full text-foreground hover:bg-[#ffffff20] transition-colors"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <Pause size={24} strokeWidth={2.5} />
              ) : (
                <Play size={24} strokeWidth={2.5} className="ml-0.5" />
              )}
            </button>

            {/* Rewind 10s */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (videoRef.current)
                  videoRef.current.currentTime = Math.max(
                    0,
                    videoRef.current.currentTime - 10
                  );
                resetHideTimer();
              }}
              className="w-9 h-9 flex items-center justify-center rounded-full text-foreground hover:bg-[#ffffff20] transition-colors"
              aria-label="Rewind 10 seconds"
            >
              <RotateCcw size={20} strokeWidth={2.5} />
            </button>

            {/* Forward 10s */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (videoRef.current)
                  videoRef.current.currentTime = Math.min(
                    duration,
                    videoRef.current.currentTime + 10
                  );
                resetHideTimer();
              }}
              className="w-9 h-9 flex items-center justify-center rounded-full text-foreground hover:bg-[#ffffff20] transition-colors"
              aria-label="Forward 10 seconds"
            >
              <RotateCw size={20} strokeWidth={2.5} />
            </button>

            {/* Volume */}
            <div
              className="relative flex items-center"
              onMouseEnter={() => setShowVolumeSlider(true)}
              onMouseLeave={() => setShowVolumeSlider(false)}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMuted((m) => {
                    if (videoRef.current) videoRef.current.muted = !m;
                    return !m;
                  });
                }}
                className="w-9 h-9 flex items-center justify-center rounded-full text-foreground hover:bg-[#ffffff20] transition-colors"
                aria-label={muted ? "Unmute" : "Mute"}
              >
                <VolumeIcon size={20} strokeWidth={2.5} />
              </button>
              {/* Volume slider - styled like seekbar */}
              <div
                data-interactive
                className="overflow-hidden transition-all duration-300 flex items-center"
                style={{
                  width: showVolumeSlider ? 80 : 0,
                  opacity: showVolumeSlider ? 1 : 0,
                }}
              >
                <div
                  className="relative w-full h-6 flex items-center cursor-pointer group/vol"
                  onClick={(e) => {
                    e.stopPropagation();
                    const bar = e.currentTarget;
                    const rect = bar.getBoundingClientRect();
                    const x = Math.max(
                      0,
                      Math.min(e.clientX - rect.left, rect.width)
                    );
                    const v = x / rect.width;
                    setVolume(v);
                    setMuted(v === 0);
                    if (videoRef.current) {
                      videoRef.current.volume = v;
                      videoRef.current.muted = v === 0;
                    }
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    const bar = e.currentTarget;
                    const onMove = (ev: globalThis.MouseEvent) => {
                      const rect = bar.getBoundingClientRect();
                      const x = Math.max(
                        0,
                        Math.min(ev.clientX - rect.left, rect.width)
                      );
                      const v = x / rect.width;
                      setVolume(v);
                      setMuted(v === 0);
                      if (videoRef.current) {
                        videoRef.current.volume = v;
                        videoRef.current.muted = v === 0;
                      }
                    };
                    const onUp = () => {
                      document.removeEventListener("mousemove", onMove);
                      document.removeEventListener("mouseup", onUp);
                    };
                    document.addEventListener("mousemove", onMove);
                    document.addEventListener("mouseup", onUp);
                  }}
                >
                  {/* Track bg */}
                  <div className="absolute left-0 right-0 h-1 group-hover/vol:h-1.5 rounded-full bg-[#ffffff1a] transition-all" />
                  {/* Fill */}
                  <div
                    className="absolute left-0 h-1 group-hover/vol:h-1.5 rounded-full bg-primary transition-all"
                    style={{ width: `${effectiveVolume * 100}%` }}
                  />
                  {/* Thumb */}
                  <div
                    className="absolute w-3 h-3 rounded-full bg-primary shadow-lg shadow-primary/30 -translate-x-1/2 opacity-0 group-hover/vol:opacity-100 transition-opacity"
                    style={{ left: `${effectiveVolume * 100}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Time */}
            <span className="text-foreground/80 text-xs font-mono ml-2 whitespace-nowrap">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Subtitles */}
            {groupedSubtitles.length > 0 && (
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowSubPanel((v) => !v);
                    setShowSettingsPanel(false);
                  }}
                  className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${activeSubtitle ? "bg-primary/20 text-primary" : "text-foreground hover:bg-[#ffffff20]"}`}
                  aria-label="Subtitles"
                >
                  <Captions size={20} strokeWidth={2.5} />
                </button>
              </div>
            )}

            {/* Settings */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSettingsPanel((v) => !v);
                  setShowSubPanel(false);
                  setSettingsTab("main");
                }}
                className="w-9 h-9 flex items-center justify-center rounded-full text-foreground hover:bg-[#ffffff20] transition-colors"
                aria-label="Settings"
              >
                <Settings size={20} strokeWidth={2.5} />
              </button>
            </div>

            {/* Fullscreen */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFullscreen();
              }}
              className="w-9 h-9 flex items-center justify-center rounded-full text-foreground hover:bg-[#ffffff20] transition-colors"
              aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? (
                <Minimize size={20} strokeWidth={2.5} />
              ) : (
                <Maximize size={20} strokeWidth={2.5} />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ─── Subtitle Panel (with grouped duplicates) ─── */}
      {showSubPanel && (
        <div
          data-panel
          className="absolute bottom-20 right-4 md:right-6 z-50 w-64 max-h-72 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/10 hover:[&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full bg-black/80 backdrop-blur-xl rounded-2xl border border-[#ffffff12] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 py-3 border-b border-[#ffffff12]">
            <h3 className="text-foreground text-sm font-sans font-semibold">
              Subtitles
            </h3>
          </div>
          <div className="p-2">
            <button
              onClick={() => {
                setActiveSubtitle(null);
                setShowSubPanel(false);
              }}
              className={`w-full text-left px-3 py-2 rounded-xl text-sm font-sans transition-colors ${!activeSubtitle ? "bg-primary/20 text-primary" : "text-foreground/80 hover:bg-[#ffffff10]"}`}
            >
              Off
            </button>
            {groupedSubtitles.map((sub, i) => (
              <button
                key={`${sub.url}-${i}`}
                onClick={() => {
                  setActiveSubtitle(sub.url);
                  setShowSubPanel(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-xl text-sm font-sans transition-colors ${activeSubtitle === sub.url ? "bg-primary/20 text-primary" : "text-foreground/80 hover:bg-[#ffffff10]"}`}
              >
                {sub.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── Settings Panel ─── */}
      {showSettingsPanel && (
        <div
          data-panel
          className="absolute bottom-20 right-4 md:right-6 z-50 w-72 max-h-96 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/10 hover:[&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full bg-black/80 backdrop-blur-xl rounded-2xl border border-[#ffffff12] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {settingsTab === "main" && (
            <>
              <div className="px-4 py-3 border-b border-[#ffffff12]">
                <h3 className="text-foreground text-sm font-sans font-semibold">
                  Settings
                </h3>
              </div>
              <div className="p-2">
                {serverEntries.length > 0 && (
                  <button
                    onClick={() => setSettingsTab("server")}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-sans text-foreground/90 hover:bg-[#ffffff10] transition-colors"
                  >
                    <span>Change Server</span>
                    <ChevronRight size={16} strokeWidth={2.5} />
                  </button>
                )}
                <button
                  onClick={() => setSettingsTab("colors")}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-sans text-foreground/90 hover:bg-[#ffffff10] transition-colors"
                >
                  <span>Colors</span>
                  <ChevronRight size={16} strokeWidth={2.5} />
                </button>
              </div>
            </>
          )}

          {settingsTab === "server" && (
            <>
              <div className="px-4 py-3 border-b border-[#ffffff12] flex items-center gap-2">
                <button
                  onClick={() => setSettingsTab("main")}
                  className="text-foreground/70 hover:text-foreground transition-colors"
                >
                  <ChevronLeft size={18} strokeWidth={3} />
                </button>
                <h3 className="text-foreground text-sm font-sans font-semibold">
                  Change Server
                </h3>
              </div>
              <div className="p-2">
                {serverEntries.map(([serverName, quals]) => (
                  <div key={serverName} className="mb-2">
                    <div className="px-3 py-1 text-[10px] font-mono font-semibold text-foreground/40 uppercase tracking-widest">
                      {serverName}
                    </div>
                    {quals.map((q, i) => (
                      <button
                        key={`${serverName}-${i}`}
                        onClick={() => {
                          switchServer(q.link);
                          setShowSettingsPanel(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl text-sm font-sans transition-colors ${currentSrc === q.link ? "bg-primary/20 text-primary" : "text-foreground/80 hover:bg-[#ffffff10]"}`}
                      >
                        {q.quality}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}

          {settingsTab === "colors" && (
            <>
              <div className="px-4 py-3 border-b border-[#ffffff12] flex items-center gap-2">
                <button
                  onClick={() => setSettingsTab("main")}
                  className="text-foreground/70 hover:text-foreground transition-colors"
                >
                  <ChevronLeft size={18} strokeWidth={3} />
                </button>
                <h3 className="text-foreground text-sm font-sans font-semibold">
                  Colors
                </h3>
              </div>
              <div className="p-2">
                {/* Presets */}
                <div className="flex gap-2 px-2 mb-3">
                  {COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      onClick={() => {
                        setColorHue(preset.hue);
                        setColorSaturation(preset.saturation);
                        setColorHighlights(preset.highlights);
                        setColorShadows(preset.shadows);
                      }}
                      className="flex-1 px-2 py-1.5 rounded-xl text-xs font-sans font-medium bg-[#ffffff10] hover:bg-primary/20 hover:text-primary text-foreground/80 transition-colors text-center"
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>

                {/* Sliders - styled like seekbar */}
                {[
                  {
                    label: "Hue",
                    value: colorHue,
                    set: setColorHue,
                    min: -180,
                    max: 180,
                  },
                  {
                    label: "Saturation",
                    value: colorSaturation,
                    set: setColorSaturation,
                    min: 0,
                    max: 200,
                  },
                  {
                    label: "Highlights",
                    value: colorHighlights,
                    set: setColorHighlights,
                    min: 50,
                    max: 150,
                  },
                  {
                    label: "Shadows",
                    value: colorShadows,
                    set: setColorShadows,
                    min: 50,
                    max: 150,
                  },
                ].map((s) => {
                  const range = s.max - s.min;
                  const pct = ((s.value - s.min) / range) * 100;
                  return (
                    <div key={s.label} className="px-3 mb-2.5">
                      <div className="flex justify-between mb-1">
                        <span className="text-xs font-sans text-foreground/60">
                          {s.label}
                        </span>
                        <span className="text-xs font-mono text-foreground/40">
                          {s.value}
                        </span>
                      </div>
                      <div
                        className="relative h-5 flex items-center cursor-pointer group/slider"
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          const x = Math.max(
                            0,
                            Math.min(e.clientX - rect.left, rect.width)
                          );
                          s.set(Math.round(s.min + (x / rect.width) * range));
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          const bar = e.currentTarget;
                          const onMove = (ev: globalThis.MouseEvent) => {
                            const rect = bar.getBoundingClientRect();
                            const x = Math.max(
                              0,
                              Math.min(ev.clientX - rect.left, rect.width)
                            );
                            s.set(
                              Math.round(s.min + (x / rect.width) * range)
                            );
                          };
                          const onUp = () => {
                            document.removeEventListener("mousemove", onMove);
                            document.removeEventListener("mouseup", onUp);
                          };
                          document.addEventListener("mousemove", onMove);
                          document.addEventListener("mouseup", onUp);
                        }}
                      >
                        <div className="absolute left-0 right-0 h-1 group-hover/slider:h-1.5 rounded-full bg-[#ffffff1a] transition-all" />
                        <div
                          className="absolute left-0 h-1 group-hover/slider:h-1.5 rounded-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                        <div
                          className="absolute w-2.5 h-2.5 rounded-full bg-primary shadow-lg shadow-primary/30 -translate-x-1/2 opacity-0 group-hover/slider:opacity-100 transition-opacity"
                          style={{ left: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                <button
                  onClick={() => {
                    setColorHue(0);
                    setColorSaturation(100);
                    setColorHighlights(100);
                    setColorShadows(100);
                  }}
                  className="w-full px-3 py-2 rounded-xl text-xs font-sans text-foreground/60 hover:text-foreground hover:bg-[#ffffff10] transition-colors"
                >
                  Reset to Default
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Veox watermark */}
      <div className="absolute top-4 right-5 z-10 pointer-events-none opacity-30">
        <span className="text-foreground text-[11px] font-sans font-bold tracking-[0.2em] uppercase">
          Veox
        </span>
      </div>
    </div>
  );
}

/* ─── Preview Frame component ─── */
function PreviewFrame({
  canvasRef,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}) {
  const localRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const srcCanvas = canvasRef.current;
    const destCanvas = localRef.current;
    if (!srcCanvas || !destCanvas) return;
    const ctx = destCanvas.getContext("2d");
    if (!ctx) return;

    // Poll for frame data instead of fixed timeout
    let attempts = 0;
    const tryDraw = () => {
      ctx.drawImage(srcCanvas, 0, 0, destCanvas.width, destCanvas.height);
      attempts++;
      if (attempts < 5) {
        animRef.current = requestAnimationFrame(tryDraw);
      }
    };
    // Initial delay then start polling
    const t = setTimeout(tryDraw, 100);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(animRef.current);
    };
  }, [canvasRef]);

  // Re-render continuously to pick up new frames
  useEffect(() => {
    const srcCanvas = canvasRef.current;
    const destCanvas = localRef.current;
    if (!srcCanvas || !destCanvas) return;
    const ctx = destCanvas.getContext("2d");
    if (!ctx) return;

    let running = true;
    const loop = () => {
      if (!running) return;
      ctx.drawImage(srcCanvas, 0, 0, destCanvas.width, destCanvas.height);
      animRef.current = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
    };
  }, [canvasRef]);

  return (
    <canvas
      ref={localRef}
      width={160}
      height={90}
      className="w-full h-full"
    />
  );
}

/* ─── Simple VTT parser ─── */
function parseVTT(text: string) {
  const cues: { start: number; end: number; text: string }[] = [];
  const blocks = text.split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.trim().split("\n");
    for (let i = 0; i < lines.length; i++) {
      const timeLine = lines[i];
      if (timeLine.includes("-->")) {
        const [startStr, endStr] = timeLine.split("-->");
        const start = parseVTTTime(startStr.trim());
        const end = parseVTTTime(endStr.trim());
        const textLines = lines
          .slice(i + 1)
          .join("\n")
          .replace(/<[^>]+>/g, "")
          .trim();
        if (textLines && !isNaN(start) && !isNaN(end)) {
          cues.push({ start, end, text: textLines });
        }
        break;
      }
    }
  }
  return cues;
}

function parseVTTTime(str: string) {
  const parts = str.split(":");
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return (
      parseInt(h) * 3600 +
      parseInt(m) * 60 +
      parseFloat(s.replace(",", "."))
    );
  } else if (parts.length === 2) {
    const [m, s] = parts;
    return parseInt(m) * 60 + parseFloat(s.replace(",", "."));
  }
  return 0;
}
