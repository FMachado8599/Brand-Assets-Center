import type { Metadata } from "next";
import { LibraryHub } from "@/components/library/LibraryHub";

export const metadata: Metadata = {
  title: "Librerías",
  description: "Emojis, GIFs e íconos para copiar o bajar.",
};

export default function LibraryPage() {
  return <LibraryHub />;
}
