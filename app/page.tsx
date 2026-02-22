"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Film } from "lucide-react";

export default function HomePage() {
  const router = useRouter();
  const [streamUrl, setStreamUrl] = useState("");
  const [tmdbId, setTmdbId] = useState("");
  const [apiKey, setApiKey] = useState("");

  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-16">
      {/* Logo / Header */}
      <div className="mb-12 text-center">
        <h1 className="text-foreground text-5xl md:text-7xl font-sans font-bold tracking-tight mb-3">
          Veox
        </h1>
        <p className="text-muted-foreground text-sm md:text-base font-sans max-w-md mx-auto leading-relaxed">
          A premium video player. Stream any media link or browse by TMDB ID.
        </p>
      </div>

      {/* Cards */}
      <div className="w-full max-w-2xl flex flex-col gap-6">
        {/* Stream card */}
        <div className="bg-card rounded-2xl border border-border p-6 md:p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Play size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-foreground text-lg font-sans font-semibold">Direct Stream</h2>
              <p className="text-muted-foreground text-xs font-sans">Play any MP4 or M3U8 link</p>
            </div>
          </div>
          <div className="flex gap-3">
            <input
              type="url"
              placeholder="Paste stream URL..."
              value={streamUrl}
              onChange={(e) => setStreamUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && streamUrl.trim()) {
                  router.push(`/stream?link=${encodeURIComponent(streamUrl.trim())}`);
                }
              }}
              className="flex-1 bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm font-sans text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
            />
            <button
              onClick={() => {
                if (streamUrl.trim()) {
                  router.push(`/stream?link=${encodeURIComponent(streamUrl.trim())}`);
                }
              }}
              className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-sans font-semibold hover:bg-primary/90 transition-colors"
            >
              Play
            </button>
          </div>
        </div>

        {/* ShowBox card */}
        <div className="bg-card rounded-2xl border border-border p-6 md:p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Film size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-foreground text-lg font-sans font-semibold">ShowBox Lookup</h2>
              <p className="text-muted-foreground text-xs font-sans">Search by TMDB movie or TV ID</p>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <input
              type="text"
              placeholder="TMDB ID (e.g., 550)"
              value={tmdbId}
              onChange={(e) => setTmdbId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && tmdbId.trim() && apiKey.trim()) {
                  router.push(`/showbox?tmdb=${tmdbId.trim()}&api=${encodeURIComponent(apiKey.trim())}`);
                }
              }}
              className="flex-1 bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm font-sans text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
            />
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="API key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && tmdbId.trim() && apiKey.trim()) {
                    router.push(`/showbox?tmdb=${tmdbId.trim()}&api=${encodeURIComponent(apiKey.trim())}`);
                  }
                }}
                className="flex-1 bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm font-sans text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
              />
              <button
                onClick={() => {
                  if (tmdbId.trim() && apiKey.trim()) {
                    router.push(`/showbox?tmdb=${tmdbId.trim()}&api=${encodeURIComponent(apiKey.trim())}`);
                  }
                }}
                className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-sans font-semibold hover:bg-primary/90 transition-colors"
              >
                Watch
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Endpoints info */}
      <div className="mt-12 w-full max-w-2xl">
        <div className="bg-secondary/50 rounded-2xl border border-border p-5 md:p-6">
          <h3 className="text-foreground text-sm font-sans font-semibold mb-3">API Endpoints</h3>
          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-3">
              <code className="text-primary text-xs font-mono bg-primary/10 px-2 py-0.5 rounded-lg shrink-0">GET</code>
              <code className="text-foreground/80 text-xs font-mono break-all">{'/stream?link={media_url}'}</code>
            </div>
            <div className="flex items-start gap-3">
              <code className="text-primary text-xs font-mono bg-primary/10 px-2 py-0.5 rounded-lg shrink-0">GET</code>
              <code className="text-foreground/80 text-xs font-mono break-all">{'/showbox?tmdb={tmdb_id}&api={api_key}'}</code>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <p className="mt-10 text-muted-foreground/50 text-[11px] font-sans tracking-widest uppercase">
        Veox Player
      </p>
    </main>
  );
}
