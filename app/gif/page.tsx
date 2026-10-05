import type { Metadata } from "next";
import { GifShell } from "@/components/gif/GifShell";
import { ConfirmProvider } from "@/components/ui/confirm";

export const metadata: Metadata = {
  title: "GIF",
  description: "Banners animados a partir de frames: se agrupan por medida y se exportan en un ZIP.",
};

export default function GifPage() {
  return (
    <ConfirmProvider>
      <GifShell />
    </ConfirmProvider>
  );
}
