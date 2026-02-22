"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import VeoxPlayer from "@/components/veox-player";

function StreamContent() {
  const searchParams = useSearchParams();
  const link = searchParams.get("link") || "";
  const title = searchParams.get("title") || "Veox Stream";

  if (!link) {
    return (
      <div className="w-screen h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-foreground text-2xl font-sans font-bold mb-2">No Stream URL</h1>
          <p className="text-muted-foreground text-sm font-sans">
            {'Provide a stream link via ?link={url}'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-black">
      <VeoxPlayer src={link} title={title} />
    </div>
  );
}

export default function StreamPage() {
  return (
    <Suspense
      fallback={
        <div className="w-screen h-screen bg-background flex items-center justify-center">
          <LoadingSpinner />
        </div>
      }
    >
      <StreamContent />
    </Suspense>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      <span className="text-muted-foreground text-sm font-sans">Loading stream...</span>
    </div>
  );
}
