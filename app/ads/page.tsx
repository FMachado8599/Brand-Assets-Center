import type { Metadata } from "next";
import { AdsShell } from "@/components/ads/AdsShell";

export const metadata: Metadata = {
  title: "Ads",
  description: "Mirá tu anuncio como sale en Reels, con todo lo que Instagram pone encima.",
};

export default function AdsPage() {
  return <AdsShell />;
}
