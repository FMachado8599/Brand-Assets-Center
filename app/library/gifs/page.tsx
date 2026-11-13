import type { Metadata } from "next";
import { GifsShell } from "@/components/library/gifs/GifsShell";
import { hasGiphyKey } from "@/lib/library/giphy.server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "GIFs",
  description: "GIFs y stickers de GIPHY para copiar o bajar en GIF, MP4 o WEBP.",
};

export default function GifsPage() {
  return <GifsShell configured={hasGiphyKey()} />;
}
