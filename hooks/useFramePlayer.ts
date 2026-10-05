"use client";

import { useEffect, useState } from "react";
import { frameDuration } from "@/lib/gif/parse";
import type { Frame, GifSettings } from "@/lib/gif/types";

/** Recorre los frames respetando la duración de cada uno: una vista previa sin generar el GIF. */
export function useFramePlayer(frames: Frame[], settings: GifSettings, playing: boolean) {
  const [index, setIndex] = useState(0);
  const count = frames.length;

  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [count, index]);

  useEffect(() => {
    if (!playing || count < 2) return;
    const current = frames[Math.min(index, count - 1)];
    const timer = setTimeout(() => setIndex((i) => (i + 1) % count), frameDuration(current, settings));
    return () => clearTimeout(timer);
  }, [playing, index, frames, count, settings]);

  return { index: Math.min(index, Math.max(0, count - 1)), setIndex };
}
