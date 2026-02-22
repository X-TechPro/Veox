"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import VeoxPlayer, {
  type SubtitleTrack,
  type QualityItem,
} from "@/components/veox-player";

interface ShowboxData {
  title: string;
  defaultLink: string | null;
  qualities: Record<string, QualityItem[] | SubtitleTrack[]>;
  subtitles: SubtitleTrack[];
}

function ShowboxContent() {
  const searchParams = useSearchParams();
  const tmdb = searchParams.get("tmdb") || searchParams.get("id") || "";
  const type = searchParams.get("type") || "1";
  const season = searchParams.get("s") || searchParams.get("season") || "";
  const episode = searchParams.get("e") || searchParams.get("episode") || "";
  const api = searchParams.get("api") || "";

  const [data, setData] = useState<ShowboxData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tmdb) {
      setError("Missing tmdb query parameter");
      setLoading(false);
      return;
    }

    const params = new URLSearchParams();
    params.set("tmdb", tmdb);
    if (type) params.set("type", type);
    if (season) params.set("s", season);
    if (episode) params.set("e", episode);
    if (api) params.set("api", api);

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/showbox?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Server error ${res.status}`);
        }
        const json: ShowboxData = await res.json();
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tmdb, type, season, episode, api]);

  if (loading) {
    return (
      <div className="w-screen h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-5">
          <div className="relative">
            <div className="w-14 h-14 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-primary/10 border-b-primary/60 rounded-full animate-spin" style={{ animationDirection: "reverse", animationDuration: "0.8s" }} />
            </div>
          </div>
          <div className="text-center">
            <p className="text-foreground text-sm font-sans font-semibold tracking-wide mb-1">
              VEOX
            </p>
            <p className="text-muted-foreground text-xs font-sans">
              Fetching stream sources...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-screen h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-destructive">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h1 className="text-foreground text-lg font-sans font-bold mb-2">Stream Error</h1>
          <p className="text-muted-foreground text-sm font-sans">{error}</p>
        </div>
      </div>
    );
  }

  if (!data || !data.defaultLink) {
    return (
      <div className="w-screen h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-foreground text-lg font-sans font-bold mb-2">No Streams Found</h1>
          <p className="text-muted-foreground text-sm font-sans">No playable stream was returned for this title.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-black">
      <VeoxPlayer
        src={data.defaultLink}
        title={data.title}
        subtitles={data.subtitles}
        qualities={data.qualities}
      />
    </div>
  );
}

export default function ShowboxPage() {
  return (
    <Suspense
      fallback={
        <div className="w-screen h-screen bg-background flex items-center justify-center">
          <div className="flex flex-col items-center gap-5">
            <div className="w-14 h-14 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
            <div className="text-center">
              <p className="text-foreground text-sm font-sans font-semibold tracking-wide mb-1">
                VEOX
              </p>
              <p className="text-muted-foreground text-xs font-sans">Loading...</p>
            </div>
          </div>
        </div>
      }
    >
      <ShowboxContent />
    </Suspense>
  );
}
