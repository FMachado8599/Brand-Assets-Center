import type { Metadata } from "next";
import { DownloadsShell } from "@/components/downloads/DownloadsShell";

export const metadata: Metadata = {
  title: "Descargas",
  description: "Bajá videos y posteos de Instagram y Pinterest.",
};

export default function DescargasPage() {
  return <DownloadsShell />;
}
